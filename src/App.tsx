import { useCallback, useDeferredValue, useEffect, useMemo, useState, startTransition } from "react"
import {
  ClockCounterClockwiseIcon,
  CompassIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  MapTrifoldIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
} from "@phosphor-icons/react"

import { DestinationPicker } from "@/components/destination-picker"
import { ComparisonWorkspace } from "@/components/comparison-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  getBrowserState,
  normalizeCode,
  saveCustomCodes,
  saveEnabledCodes,
  saveFavoriteCodes,
  saveHistory,
  savePresets,
  saveSelectedProperty,
  type SearchHistoryEntry,
  type StoredCustomCode,
  type StoredPreset,
} from "@/lib/browser-store"
import {
  codeLabel,
  formatDateTime,
  mergeCodes,
  mergePresets,
  summarizeProperties,
  uniqueCodes,
  type CatalogCode,
  type CatalogPreset,
  type CodeResult,
  type SearchJob,
} from "@/lib/transform"
import { addDaysToLocalDate, getLocalDate, normalizeStayDates } from "@/lib/destinations"
import logo from "../logo.jpg"

type BootstrapPayload = {
  codes: CatalogCode[]
  presets: CatalogPreset[]
}

type ViewKey = "search" | "results" | "library" | "history"

const searchPollDelayMs = 750

async function apiFetch<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, options)
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok) {
    throw new Error(data.error || "Request failed")
  }
  return data
}

function buildHistoryEntry(job: SearchJob): SearchHistoryEntry {
  const properties = summarizeProperties(job.results)
  return {
    id: job.id,
    createdAt: job.completedAt || job.updatedAt,
    destination: [job.params.city, job.params.country].filter(Boolean).join(", "),
    city: job.params.city,
    country: job.params.country,
    checkIn: job.params.checkIn,
    checkOut: job.params.checkOut,
    codes: job.params.codes.filter((code) => code !== "BASELINE"),
    propertyCount: properties.length,
    bestSavings: properties.reduce((best, property) => Math.max(best, property.savings), 0),
    topWinningCode:
      properties.find((property) => property.bestCode && property.bestCode !== "BASELINE")?.bestCode || null,
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>("search")
  const [city, setCity] = useState("Las Vegas")
  const [country, setCountry] = useState("US")
  const [checkIn, setCheckIn] = useState(() => getLocalDate())
  const [checkOut, setCheckOut] = useState(() => getLocalDate(1))
  const [codes, setCodes] = useState<Array<CatalogCode & { favorite?: boolean; custom?: boolean }>>([])
  const [codesReady, setCodesReady] = useState(false)
  const [presets, setPresets] = useState<StoredPreset[]>([])
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [favoriteCodes, setFavoriteCodes] = useState<string[]>([])
  const [customCodes, setCustomCodes] = useState<StoredCustomCode[]>([])
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [job, setJob] = useState<SearchJob | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [showUnavailableRates, setShowUnavailableRates] = useState(false)
  const [propertyQuery, setPropertyQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [codeSearch, setCodeSearch] = useState("")
  const [newCode, setNewCode] = useState("")
  const [newCodeCompany, setNewCodeCompany] = useState("")
  const [newPresetName, setNewPresetName] = useState("")
  const deferredCodeSearch = useDeferredValue(codeSearch)

  useEffect(() => {
    async function bootstrap() {
      const browser = getBrowserState()
      const payload = await apiFetch<BootstrapPayload>("/api/bootstrap")
      const mergedCodes = mergeCodes(payload.codes, browser.customCodes as CatalogCode[], browser.favoriteCodes)
      const allCodeValues = mergedCodes.map((code) => code.code)
      const recommendedCodes = mergedCodes.filter((code) => code.recommended).map((code) => code.code)
      const defaultPresets = [
        {
          id: "all-codes",
          name: "All Codes",
          codes: allCodeValues,
          isDefault: true,
          dynamic: "all",
        },
        ...payload.presets,
      ]

      setCodes(mergedCodes)
      setCustomCodes(browser.customCodes)
      setFavoriteCodes(browser.favoriteCodes)
      const quickPreset = payload.presets.find((preset) => preset.id === "quick10")
      setSelectedCodes(browser.enabledCodes.length ? browser.enabledCodes : quickPreset?.codes || recommendedCodes)
      setPresets(mergePresets(defaultPresets, browser.presets, recommendedCodes, allCodeValues))
      setHistory(browser.history)
      setSelectedProperty(browser.selectedProperty)
      setCodesReady(true)
    }

    bootstrap().catch((caughtError: Error) => {
      setError(caughtError.message)
    })
  }, [])

  const codeCompanies = useMemo(() => Object.fromEntries(codes.map((code) => [code.code, code.company])), [codes])
  const properties = useMemo(() => (job ? summarizeProperties(job.results, codeCompanies) : []), [job, codeCompanies])
  const visibleProperties = useMemo(() => {
    const term = propertyQuery.trim().toLowerCase()
    return term
      ? properties.filter(
          (property) => property.name.toLowerCase().includes(term) || property.brandName.toLowerCase().includes(term),
        )
      : properties
  }, [properties, propertyQuery])
  const filteredCodes = useMemo(() => {
    const term = deferredCodeSearch.trim().toLowerCase()
    return codes.filter((code) => {
      if (!term) return true
      return code.code.toLowerCase().includes(term) || code.company.toLowerCase().includes(term)
    })
  }, [codes, deferredCodeSearch])

  const selectedPresetId = useMemo(() => {
    const normalizedSelected = uniqueCodes(selectedCodes)
    const matched = presets.find((preset) => {
      const presetCodes = uniqueCodes(preset.codes)
      return (
        presetCodes.length === normalizedSelected.length &&
        presetCodes.every((code, index) => code === normalizedSelected[index])
      )
    })
    return matched?.id ?? ""
  }, [presets, selectedCodes])

  const codeProgress = useMemo(() => {
    if (job?.codeStates)
      return Object.entries(job.codeStates)
        .filter(([code]) => code !== "BASELINE")
        .map(([code, state]) => ({
          code,
          status: state.status === "completed" ? "done" : state.status === "failed" ? "failed" : state.status,
        }))
    const finished = new Map((job?.results || []).map((result) => [result.code, result]))
    const running = new Set(job?.progress?.runningCodes || [])
    return (job?.params.codes || [])
      .filter((code) => code !== "BASELINE")
      .map((code) => {
        const result = finished.get(code)
        if (result)
          return {
            code,
            status: result.success || result.error === "NO_RESULTS" ? "done" : "failed",
          }
        return { code, status: running.has(code) ? "running" : "queued" }
      })
  }, [job])

  function updateFavorites(nextFavorites: string[]) {
    setFavoriteCodes(nextFavorites)
    saveFavoriteCodes(nextFavorites)
    setCodes((current) =>
      current.map((code) => ({
        ...code,
        favorite: nextFavorites.includes(code.code),
      })),
    )
  }

  function updateSelected(nextCodes: string[]) {
    const normalized = uniqueCodes(nextCodes)
    setSelectedCodes(normalized)
    saveEnabledCodes(normalized)
  }

  function handlePresetApply(preset: StoredPreset) {
    updateSelected(preset.codes)
  }

  const focusProperty = useCallback((key: string) => {
    setSelectedProperty(key)
    saveSelectedProperty(key)
  }, [])

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Read the submitted controls rather than relying only on React state. This avoids
    // a fast click after editing a date from submitting the value from the prior render.
    const formData = new FormData(event.currentTarget)
    const submittedDates = normalizeStayDates(
      String(formData.get("checkIn") || ""),
      String(formData.get("checkOut") || ""),
    )
    const submittedParams = {
      city: String(formData.get("city") || "").trim(),
      country: String(formData.get("country") || ""),
      ...submittedDates,
    }
    setCity(submittedParams.city)
    setCountry(submittedParams.country)
    setCheckIn(submittedParams.checkIn)
    setCheckOut(submittedParams.checkOut)
    void runSearch(undefined, submittedParams)
  }

  async function runSearch(
    codesOverride?: string[],
    submittedParams?: {
      city: string
      country: string
      checkIn: string
      checkOut: string
    },
  ) {
    const searchCity = submittedParams?.city ?? city
    const searchCountry = submittedParams?.country ?? country
    const normalizedDates = normalizeStayDates(
      submittedParams?.checkIn ?? checkIn,
      submittedParams?.checkOut ?? checkOut,
    )
    const searchCheckIn = normalizedDates.checkIn
    const searchCheckOut = normalizedDates.checkOut

    if (!searchCity.trim()) {
      setError("Choose a destination before running a search")
      return
    }
    if (!searchCheckIn || !searchCheckOut || searchCheckOut <= searchCheckIn) {
      setError("Check-out must be at least one day after check-in")
      return
    }
    if (!(codesOverride || selectedCodes).length) {
      setError("Choose at least one code before running a search")
      return
    }
    setIsSearching(true)
    setError(null)

    try {
      const runCodes = uniqueCodes(["BASELINE", ...(codesOverride || selectedCodes)])
      const startedAt = new Date().toISOString()
      const params = {
        city: searchCity,
        country: searchCountry,
        checkIn: searchCheckIn,
        checkOut: searchCheckOut,
        codes: runCodes,
      }
      const localJob: SearchJob = {
        id: crypto.randomUUID(),
        status: "running",
        createdAt: startedAt,
        updatedAt: startedAt,
        completedAt: null,
        params,
        failedCodes: [],
        results: [],
        progress: {
          totalCodes: runCodes.length,
          completedCodes: 0,
          successfulCodes: 0,
          failedCodes: 0,
          queuedCodes: runCodes.length,
          workerLimit: 2,
        },
        codeStates: Object.fromEntries(
          runCodes.map((code) => [code, { status: "queued" as const, attempts: 0, error: null }]),
        ),
      }
      startTransition(() => {
        setJob(localJob)
        setSelectedProperty(null)
        setActiveView("results")
      })
      const results: CodeResult[] = []
      let nextIndex = 0
      const worker = async () => {
        while (true) {
          const index = nextIndex++
          const code = runCodes[index]
          if (!code) return
          localJob.codeStates![code] = {
            status: "running",
            attempts: 1,
            error: null,
          }
          try {
            results[index] = await apiFetch<CodeResult>("/api/search-code", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...params, code }),
            })
          } catch (error) {
            results[index] = {
              code,
              success: false,
              error: error instanceof Error ? error.message : "Request failed",
              hotels: [],
              url: "",
            }
          }
          const result = results[index]
          localJob.codeStates![code] = {
            status: result.success || result.error === "NO_RESULTS" ? "completed" : "failed",
            attempts: 1,
            error: result.success || result.error === "NO_RESULTS" ? null : result.error,
          }
          const completed = results.filter(Boolean)
          localJob.results = completed
          localJob.updatedAt = new Date().toISOString()
          localJob.progress = {
            ...localJob.progress,
            completedCodes: completed.length,
            successfulCodes: completed.filter((item) => item.success || item.error === "NO_RESULTS").length,
            failedCodes: completed.filter((item) => !item.success && item.error !== "NO_RESULTS").length,
            queuedCodes: runCodes.length - completed.length,
          }
          setJob({
            ...localJob,
            results: [...completed],
            codeStates: { ...localJob.codeStates },
          })
        }
      }
      await Promise.all(Array.from({ length: Math.min(2, runCodes.length) }, worker))
      const nextJob: SearchJob = {
        ...localJob,
        status: "completed",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        results: results.filter(Boolean),
        failedCodes: results.filter((item) => !item.success && item.error !== "NO_RESULTS").map((item) => item.code),
        progress: {
          ...localJob.progress,
          completedCodes: runCodes.length,
          queuedCodes: 0,
        },
      }
      const nextProperties = summarizeProperties(nextJob.results, codeCompanies)
      const firstProperty = nextProperties[0]?.key || null
      const nextHistory = [buildHistoryEntry(nextJob), ...history.filter((entry) => entry.id !== nextJob.id)].slice(
        0,
        10,
      )

      startTransition(() => {
        setJob(nextJob)
        setHistory(nextHistory)
        saveHistory(nextHistory)
        setSelectedProperty(firstProperty)
        saveSelectedProperty(firstProperty)
      })
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Search failed")
    } finally {
      setIsSearching(false)
    }
  }

  async function handleRetryFailed() {
    if (!job?.failedCodes.length) return
    setIsSearching(true)
    setError(null)

    try {
      const queuedRetry = await apiFetch<SearchJob>(`/api/search-jobs/${job.id}/retry-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          params: {
            ...job.params,
            codes: job.failedCodes,
          },
          baseResults: job.results.filter((result) => result.success || result.error === "NO_RESULTS"),
        }),
      })

      startTransition(() => {
        setJob(queuedRetry)
      })

      void driveSearchJob(queuedRetry.id)

      const retried = queuedRetry.status === "completed" ? queuedRetry : await pollSearchJob(queuedRetry.id)
      const nextProperties = summarizeProperties(retried.results, codeCompanies)
      const nextHistory = [buildHistoryEntry(retried), ...history.filter((entry) => entry.id !== retried.id)].slice(
        0,
        10,
      )

      startTransition(() => {
        setJob(retried)
        setHistory(nextHistory)
        saveHistory(nextHistory)
        if (!selectedProperty && nextProperties[0]?.key) {
          setSelectedProperty(nextProperties[0].key)
          saveSelectedProperty(nextProperties[0].key)
        }
      })
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Retry failed")
    } finally {
      setIsSearching(false)
    }
  }

  async function pollSearchJob(jobId: string) {
    while (true) {
      const nextJob = await apiFetch<SearchJob>(`/api/search-jobs/${jobId}`)
      setJob(nextJob)

      if (nextJob.status === "completed") {
        return nextJob
      }

      if (nextJob.status === "failed") {
        throw new Error(nextJob.error || "Search failed")
      }

      await new Promise((resolve) => window.setTimeout(resolve, searchPollDelayMs))
    }
  }

  async function driveSearchJob(jobId: string) {
    const worker = async () => {
      while (true) {
        const next = await apiFetch<SearchJob>(`/api/search-jobs/${jobId}/next`, { method: "POST" })
        if (next.status === "completed" || next.status === "cancelled") return
        if (!next.progress.queuedCodes) return
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
  }

  async function handleCancelSearch() {
    if (!job) return
    try {
      const cancelled = await apiFetch<SearchJob>(`/api/search-jobs/${job.id}/cancel`, { method: "POST" })
      setJob(cancelled)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not cancel search")
    }
  }

  function handleCheckInChange(value: string) {
    const normalized = normalizeStayDates(value, checkOut)
    setCheckIn(normalized.checkIn)
    setCheckOut(normalized.checkOut)
  }

  function handleCheckOutChange(value: string) {
    setCheckOut(normalizeStayDates(checkIn, value).checkOut)
  }

  function handleRestoreHistory(entry: SearchHistoryEntry) {
    const normalized = normalizeStayDates(entry.checkIn, entry.checkOut)
    setCity(entry.city)
    setCountry(entry.country)
    setCheckIn(normalized.checkIn)
    setCheckOut(normalized.checkOut)
    updateSelected(entry.codes)
    setActiveView("search")
  }

  function toggleCodeSelection(code: string, checked: boolean) {
    updateSelected(checked ? [...selectedCodes, code] : selectedCodes.filter((item) => item !== code))
  }

  function toggleFavorite(code: string) {
    updateFavorites(
      favoriteCodes.includes(code) ? favoriteCodes.filter((item) => item !== code) : [...favoriteCodes, code],
    )
  }

  function handleAddCustomCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = normalizeCode(newCode)
    if (!code) return

    const nextCustomCodes = [{ code, company: newCodeCompany || "Personal code" }, ...customCodes].filter(
      (value, index, array) => array.findIndex((item) => item.code === value.code) === index,
    )
    const nextCodes = mergeCodes(
      codes.filter((item) => !item.custom),
      nextCustomCodes,
      favoriteCodes,
    )

    setCustomCodes(nextCustomCodes)
    setCodes(nextCodes)
    saveCustomCodes(nextCustomCodes)
    setNewCode("")
    setNewCodeCompany("")
  }

  function handleSavePreset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newPresetName.trim() || !selectedCodes.length) return

    const browser = getBrowserState()
    const nextCustomPresets = [
      {
        id: `custom-${Date.now()}`,
        name: newPresetName.trim(),
        codes: selectedCodes,
        isDefault: false,
        dynamic: null,
      },
      ...browser.presets,
    ]

    setPresets(
      mergePresets(
        presets.filter((preset) => preset.isDefault),
        nextCustomPresets,
        codes.filter((code) => code.recommended).map((code) => code.code),
        codes.map((code) => code.code),
      ),
    )
    savePresets(nextCustomPresets)
    setNewPresetName("")
  }

  const selectedPresetName = selectedPresetId
    ? presets.find((preset) => preset.id === selectedPresetId)?.name || "Saved rate set"
    : "Custom rate set"

  return (
    <div className="rw-app-shell min-h-screen text-foreground">
      <div className="rw-workspace min-h-screen w-full">
        <header className="rw-topbar">
          <button className="rw-brand" onClick={() => setActiveView("search")} type="button">
            <img alt="Ritz-Weaselton crest" className="rw-brand-logo" src={logo} />
            <span className="rw-brand-copy">
              <strong>Ritz-Weaselton</strong>
              <small>Rate intelligence for better stays.</small>
            </span>
          </button>
          <nav aria-label="Ritz-Weaselton sections" className="rw-nav">
            <Button
              className="rw-nav-item"
              onClick={() => setActiveView("search")}
              variant={activeView === "search" ? "default" : "ghost"}
            >
              <HouseIcon weight="duotone" /> Search stays
            </Button>
            <Button
              className="rw-nav-item"
              disabled={!job}
              onClick={() => setActiveView("results")}
              variant={activeView === "results" ? "default" : "ghost"}
            >
              <MapTrifoldIcon weight="duotone" /> Comparison desk
            </Button>
            <Button
              className="rw-nav-item"
              onClick={() => setActiveView("library")}
              variant={activeView === "library" ? "default" : "ghost"}
            >
              <SlidersHorizontalIcon weight="duotone" /> Code library
            </Button>
            <Button
              className="rw-nav-item"
              onClick={() => setActiveView("history")}
              variant={activeView === "history" ? "default" : "ghost"}
            >
              <ClockCounterClockwiseIcon weight="duotone" /> Search history
            </Button>
          </nav>
          <div className="rw-rail-note">
            <SparkleIcon weight="fill" />
            <p>Rates are requested live from Marriott. Your codes stay in this browser.</p>
          </div>
        </header>

        <main className="rw-stage">
          {activeView === "search" ? (
            <section className="rw-search-view">
              <header className="rw-search-masthead">
                <div className="rw-eyebrow">
                  <CompassIcon weight="fill" /> Marriott price map
                </div>
                <h1>
                  Find the lowest rate.
                  <br />
                  <em>See what&apos;s nearby.</em>
                </h1>
                <p>
                  Search live Marriott prices, start with the cheapest stay, then compare every nearby option on the
                  map.
                </p>
                <div className="rw-proof">
                  <span>Live Marriott rates</span>
                  <span>Lowest price first</span>
                  <span>Map-first results</span>
                </div>
              </header>

              <Card className="rw-search-card">
                <CardContent>
                  <form className="rw-search-form" onSubmit={handleSearchSubmit}>
                    <div className="rw-trip-grid">
                      <Field className="rw-destination-field">
                        <FieldLabel htmlFor="city">Destination</FieldLabel>
                        <FieldContent>
                          <DestinationPicker
                            onChange={(nextCity, nextCountry) => {
                              setCity(nextCity)
                              setCountry(nextCountry)
                            }}
                            value={city}
                          />
                          <input name="country" type="hidden" value={country} />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="checkIn">Check-in</FieldLabel>
                        <FieldContent>
                          <Input
                            id="checkIn"
                            lang="en-AU"
                            min={getLocalDate()}
                            name="checkIn"
                            onChange={(event) => handleCheckInChange(event.target.value)}
                            type="date"
                            value={checkIn}
                          />
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="checkOut">Check-out</FieldLabel>
                        <FieldContent>
                          <Input
                            id="checkOut"
                            lang="en-AU"
                            min={addDaysToLocalDate(checkIn)}
                            name="checkOut"
                            onChange={(event) => handleCheckOutChange(event.target.value)}
                            type="date"
                            value={checkOut}
                          />
                        </FieldContent>
                      </Field>
                      <Button
                        className="rw-submit"
                        disabled={isSearching || !codesReady || !selectedCodes.length}
                        type="submit"
                      >
                        <MagnifyingGlassIcon data-icon="inline-start" />
                        {isSearching ? "Searching" : !codesReady ? "Loading rates" : "Find cheapest rates"}
                      </Button>
                    </div>

                    <div className="rw-rate-strip">
                      <div className="rw-rate-summary">
                        <span className="rw-rate-icon">
                          <SlidersHorizontalIcon weight="duotone" />
                        </span>
                        <span>
                          <small>Rate set</small>
                          <strong>{codesReady ? selectedPresetName : "Preparing rate codes"}</strong>
                        </span>
                        <Badge variant="secondary">{codesReady ? `${selectedCodes.length} codes` : "Loading"}</Badge>
                      </div>
                      <div className="rw-rate-preview" aria-label="Selected rate codes">
                        {selectedCodes.slice(0, 3).map((code) => (
                          <span key={code}>{codeLabel(code)}</span>
                        ))}
                        {selectedCodes.length > 3 ? <span>+{selectedCodes.length - 3}</span> : null}
                      </div>
                      <Button onClick={() => setActiveView("library")} size="sm" type="button" variant="ghost">
                        Customize
                      </Button>
                    </div>
                    {error ? (
                      <p aria-live="polite" className="rw-form-error">
                        {error}
                      </p>
                    ) : null}
                  </form>
                </CardContent>
              </Card>

              {history.length ? (
                <section className="rw-recent-searches">
                  <div className="rw-recent-heading">
                    <div>
                      <span>Recent stays</span>
                      <strong>Search again</strong>
                    </div>
                    <Button onClick={() => setActiveView("history")} size="sm" variant="ghost">
                      View history
                    </Button>
                  </div>
                  <div className="rw-recent-list">
                    {history.slice(0, 3).map((entry) => (
                      <button key={entry.id} onClick={() => handleRestoreHistory(entry)} type="button">
                        <strong>{entry.destination}</strong>
                        <span>
                          {entry.propertyCount} hotels · {entry.codes.length} codes
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          {activeView === "results" ? (
            <ComparisonWorkspace
              codeProgress={codeProgress}
              isSearching={isSearching}
              job={job}
              onBack={() => setActiveView("search")}
              onCancel={() => void handleCancelSearch()}
              onPropertyQuery={setPropertyQuery}
              onRetry={() => void handleRetryFailed()}
              onSelect={focusProperty}
              onToggleUnavailable={() => setShowUnavailableRates((value) => !value)}
              properties={properties}
              propertyQuery={propertyQuery}
              selectedProperty={selectedProperty}
              showUnavailableRates={showUnavailableRates}
              visibleProperties={visibleProperties}
            />
          ) : null}

          {activeView === "library" ? (
            <div className="grid items-start gap-6 xl:grid-cols-[0.8fr_1.2fr]">
              <Card className="border-border/70 bg-background/82 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
                <CardHeader>
                  <CardDescription>Presets and personal codes</CardDescription>
                  <CardTitle>Settings</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6">
                  <form className="grid gap-3" onSubmit={handleSavePreset}>
                    <Input
                      onChange={(event) => setNewPresetName(event.target.value)}
                      placeholder="Save current selection as a preset"
                      value={newPresetName}
                    />
                    <Button type="submit" variant="outline">
                      Save preset
                    </Button>
                  </form>
                  <Separator />
                  <form className="grid gap-3" onSubmit={handleAddCustomCode}>
                    <Input
                      onChange={(event) => setNewCode(event.target.value)}
                      placeholder="Custom code"
                      value={newCode}
                    />
                    <Input
                      onChange={(event) => setNewCodeCompany(event.target.value)}
                      placeholder="Label or company"
                      value={newCodeCompany}
                    />
                    <Button type="submit">Add personal code</Button>
                  </form>
                  <Separator />
                  <div className="grid gap-3">
                    {presets.map((preset) => (
                      <Card key={preset.id} size="sm">
                        <CardHeader>
                          <CardDescription>{preset.isDefault ? "Default preset" : "Custom preset"}</CardDescription>
                          <CardTitle>{preset.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{preset.codes.length} codes</Badge>
                          <Button onClick={() => handlePresetApply(preset)} size="sm" variant="outline">
                            Apply preset
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-background/82 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
                <CardHeader>
                  <CardDescription>Full code catalog</CardDescription>
                  <CardTitle>Search, favorite, and manage the full code list</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Input
                    onChange={(event) => setCodeSearch(event.target.value)}
                    placeholder="Filter by code or company"
                    value={codeSearch}
                  />
                  <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">Use</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Signals</TableHead>
                          <TableHead className="w-28">Favorite</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCodes.map((code) => (
                          <TableRow key={code.code}>
                            <TableCell>
                              <Checkbox
                                checked={selectedCodes.includes(code.code)}
                                onCheckedChange={(checked) => toggleCodeSelection(code.code, Boolean(checked))}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{code.code}</TableCell>
                            <TableCell>{code.company}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                {code.recommended ? <Badge variant="secondary">Recommended</Badge> : null}
                                {code.rateGroupName ? <Badge variant="outline">{code.rateGroupName}</Badge> : null}
                                {code.custom ? <Badge variant="secondary">Custom</Badge> : null}
                                {favoriteCodes.includes(code.code) ? <Badge>Favorite</Badge> : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button onClick={() => toggleFavorite(code.code)} size="sm" variant="outline">
                                {favoriteCodes.includes(code.code) ? "Saved" : "Save"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {activeView === "history" ? (
            <Card className="border-border/70 bg-background/82 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
              <CardHeader>
                <CardDescription>Recent runs</CardDescription>
                <CardTitle>Local search memory</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {history.map((entry) => (
                      <Card key={entry.id} size="sm">
                        <CardHeader>
                          <CardDescription>{formatDateTime(entry.createdAt)}</CardDescription>
                          <CardTitle>{entry.destination}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">{entry.propertyCount} properties</Badge>
                            <Badge variant="secondary">{entry.codes.length} codes</Badge>
                            {entry.topWinningCode ? <Badge>{codeLabel(entry.topWinningCode)}</Badge> : null}
                          </div>
                          <Button onClick={() => handleRestoreHistory(entry)} variant="outline">
                            Restore this search
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Empty className="border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ClockCounterClockwiseIcon />
                      </EmptyMedia>
                      <EmptyTitle>No history yet</EmptyTitle>
                      <EmptyDescription>
                        Recent searches stay in your browser so you can revisit them without an account system.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button onClick={() => setActiveView("search")} variant="outline">
                        Start a live search
                      </Button>
                    </EmptyContent>
                  </Empty>
                )}
              </CardContent>
            </Card>
          ) : null}
        </main>
      </div>
    </div>
  )
}
