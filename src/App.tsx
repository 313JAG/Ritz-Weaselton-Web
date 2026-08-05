import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from "react"
import {
  ArrowClockwiseIcon,
  BookOpenTextIcon,
  ClockCounterClockwiseIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
} from "@phosphor-icons/react"

import { PropertyMap } from "@/components/property-map"
import { DestinationPicker } from "@/components/destination-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
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
  formatCurrency,
  formatDateTime,
  mergeCodes,
  mergePresets,
  summarizeProperties,
  uniqueCodes,
  type CatalogCode,
  type CatalogPreset,
  type SearchJob,
} from "@/lib/transform"
import { cn } from "@/lib/utils"
import { DESTINATIONS, getLocalDate } from "@/lib/destinations"
import logo from "../logo.jpg"

type BootstrapPayload = {
  codes: CatalogCode[]
  presets: CatalogPreset[]
}

type ViewKey = "search" | "results" | "library" | "history"

const searchPollDelayMs = 750

async function apiFetch<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, options)
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
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
    bestSavings: properties[0]?.savings || 0,
    topWinningCode:
      properties.find((property) => property.bestCode && property.bestCode !== "BASELINE")?.bestCode ||
      null,
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>("search")
  const [city, setCity] = useState("Las Vegas")
  const [country, setCountry] = useState("US")
  const [checkIn, setCheckIn] = useState(() => getLocalDate())
  const [checkOut, setCheckOut] = useState(() => getLocalDate(1))
  const [codes, setCodes] = useState<Array<CatalogCode & { favorite?: boolean; custom?: boolean }>>([])
  const [presets, setPresets] = useState<StoredPreset[]>([])
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [favoriteCodes, setFavoriteCodes] = useState<string[]>([])
  const [customCodes, setCustomCodes] = useState<StoredCustomCode[]>([])
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [job, setJob] = useState<SearchJob | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchActivity, setShowSearchActivity] = useState(false)
  const [showUnavailableRates, setShowUnavailableRates] = useState(false)
  const [propertyQuery, setPropertyQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [codeSearch, setCodeSearch] = useState("")
  const [newCode, setNewCode] = useState("")
  const [newCodeCompany, setNewCodeCompany] = useState("")
  const [newPresetName, setNewPresetName] = useState("")
  const deferredCodeSearch = useDeferredValue(codeSearch)
  const propertyRefs = useRef<Record<string, HTMLDivElement | null>>({})

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
    }

    bootstrap().catch((caughtError: Error) => {
      setError(caughtError.message)
    })
  }, [])

  const codeCompanies = useMemo(() => Object.fromEntries(codes.map((code) => [code.code, code.company])), [codes])
  const properties = useMemo(() => job ? summarizeProperties(job.results, codeCompanies) : [], [job, codeCompanies])
  const visibleProperties = useMemo(() => {
    const term = propertyQuery.trim().toLowerCase()
    return term ? properties.filter((property) => property.name.toLowerCase().includes(term) || property.brandName.toLowerCase().includes(term)) : properties
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
      return presetCodes.length === normalizedSelected.length &&
        presetCodes.every((code, index) => code === normalizedSelected[index])
    })
    return matched?.id ?? ""
  }, [presets, selectedCodes])

  const selectedPropertySummary = selectedProperty
    ? properties.find((property) => property.key === selectedProperty) || null
    : null
  const visibleSearchCodes = (job?.params.codes.filter((code) => code !== "BASELINE") || selectedCodes)

  useEffect(() => {
    if (!selectedProperty) return
    const element = propertyRefs.current[selectedProperty]
    if (!element) return
    element.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [selectedProperty])

  function updateFavorites(nextFavorites: string[]) {
    setFavoriteCodes(nextFavorites)
    saveFavoriteCodes(nextFavorites)
    setCodes((current) =>
      current.map((code) => ({
        ...code,
        favorite: nextFavorites.includes(code.code),
      }))
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

  function focusProperty(name: string) {
    setSelectedProperty(name)
    saveSelectedProperty(name)
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Read the submitted controls rather than relying only on React state. This avoids
    // a fast click after editing a date from submitting the value from the prior render.
    const formData = new FormData(event.currentTarget)
    const submittedParams = {
      city: String(formData.get("city") || "").trim(),
      country: String(formData.get("country") || ""),
      checkIn: String(formData.get("checkIn") || ""),
      checkOut: String(formData.get("checkOut") || ""),
    }
    setCity(submittedParams.city)
    setCountry(submittedParams.country)
    setCheckIn(submittedParams.checkIn)
    setCheckOut(submittedParams.checkOut)
    void runSearch(undefined, submittedParams)
  }

  async function runSearch(
    codesOverride?: string[],
    submittedParams?: { city: string; country: string; checkIn: string; checkOut: string }
  ) {
    const searchCity = submittedParams?.city ?? city
    const searchCountry = submittedParams?.country ?? country
    const searchCheckIn = submittedParams?.checkIn ?? checkIn
    const searchCheckOut = submittedParams?.checkOut ?? checkOut

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
      const queuedJob = await apiFetch<SearchJob>("/api/search-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: searchCity,
          country: searchCountry,
          checkIn: searchCheckIn,
          checkOut: searchCheckOut,
          codes: ["BASELINE", ...(codesOverride || selectedCodes)],
        }),
      })

      startTransition(() => {
        setJob(queuedJob)
        setSelectedProperty(null)
        setShowSearchActivity(true)
        setActiveView("results")
      })

      const nextJob =
        queuedJob.status === "completed"
          ? queuedJob
          : await pollSearchJob(queuedJob.id)
      const nextProperties = summarizeProperties(nextJob.results, codeCompanies)
      const firstProperty = nextProperties[0]?.key || null
      const nextHistory = [buildHistoryEntry(nextJob), ...history.filter((entry) => entry.id !== nextJob.id)].slice(0, 10)

      startTransition(() => {
        setJob(nextJob)
        setHistory(nextHistory)
        saveHistory(nextHistory)
        setSelectedProperty(firstProperty)
        saveSelectedProperty(firstProperty)
        setShowSearchActivity(false)
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
        setShowSearchActivity(true)
      })

      const retried =
        queuedRetry.status === "completed"
          ? queuedRetry
          : await pollSearchJob(queuedRetry.id)
      const nextProperties = summarizeProperties(retried.results, codeCompanies)
      const nextHistory = [buildHistoryEntry(retried), ...history.filter((entry) => entry.id !== retried.id)].slice(0, 10)

      startTransition(() => {
        setJob(retried)
        setHistory(nextHistory)
        saveHistory(nextHistory)
        setShowSearchActivity(false)
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

  async function handleCancelSearch() {
    if (!job) return
    try {
      const cancelled = await apiFetch<SearchJob>(`/api/search-jobs/${job.id}/cancel`, { method: "POST" })
      setJob(cancelled)
      setShowSearchActivity(false)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not cancel search")
    }
  }

  function handleDestinationChange(value: string) {
    setCity(value)
    const match = DESTINATIONS.find(([destination]) => destination.toLowerCase() === value.trim().toLowerCase())
    if (match) setCountry(match[1])
  }

  function handleCheckInChange(value: string) {
    setCheckIn(value)
    if (value >= checkOut) {
      const next = new Date(`${value}T12:00:00`)
      next.setDate(next.getDate() + 1)
      setCheckOut([next.getFullYear(), String(next.getMonth() + 1).padStart(2, "0"), String(next.getDate()).padStart(2, "0")].join("-"))
    }
  }

  function handleRestoreHistory(entry: SearchHistoryEntry) {
    setCity(entry.city)
    setCountry(entry.country)
    setCheckIn(entry.checkIn)
    setCheckOut(entry.checkOut)
    updateSelected(entry.codes)
    setActiveView("search")
  }

  function toggleCodeSelection(code: string, checked: boolean) {
    updateSelected(checked ? [...selectedCodes, code] : selectedCodes.filter((item) => item !== code))
  }

  function toggleFavorite(code: string) {
    updateFavorites(
      favoriteCodes.includes(code)
        ? favoriteCodes.filter((item) => item !== code)
        : [...favoriteCodes, code]
    )
  }

  function handleAddCustomCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = normalizeCode(newCode)
    if (!code) return

    const nextCustomCodes = [{ code, company: newCodeCompany || "Personal code" }, ...customCodes].filter(
      (value, index, array) => array.findIndex((item) => item.code === value.code) === index
    )
    const nextCodes = mergeCodes(codes.filter((item) => !item.custom), nextCustomCodes, favoriteCodes)

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
        codes.map((code) => code.code)
      )
    )
    savePresets(nextCustomPresets)
    setNewPresetName("")
  }

  const topPresets = presets.slice(0, 5)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(248,239,224,0.92),_rgba(236,227,213,0.98)_38%,_rgba(230,220,204,1)_100%)] text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col gap-6 px-4 py-5 md:px-6 md:py-7">
        <header className="flex flex-col gap-4 border border-border/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,249,244,0.94))] p-4 shadow-[0_20px_60px_rgba(69,46,23,0.08)] md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <img
              alt="Ritz-Weaselton"
              className="h-22 w-auto shrink-0 object-contain mix-blend-multiply saturate-75 contrast-105"
              src={logo}
            />
            <div className="min-w-0">
              <h1 className="font-heading text-2xl tracking-tight">Ritz-Weaselton</h1>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <Button
              className="h-11 rounded-xl px-5 text-base"
              onClick={() => setActiveView("search")}
              variant={activeView === "search" ? "default" : "outline"}
            >
              Search
            </Button>
            <Button
              className="h-11 rounded-xl px-5 text-base"
              disabled={!job}
              onClick={() => setActiveView("results")}
              variant={activeView === "results" ? "default" : "outline"}
            >
              Results
            </Button>
            <Button
              className="h-11 rounded-xl px-5 text-base"
              onClick={() => setActiveView("library")}
              variant={activeView === "library" ? "default" : "outline"}
            >
              Settings
            </Button>
            <Button
              className="h-11 rounded-xl px-5 text-base"
              onClick={() => setActiveView("history")}
              variant={activeView === "history" ? "default" : "outline"}
            >
              History
            </Button>
          </nav>
        </header>

        {activeView === "search" ? (
          <div className="flex flex-1 items-center justify-center py-6 md:py-10">
            <div className="grid w-full max-w-5xl gap-6">
              <div className="mx-auto grid w-full max-w-3xl gap-4 text-center">
                <div className="flex justify-center gap-2">
                  <Badge variant="secondary">Live Marriott pricing</Badge>
                  <Badge variant="secondary">Server-side compare</Badge>
                  <Badge variant="secondary">Preset-first</Badge>
                </div>
                <h2 className="font-heading text-5xl leading-[0.95] tracking-tight text-foreground md:text-6xl">
                  Search smarter.
                </h2>
                <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
                  Enter a destination, set your dates, choose the codes you want, and let the results view handle the heavier detail.
                </p>
              </div>

              <Card className="mx-auto w-full max-w-4xl border-border/70 bg-background shadow-[0_28px_80px_rgba(69,46,23,0.11)]">
                <CardContent className="grid gap-6 px-5 py-5 md:px-6 md:py-6">
                  <form className="grid gap-6" onSubmit={handleSearchSubmit}>
                    <FieldGroup>
                          <div className="grid gap-4">
                        <Field>
                          <FieldLabel htmlFor="city">Where are you staying?</FieldLabel>
                          <FieldContent>
                            <DestinationPicker onChange={(nextCity, nextCountry) => { setCity(nextCity); setCountry(nextCountry) }} value={city} />
                            <input name="country" type="hidden" value={country} />
                          </FieldContent>
                        </Field>
                      </div>
                    </FieldGroup>

                    <FieldGroup>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="checkIn">Check-in</FieldLabel>
                          <FieldContent>
                            <Input className="h-13 text-base" id="checkIn" min={getLocalDate()} name="checkIn" onChange={(event) => handleCheckInChange(event.target.value)} type="date" value={checkIn} />
                          </FieldContent>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="checkOut">Check-out</FieldLabel>
                          <FieldContent>
                            <Input className="h-13 text-base" id="checkOut" min={checkIn} name="checkOut" onChange={(event) => setCheckOut(event.target.value)} type="date" value={checkOut} />
                          </FieldContent>
                        </Field>
                      </div>
                    </FieldGroup>

                    <FieldSet className="grid gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="grid gap-1">
                          <FieldLegend>Codes</FieldLegend>
                          <FieldDescription>Pick a preset here. Manage the full code library in Settings.</FieldDescription>
                        </div>
                        <Button
                          className="rounded-xl"
                          onClick={() => setActiveView("library")}
                          type="button"
                          variant="ghost"
                        >
                          <SlidersHorizontalIcon data-icon="inline-start" />
                          Open settings
                        </Button>
                      </div>
                      <ToggleGroup
                        className="flex w-full flex-wrap gap-2"
                        onValueChange={(value) => {
                          const preset = presets.find((item) => item.id === value)
                          if (preset) handlePresetApply(preset)
                        }}
                        type="single"
                        value={selectedPresetId}
                        variant="outline"
                      >
                        {topPresets.map((preset) => (
                          <ToggleGroupItem key={preset.id} value={preset.id}>
                            {preset.name}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/75 px-3 py-3">
                        <Badge>{selectedPresetId ? presets.find((preset) => preset.id === selectedPresetId)?.name || "Preset" : "Custom"}</Badge>
                        <Badge variant="secondary">{selectedCodes.length} codes selected</Badge>
                        {selectedCodes.slice(0, 4).map((code) => (
                          <Badge key={code} variant="secondary">{codeLabel(code)}</Badge>
                        ))}
                        {selectedCodes.length > 4 ? <Badge variant="secondary">+{selectedCodes.length - 4} more</Badge> : null}
                      </div>
                      <Button
                        onClick={() => updateSelected(codes.map((code) => code.code))}
                        type="button"
                        variant="outline"
                      >
                        Run all {codes.length} codes
                      </Button>
                    </FieldSet>

                    <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
                      <Button className="h-13 px-5 text-base md:min-w-64" disabled={isSearching} type="submit">
                        <MagnifyingGlassIcon data-icon="inline-start" />
                        {isSearching ? "Search running" : "Run live comparison"}
                      </Button>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Need custom codes or favorites?</span>
                        <Button
                          className="rounded-xl px-3"
                          onClick={() => setActiveView("library")}
                          type="button"
                          variant="ghost"
                        >
                          Settings
                        </Button>
                      </div>
                    </div>
                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  </form>
                </CardContent>
              </Card>

              <div className="mx-auto grid w-full max-w-4xl gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Recent searches</p>
                  {history.length ? (
                    <Button onClick={() => setActiveView("history")} size="sm" variant="ghost">
                      View all
                    </Button>
                  ) : null}
                </div>
                {history.length ? (
                    <div className="grid gap-3 md:grid-cols-3">
                    {history.slice(0, 3).map((entry) => (
                      <Button
                        key={entry.id}
                        className="h-auto justify-start rounded-xl border-border/70 bg-background/88 px-4 py-4 text-left shadow-[0_12px_30px_rgba(69,46,23,0.06)]"
                        onClick={() => handleRestoreHistory(entry)}
                        variant="outline"
                      >
                        <div className="flex flex-col gap-1.5">
                          <span className="font-medium">{entry.destination}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(entry.createdAt)} • {entry.propertyCount} properties • {entry.codes.length} codes
                          </span>
                        </div>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Card className="border-dashed border-border/70 bg-background/70">
                    <CardContent className="px-5 py-5">
                      <p className="text-sm text-muted-foreground">
                        Your recent runs will show up here after the first search.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeView === "results" ? (
          <div className="grid gap-6">
            <Card className="border-border/70 bg-background/82 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
              <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardDescription>Results detail view</CardDescription>
                  <CardTitle className="font-heading text-3xl">
                    {job ? `${properties.length} properties ranked by the best available code` : "Run a search to see results"}
                  </CardTitle>
                </div>
                <div className="flex flex-wrap gap-2">
                  {job ? <Badge>{job.params.city}, {job.params.country}</Badge> : null}
                  {job ? <Badge variant="secondary">{job.params.codes.length} codes checked</Badge> : null}
                  {job ? <Badge variant="secondary">{job.failedCodes.length} failed</Badge> : null}
                  {job && job.status !== "completed" && job.status !== "cancelled" ? <Badge variant="secondary">{job.progress?.completedCodes || 0}/{job.progress?.totalCodes || job.params.codes.length} complete</Badge> : null}
                  <Button onClick={() => setActiveView("search")} variant="outline">
                    Back to search
                  </Button>
                  {job?.failedCodes.length ? (
                    <Button disabled={isSearching} onClick={handleRetryFailed} variant="outline">
                      <ArrowClockwiseIcon data-icon="inline-start" />
                      Retry failed
                    </Button>
                  ) : null}
                  {job && job.status !== "completed" && job.status !== "cancelled" ? (
                    <Button disabled={!isSearching} onClick={handleCancelSearch} variant="outline">Cancel search</Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {job ? (
                  <div className="grid gap-4">
                    {isSearching ? (
                      <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/25 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="grid gap-1">
                            <p className="text-sm font-medium text-foreground">Searching Marriott live</p>
                            <p className="text-sm text-muted-foreground">
                              {job.progress?.completedCodes || 0} of {job.progress?.totalCodes || visibleSearchCodes.length} codes processed for {job.params.city}, {job.params.country}.
                            </p>
                          </div>
                          <Button
                            onClick={() => setShowSearchActivity((value) => !value)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {showSearchActivity ? "Hide activity" : "Show activity"}
                          </Button>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-border/70">
                          <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
                        </div>
                        {showSearchActivity ? (
                          <ScrollArea className="h-28 rounded-xl border border-border/70 bg-background/80">
                            <div className="flex flex-wrap gap-2 p-3">
                              {visibleSearchCodes.map((code) => (
                                <Badge key={code} variant="secondary">
                                  {codeLabel(code)}
                                </Badge>
                              ))}
                            </div>
                          </ScrollArea>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-3">
                      <Card className="bg-background/92" size="sm">
                        <CardHeader>
                          <CardDescription>Best savings</CardDescription>
                          <CardTitle>{properties[0] ? formatCurrency(properties[0].savings, properties[0].currency) : "Waiting"}</CardTitle>
                        </CardHeader>
                      </Card>
                      <Card className="bg-background/92" size="sm">
                        <CardHeader>
                          <CardDescription>Top winner</CardDescription>
                          <CardTitle>{properties.find((property) => property.bestCode && property.bestCode !== "BASELINE")?.bestCodeLabel || "STD"}</CardTitle>
                        </CardHeader>
                      </Card>
                      <Card className="bg-background/92" size="sm">
                        <CardHeader>
                          <CardDescription>{isSearching ? "Last update" : "Completed"}</CardDescription>
                          <CardTitle>{formatDateTime(job.completedAt || job.updatedAt)}</CardTitle>
                        </CardHeader>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <Empty className="border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <SparkleIcon />
                      </EmptyMedia>
                      <EmptyTitle>No results yet</EmptyTitle>
                      <EmptyDescription>Run a search from the home screen first.</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button onClick={() => setActiveView("search")} variant="outline">Open search</Button>
                    </EmptyContent>
                  </Empty>
                )}
              </CardContent>
            </Card>

            {selectedPropertySummary ? (
              <Card className="border-primary/30 bg-background/88 shadow-[0_20px_60px_rgba(69,46,23,0.08)]">
                <CardContent className="grid gap-5 px-5 py-5 md:px-6">
                  <div className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>Selected property</Badge>
                      <Badge variant="secondary">{selectedPropertySummary.bestCodeLabel || "No rate"}</Badge>
                      {selectedPropertySummary.distance ? (
                        <Badge variant="secondary">{selectedPropertySummary.distance}</Badge>
                      ) : null}
                    </div>
                    <div className="grid gap-1">
                      <h3 className="font-heading text-3xl leading-tight">{selectedPropertySummary.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedPropertySummary.description || "Live Marriott property result."}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Best</p>
                      <p className="font-heading text-2xl">
                        {formatCurrency(selectedPropertySummary.bestPrice, selectedPropertySummary.currency)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Baseline</p>
                      <p className="font-heading text-2xl">
                        {formatCurrency(selectedPropertySummary.baselinePrice, selectedPropertySummary.currency)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Savings</p>
                      <p className="font-heading text-2xl">
                        {formatCurrency(selectedPropertySummary.savings, selectedPropertySummary.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/15 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">All checked prices</p>
                        <p className="text-sm text-muted-foreground">Standard rate is pinned first; other available rates are ranked by price.</p>
                      </div>
                      <Button onClick={() => setShowUnavailableRates((value) => !value)} size="sm" variant="outline">
                        {showUnavailableRates ? "Hide unavailable" : "Show all codes"}
                      </Button>
                    </div>
                    <div className="max-h-[28rem] overflow-auto rounded-lg border border-border/60 bg-background">
                      <Table>
                        <TableHeader>
                          <TableRow><TableHead>Code</TableHead><TableHead>Company</TableHead><TableHead>Price</TableHead><TableHead>vs standard</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedPropertySummary.rates.filter((rate) => showUnavailableRates || rate.available || rate.code === "BASELINE").map((rate) => (
                            <TableRow key={`${selectedPropertySummary.key}-${rate.code}`}>
                              <TableCell className="font-medium">{rate.label}</TableCell>
                              <TableCell>{rate.company}</TableCell>
                              <TableCell>{rate.available ? formatCurrency(rate.price, rate.currency) : "—"}</TableCell>
                              <TableCell>{rate.available && selectedPropertySummary.baselinePrice !== null && rate.price !== null ? formatCurrency(Math.max(selectedPropertySummary.baselinePrice - rate.price, 0), rate.currency) : "—"}</TableCell>
                              <TableCell>{rate.available ? "Available" : rate.error || "Unavailable"}</TableCell>
                              <TableCell>{rate.available && rate.bookingUrl ? <Button asChild size="sm" variant="outline"><a href={rate.bookingUrl} rel="noreferrer" target="_blank">Book</a></Button> : null}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
              <Card className="border-border/70 bg-background/82 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
                <CardHeader>
                  <CardDescription>Ranked list</CardDescription>
                  <CardTitle>Best deals first</CardTitle>
                </CardHeader>
                <CardContent>
                  {visibleProperties.length ? (
                    <div className="pr-3">
                      <Input className="mb-4" onChange={(event) => setPropertyQuery(event.target.value)} placeholder="Filter properties" value={propertyQuery} />
                      <div className="flex flex-col gap-4 pb-4">
                        {visibleProperties.map((property, index) => (
                          <div
                            key={property.key}
                            ref={(element) => {
                              propertyRefs.current[property.key] = element
                            }}
                          >
                            <Card
                              className={cn(
                                "cursor-pointer border-border/70 bg-background/94 transition-all hover:shadow-md",
                                selectedProperty === property.key &&
                                  "border-primary/60 bg-primary/4 shadow-[0_16px_34px_rgba(69,46,23,0.12)] ring-1 ring-primary/50"
                              )}
                              onClick={() => focusProperty(property.key)}
                              size="sm"
                            >
                              <CardHeader className="gap-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">#{index + 1}</Badge>
                                    <Badge>{property.bestCodeLabel || "No rate"}</Badge>
                                    <Badge variant="secondary">{property.availableCodes} priced codes</Badge>
                                    {property.distance ? <Badge variant="secondary">{property.distance}</Badge> : null}
                                  </div>
                                  {selectedProperty === property.key ? <Badge>Selected</Badge> : null}
                                </div>
                                <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr] md:items-start">
                                  <div className="grid gap-3">
                                    <div className="grid gap-3 sm:grid-cols-[140px_1fr] sm:items-start">
                                      <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                                        {property.imageUrl ? (
                                          <img
                                            alt={property.name}
                                            className="h-28 w-full object-cover sm:h-24"
                                            loading="lazy"
                                            src={property.imageUrl}
                                          />
                                        ) : (
                                          <div className="flex h-28 items-center justify-center bg-muted/30 text-xs uppercase tracking-[0.24em] text-muted-foreground sm:h-24">
                                            {property.brandName || "Property"}
                                          </div>
                                        )}
                                      </div>
                                      <div className="grid gap-2">
                                        <CardTitle className="font-heading text-2xl">{property.name}</CardTitle>
                                        {property.brandName ? (
                                          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                                            {property.brandName}
                                          </p>
                                        ) : null}
                                        <CardDescription>{property.description || "Live Marriott property result."}</CardDescription>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Best live deal</p>
                                    <div className="flex items-end justify-between gap-3">
                                      <p className="font-heading text-3xl leading-none">
                                        {formatCurrency(property.bestPrice, property.currency)}
                                      </p>
                                      <div className="text-right text-sm text-muted-foreground">
                                        <p>vs {formatCurrency(property.baselinePrice, property.currency)}</p>
                                        <p className="font-medium text-foreground">
                                          {formatCurrency(property.savings, property.currency)} savings
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="grid gap-4">
                                <div className="flex flex-wrap gap-2"><Badge variant="secondary">Click to see all {property.rates.length} checked prices</Badge></div>
                                <Separator />
                                <div className="flex flex-wrap gap-3">
                                  {property.bookingUrl ? (
                                    <Button asChild>
                                      <a href={property.bookingUrl} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">
                                        Open booking path
                                      </a>
                                    </Button>
                                  ) : null}
                                  <Button
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      focusProperty(property.key)
                                    }}
                                    variant={selectedProperty === property.key ? "default" : "outline"}
                                  >
                                    <MapPinIcon data-icon="inline-start" />
                                    {selectedProperty === property.key ? "Selected on map" : "Show on map"}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Empty className="border">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <BookOpenTextIcon />
                        </EmptyMedia>
                        <EmptyTitle>No properties yet</EmptyTitle>
                        <EmptyDescription>Once a search completes, the property list will rank the best winning deals here.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-6 xl:sticky xl:top-5 xl:self-start">
                <Card className="border-border/70 bg-background/82 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
                  <CardHeader>
                    <CardDescription>Apple Maps</CardDescription>
                    <CardTitle>Price-first pins</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <PropertyMap
                      onSelect={focusProperty}
                      properties={properties}
                      selectedProperty={selectedProperty}
                    />
                    {selectedPropertySummary ? (
                      <div className="rounded-none border border-border/70 bg-muted/35 p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Selected property</p>
                        <div className="mt-2 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                          <div className="grid gap-2">
                            <h3 className="font-heading text-xl">{selectedPropertySummary.name}</h3>
                            <div className="flex flex-wrap gap-2">
                              <Badge>{selectedPropertySummary.bestCodeLabel || "No rate"}</Badge>
                              <Badge variant="secondary">{formatCurrency(selectedPropertySummary.bestPrice, selectedPropertySummary.currency)}</Badge>
                              <Badge variant="secondary">{formatCurrency(selectedPropertySummary.savings, selectedPropertySummary.currency)} savings</Badge>
                            </div>
                          </div>
                          <Button onClick={() => focusProperty(selectedPropertySummary.key)} variant="outline">
                            <MapPinIcon data-icon="inline-start" />
                            Focus in list
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-background/82 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
                  <CardHeader>
                    <CardDescription>Deeper compare</CardDescription>
                    <CardTitle>Secondary code table</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {properties.length ? (
                      <ScrollArea className="h-[22rem]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Property</TableHead>
                              <TableHead>Best</TableHead>
                              <TableHead>Baseline</TableHead>
                              <TableHead>Savings</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {visibleProperties.map((property) => (
                              <TableRow
                                className={property.key === selectedProperty ? "cursor-pointer bg-primary/8" : "cursor-pointer"}
                                key={property.key}
                                onClick={() => focusProperty(property.key)}
                              >
                                <TableCell className="font-medium">{property.name}</TableCell>
                                <TableCell>{property.bestCodeLabel || "No rate"}</TableCell>
                                <TableCell>{formatCurrency(property.baselinePrice, property.currency)}</TableCell>
                                <TableCell>{formatCurrency(property.savings, property.currency)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    ) : (
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>No matrix yet</EmptyTitle>
                          <EmptyDescription>The secondary code table appears after your first completed search.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
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
                  <Input onChange={(event) => setNewPresetName(event.target.value)} placeholder="Save current selection as a preset" value={newPresetName} />
                  <Button type="submit" variant="outline">Save preset</Button>
                </form>
                <Separator />
                <form className="grid gap-3" onSubmit={handleAddCustomCode}>
                  <Input onChange={(event) => setNewCode(event.target.value)} placeholder="Custom code" value={newCode} />
                  <Input onChange={(event) => setNewCodeCompany(event.target.value)} placeholder="Label or company" value={newCodeCompany} />
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
                <Input onChange={(event) => setCodeSearch(event.target.value)} placeholder="Filter by code or company" value={codeSearch} />
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
                    <EmptyDescription>Recent searches stay in your browser so you can revisit them without an account system.</EmptyDescription>
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
      </div>
    </div>
  )
}
