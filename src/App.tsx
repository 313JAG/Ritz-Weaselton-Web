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

import { GooglePropertyMap } from "@/components/google-property-map"
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
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
import logo from "../logo.jpg"

type BootstrapPayload = {
  codes: CatalogCode[]
  presets: CatalogPreset[]
}

type ViewKey = "search" | "results" | "library" | "history"

const defaultCheckIn = "2026-04-16"
const defaultCheckOut = "2026-04-22"

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
    createdAt: job.completedAt,
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
  const [checkIn, setCheckIn] = useState(defaultCheckIn)
  const [checkOut, setCheckOut] = useState(defaultCheckOut)
  const [codes, setCodes] = useState<Array<CatalogCode & { favorite?: boolean; custom?: boolean }>>([])
  const [presets, setPresets] = useState<StoredPreset[]>([])
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [favoriteCodes, setFavoriteCodes] = useState<string[]>([])
  const [customCodes, setCustomCodes] = useState<StoredCustomCode[]>([])
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [job, setJob] = useState<SearchJob | null>(null)
  const [isSearching, setIsSearching] = useState(false)
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
      setSelectedCodes(browser.enabledCodes.length ? browser.enabledCodes : allCodeValues)
      setPresets(mergePresets(defaultPresets, browser.presets, recommendedCodes, allCodeValues))
      setHistory(browser.history)
      setSelectedProperty(browser.selectedProperty)
    }

    bootstrap().catch((caughtError: Error) => {
      setError(caughtError.message)
    })
  }, [])

  const properties = job ? summarizeProperties(job.results) : []
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
    ? properties.find((property) => property.name === selectedProperty) || null
    : null

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
    void runSearch()
  }

  async function runSearch(codesOverride?: string[]) {
    setIsSearching(true)
    setError(null)

    try {
      const nextJob = await apiFetch<SearchJob>("/api/search-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          country,
          checkIn,
          checkOut,
          codes: ["BASELINE", ...(codesOverride || selectedCodes)],
        }),
      })

      startTransition(() => {
        setJob(nextJob)
        const nextProperties = summarizeProperties(nextJob.results)
        const firstProperty = nextProperties[0]?.name || null
        const nextHistory = [buildHistoryEntry(nextJob), ...history.filter((entry) => entry.id !== nextJob.id)].slice(0, 10)
        setHistory(nextHistory)
        saveHistory(nextHistory)
        setSelectedProperty(firstProperty)
        saveSelectedProperty(firstProperty)
        setActiveView("results")
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
      const retried = await apiFetch<SearchJob>(`/api/search-jobs/${job.id}/retry-failed`, {
        method: "POST",
      })

      startTransition(() => {
        setJob(retried)
        const nextProperties = summarizeProperties(retried.results)
        const nextHistory = [buildHistoryEntry(retried), ...history.filter((entry) => entry.id !== retried.id)].slice(0, 10)
        setHistory(nextHistory)
        saveHistory(nextHistory)
        if (!selectedProperty && nextProperties[0]?.name) {
          setSelectedProperty(nextProperties[0].name)
          saveSelectedProperty(nextProperties[0].name)
        }
      })
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Retry failed")
    } finally {
      setIsSearching(false)
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
        <header className="flex flex-col gap-4 rounded-none border border-border/70 bg-background/72 p-4 shadow-[0_20px_60px_rgba(69,46,23,0.08)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <img alt="Ritz-Weaselton" className="size-14 rounded-none object-cover ring-1 ring-border/80" src={logo} />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.36em] text-muted-foreground">Hosted Prototype</p>
              <h1 className="font-heading text-2xl tracking-tight">Ritz-Weaselton</h1>
              <p className="text-sm text-muted-foreground">Server-side Marriott corp-code comparison with a simpler search-first flow.</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setActiveView("search")} variant={activeView === "search" ? "default" : "outline"}>
              Search
            </Button>
            <Button
              disabled={!job}
              onClick={() => setActiveView("results")}
              variant={activeView === "results" ? "default" : "outline"}
            >
              Results
            </Button>
            <Button onClick={() => setActiveView("library")} variant={activeView === "library" ? "default" : "outline"}>
              Library
            </Button>
            <Button onClick={() => setActiveView("history")} variant={activeView === "history" ? "default" : "outline"}>
              History
            </Button>
          </nav>
        </header>

        {activeView === "search" ? (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-border/70 bg-background/86 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
              <CardHeader className="gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Warm Luxury</Badge>
                  <Badge variant="secondary">Preset-first</Badge>
                  <Badge variant="secondary">Google Maps-ready</Badge>
                </div>
                <CardTitle className="font-heading text-4xl leading-tight">Search first. Compare details after.</CardTitle>
                <CardDescription className="max-w-2xl text-base text-muted-foreground">
                  Start with destination, dates, and a code preset. Once the run completes, the results screen will rank properties by the best winning deal and show a coordinated map.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <form className="grid gap-6" onSubmit={handleSearchSubmit}>
                  <FieldGroup>
                    <div className="grid gap-5 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="city">Location</FieldLabel>
                        <FieldContent>
                          <Input id="city" onChange={(event) => setCity(event.target.value)} value={city} />
                          <FieldDescription>City or destination Marriott can resolve.</FieldDescription>
                        </FieldContent>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="country">Country</FieldLabel>
                        <FieldContent>
                          <Input
                            id="country"
                            maxLength={2}
                            onChange={(event) => setCountry(event.target.value.toUpperCase())}
                            value={country}
                          />
                          <FieldDescription>Two-letter country code, like `US` or `AU`.</FieldDescription>
                        </FieldContent>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="checkIn">Check-in</FieldLabel>
                        <FieldContent>
                          <Input id="checkIn" onChange={(event) => setCheckIn(event.target.value)} type="date" value={checkIn} />
                        </FieldContent>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="checkOut">Check-out</FieldLabel>
                        <FieldContent>
                          <Input id="checkOut" onChange={(event) => setCheckOut(event.target.value)} type="date" value={checkOut} />
                        </FieldContent>
                      </Field>
                    </div>
                  </FieldGroup>

                  <FieldSet>
                    <FieldLegend>Code selection</FieldLegend>
                    <FieldDescription>Use a preset to keep the home screen simple, then refine in the advanced selector if needed.</FieldDescription>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>STD</Badge>
                      <Badge variant="secondary">{selectedCodes.length} codes selected</Badge>
                      {selectedCodes.slice(0, 6).map((code) => (
                        <Badge key={code} variant="secondary">{codeLabel(code)}</Badge>
                      ))}
                      {selectedCodes.length > 6 ? <Badge variant="secondary">+{selectedCodes.length - 6} more</Badge> : null}
                    </div>
                  </FieldSet>

                  <div className="flex flex-wrap gap-3">
                    <Button disabled={isSearching} type="submit">
                      <MagnifyingGlassIcon data-icon="inline-start" />
                      {isSearching ? "Searching live" : "Run live comparison"}
                    </Button>
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button type="button" variant="outline">
                          <SlidersHorizontalIcon data-icon="inline-start" />
                          Advanced code selector
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="sm:max-w-2xl">
                        <SheetHeader>
                          <SheetTitle>Code selector</SheetTitle>
                          <SheetDescription>Search, favorite, and selectively enable the codes you want on this run.</SheetDescription>
                        </SheetHeader>
                        <div className="grid gap-4 pt-4">
                          <Input onChange={(event) => setCodeSearch(event.target.value)} placeholder="Filter by code or company" value={codeSearch} />
                          <div className="flex flex-wrap gap-2">
                            <Button onClick={() => updateSelected(codes.map((code) => code.code))} type="button" variant="outline">
                              Use all codes
                            </Button>
                            <Button onClick={() => updateSelected(codes.filter((code) => code.recommended).map((code) => code.code))} type="button" variant="outline">
                              Recommended only
                            </Button>
                          </div>
                          <ScrollArea className="h-[30rem] pr-3">
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
                          </ScrollArea>
                        </div>
                      </SheetContent>
                    </Sheet>
                  </div>
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                </form>
              </CardContent>
            </Card>

            <div className="grid gap-6">
              <Card className="border-border/70 bg-background/78 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
                <CardHeader>
                  <CardDescription>What happens after search</CardDescription>
                  <CardTitle>Results become the detail view</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="rounded-none border border-border/70 bg-muted/35 p-4">
                    <p className="text-sm text-muted-foreground">Ranked list</p>
                    <p className="font-heading text-lg">Best code, best price, baseline, and savings at a glance.</p>
                  </div>
                  <div className="rounded-none border border-border/70 bg-muted/35 p-4">
                    <p className="text-sm text-muted-foreground">Google map</p>
                    <p className="font-heading text-lg">Price-first markers linked directly to the matching hotel card.</p>
                  </div>
                  <div className="rounded-none border border-border/70 bg-muted/35 p-4">
                    <p className="text-sm text-muted-foreground">Deeper compare</p>
                    <p className="font-heading text-lg">The per-code table stays available, but it’s no longer the first thing you see.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-background/78 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
                <CardHeader>
                  <CardDescription>Recent searches</CardDescription>
                  <CardTitle>Browser-local history</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {history.length ? (
                    history.slice(0, 3).map((entry) => (
                      <Button key={entry.id} className="h-auto justify-start py-3 text-left" onClick={() => handleRestoreHistory(entry)} variant="outline">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{entry.destination}</span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)} • {entry.propertyCount} properties • {entry.codes.length} codes</span>
                        </div>
                      </Button>
                    ))
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <ClockCounterClockwiseIcon />
                        </EmptyMedia>
                        <EmptyTitle>No saved searches yet</EmptyTitle>
                        <EmptyDescription>Your recent runs will appear here after the first search.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>
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
                  <Button onClick={() => setActiveView("search")} variant="outline">
                    Back to search
                  </Button>
                  {job?.failedCodes.length ? (
                    <Button disabled={isSearching} onClick={handleRetryFailed} variant="outline">
                      <ArrowClockwiseIcon data-icon="inline-start" />
                      Retry failed
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {job ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card size="sm">
                      <CardHeader>
                        <CardDescription>Best savings</CardDescription>
                        <CardTitle>{properties[0] ? formatCurrency(properties[0].savings, properties[0].currency) : "Waiting"}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card size="sm">
                      <CardHeader>
                        <CardDescription>Top winner</CardDescription>
                        <CardTitle>{properties.find((property) => property.bestCode && property.bestCode !== "BASELINE")?.bestCodeLabel || "STD"}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card size="sm">
                      <CardHeader>
                        <CardDescription>Completed</CardDescription>
                        <CardTitle>{formatDateTime(job.completedAt)}</CardTitle>
                      </CardHeader>
                    </Card>
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

            <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
              <Card className="border-border/70 bg-background/82 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
                <CardHeader>
                  <CardDescription>Ranked list</CardDescription>
                  <CardTitle>Best deals first</CardTitle>
                </CardHeader>
                <CardContent>
                  {properties.length ? (
                    <ScrollArea className="h-[70vh] pr-3">
                      <div className="flex flex-col gap-4">
                        {properties.map((property, index) => (
                          <div
                            key={property.name}
                            ref={(element) => {
                              propertyRefs.current[property.name] = element
                            }}
                          >
                            <Card
                              className={selectedProperty === property.name ? "cursor-pointer border-primary bg-primary/5 shadow-lg ring-2 ring-primary" : "cursor-pointer transition-shadow hover:shadow-md"}
                              onClick={() => focusProperty(property.name)}
                              size="sm"
                            >
                              <CardHeader className="gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary">#{index + 1}</Badge>
                                  <Badge>{property.bestCodeLabel || "No rate"}</Badge>
                                  <Badge variant="secondary">{property.availableCodes} priced codes</Badge>
                                  {property.distance ? <Badge variant="secondary">{property.distance}</Badge> : null}
                                </div>
                                <CardTitle className="font-heading text-2xl">{property.name}</CardTitle>
                                <CardDescription>{property.description || "Live Marriott property result."}</CardDescription>
                              </CardHeader>
                              <CardContent className="grid gap-4">
                                <div className="grid gap-4 md:grid-cols-3">
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Best price</p>
                                    <p className="font-heading text-2xl">{formatCurrency(property.bestPrice, property.currency)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Baseline</p>
                                    <p className="font-heading text-2xl">{formatCurrency(property.baselinePrice, property.currency)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Savings</p>
                                    <p className="font-heading text-2xl">{formatCurrency(property.savings, property.currency)}</p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {property.rates.slice(0, 5).map((rate) => (
                                    <Badge key={`${property.name}-${rate.code}`} variant="secondary">
                                      {rate.label}: {rate.available ? formatCurrency(rate.price, rate.currency) : "No rate"}
                                    </Badge>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-3">
                                  {property.bookingUrl ? (
                                    <Button asChild>
                                      <a href={property.bookingUrl} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">
                                        Open booking path
                                      </a>
                                    </Button>
                                  ) : null}
                                  <Button onClick={(event) => {
                                    event.stopPropagation()
                                    focusProperty(property.name)
                                  }} variant="outline">
                                    <MapPinIcon data-icon="inline-start" />
                                    Highlight on map
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
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

              <div className="grid gap-6">
                <Card className="border-border/70 bg-background/82 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
                  <CardHeader>
                    <CardDescription>Google map</CardDescription>
                    <CardTitle>Price-first markers</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <GooglePropertyMap
                      onSelect={focusProperty}
                      properties={properties}
                      selectedProperty={selectedProperty}
                    />
                    {selectedPropertySummary ? (
                      <div className="rounded-none border border-border/70 bg-muted/35 p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Selected property</p>
                        <div className="mt-2 flex flex-col gap-2">
                          <h3 className="font-heading text-xl">{selectedPropertySummary.name}</h3>
                          <div className="flex flex-wrap gap-2">
                            <Badge>{selectedPropertySummary.bestCodeLabel || "No rate"}</Badge>
                            <Badge variant="secondary">{formatCurrency(selectedPropertySummary.bestPrice, selectedPropertySummary.currency)}</Badge>
                            <Badge variant="secondary">{formatCurrency(selectedPropertySummary.savings, selectedPropertySummary.currency)} savings</Badge>
                          </div>
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
                            {properties.slice(0, 18).map((property) => (
                              <TableRow
                                className={property.name === selectedProperty ? "cursor-pointer bg-primary/8" : "cursor-pointer"}
                                key={property.name}
                                onClick={() => focusProperty(property.name)}
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
          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Card className="border-border/70 bg-background/82 shadow-[0_18px_50px_rgba(69,46,23,0.08)]">
              <CardHeader>
                <CardDescription>Presets and personal codes</CardDescription>
                <CardTitle>Curate your library</CardTitle>
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
                <CardDescription>Code library</CardDescription>
                <CardTitle>Search, favorite, and manage the full code list</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Input onChange={(event) => setCodeSearch(event.target.value)} placeholder="Filter by code or company" value={codeSearch} />
                <ScrollArea className="h-[60vh] pr-3">
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
                </ScrollArea>
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
