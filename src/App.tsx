import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from "react"
import {
  BookOpenTextIcon,
  ClockCounterClockwiseIcon,
  GlobeHemisphereWestIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
} from "@phosphor-icons/react"

import { PropertyMap } from "@/components/property-map"
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
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
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
  getInsights,
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

type ViewKey = "search" | "library" | "history"

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
    topWinningCode: properties.find((property) => property.bestCode && property.bestCode !== "BASELINE")?.bestCode || null,
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
          name: "All codes",
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
  const insights = getInsights(history)
  const refinedPropertyCount = properties.filter((property) => property.locationSource === "geocoded").length
  const filteredCodes = useMemo(() => {
    const term = deferredCodeSearch.trim().toLowerCase()
    return codes.filter((code) => {
      if (!term) return true
      return code.code.toLowerCase().includes(term) || code.company.toLowerCase().includes(term)
    })
  }, [codes, deferredCodeSearch])

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
    setActiveView("search")
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
        const nextHistory = [
          buildHistoryEntry(nextJob),
          ...history.filter((entry) => entry.id !== nextJob.id),
        ].slice(0, 10)
        setHistory(nextHistory)
        saveHistory(nextHistory)
        const firstProperty = summarizeProperties(nextJob.results)[0]?.name || null
        setSelectedProperty(firstProperty)
        saveSelectedProperty(firstProperty)
        setActiveView("search")
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
        const nextHistory = [
          buildHistoryEntry(retried),
          ...history.filter((entry) => entry.id !== retried.id),
        ].slice(0, 10)
        setHistory(nextHistory)
        saveHistory(nextHistory)
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

  useEffect(() => {
    if (!selectedProperty) return
    const element = propertyRefs.current[selectedProperty]
    if (!element) return
    element.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [selectedProperty])

  function focusProperty(name: string) {
    setSelectedProperty(name)
    saveSelectedProperty(name)
  }

  function toggleCodeSelection(code: string, checked: boolean) {
    updateSelected(
      checked ? [...selectedCodes, code] : selectedCodes.filter((item) => item !== code)
    )
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
    const nextCodes = mergeCodes(
      codes.filter((item) => !item.custom),
      nextCustomCodes,
      favoriteCodes
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
        codes.map((code) => code.code)
      )
    )
    savePresets(nextCustomPresets)
    setNewPresetName("")
  }

  const summaryCards = [
    {
      label: "Tracked searches",
      value: String(insights.trackedSearches),
      description: "Saved in this browser only.",
    },
    {
      label: "Best savings",
      value: insights.bestSavings ? `$${insights.bestSavings}` : "Waiting",
      description: "Measured against Marriott standard pricing.",
    },
    {
      label: "Winning code",
      value: insights.topCode ? codeLabel(insights.topCode.code) : "None yet",
      description: insights.topCode ? `${insights.topCode.count} recent wins` : "Run a live search to score this.",
    },
  ]

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar variant="floating">
          <SidebarHeader className="gap-4 border-b">
            <div className="flex items-center gap-3 px-2">
              <img alt="Ritz-Weaselton" className="size-12 rounded-lg object-cover ring-1 ring-border" src={logo} />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Hosted prototype</p>
                <p className="font-heading text-lg">Ritz-Weaselton</p>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Views</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {[
                    { key: "search" as ViewKey, label: "Search", icon: GlobeHemisphereWestIcon },
                    { key: "library" as ViewKey, label: "Library", icon: SlidersHorizontalIcon },
                    { key: "history" as ViewKey, label: "History", icon: ClockCounterClockwiseIcon },
                  ].map((item) => {
                    const Icon = item.icon
                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          isActive={activeView === item.key}
                          onClick={() => setActiveView(item.key)}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Briefing</SidebarGroupLabel>
              <SidebarGroupContent className="flex flex-col gap-3 px-2">
                {summaryCards.map((card) => (
                  <Card key={card.label} size="sm">
                    <CardHeader>
                      <CardDescription>{card.label}</CardDescription>
                      <CardTitle>{card.value}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-muted-foreground">{card.description}</CardContent>
                  </Card>
                ))}
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Recent runs</SidebarGroupLabel>
              <SidebarGroupContent>
                <ScrollArea className="h-[22rem] px-2">
                  <div className="flex flex-col gap-3">
                    {history.length ? (
                      history.map((entry) => (
                        <Card key={entry.id} size="sm">
                          <CardHeader>
                            <CardDescription>{formatDateTime(entry.createdAt)}</CardDescription>
                            <CardTitle>{entry.destination}</CardTitle>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-3">
                            <div className="flex flex-wrap gap-2 text-muted-foreground">
                              <Badge variant="secondary">{entry.propertyCount} properties</Badge>
                              <Badge variant="secondary">{entry.codes.length} codes</Badge>
                            </div>
                            <Button onClick={() => handleRestoreHistory(entry)} variant="outline">
                              Restore search
                            </Button>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <ClockCounterClockwiseIcon />
                          </EmptyMedia>
                          <EmptyTitle>No saved searches yet</EmptyTitle>
                          <EmptyDescription>Your local browser history will appear here after the first live run.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </div>
                </ScrollArea>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="bg-background/90">
          <div className="flex flex-col gap-6 p-4 md:p-6">
            <Card>
              <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <CardDescription>Marriott live API</CardDescription>
                  <CardTitle className="text-2xl">Quiet-luxury code comparison without browser tab scraping</CardTitle>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Preset b1GKybyYy</Badge>
                  <Badge variant="secondary">Safari-friendly UI</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <form className="grid gap-4" onSubmit={handleSearchSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-xs text-muted-foreground" htmlFor="city">City</label>
                      <Input id="city" onChange={(event) => setCity(event.target.value)} value={city} />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs text-muted-foreground" htmlFor="country">Country</label>
                      <Input id="country" maxLength={2} onChange={(event) => setCountry(event.target.value.toUpperCase())} value={country} />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs text-muted-foreground" htmlFor="checkIn">Check-in</label>
                      <Input id="checkIn" onChange={(event) => setCheckIn(event.target.value)} type="date" value={checkIn} />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs text-muted-foreground" htmlFor="checkOut">Check-out</label>
                      <Input id="checkOut" onChange={(event) => setCheckOut(event.target.value)} type="date" value={checkOut} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>STD</Badge>
                    <Badge variant="secondary">{selectedCodes.length} selected</Badge>
                    {selectedCodes.slice(0, 10).map((code) => (
                      <Badge key={code} variant="secondary">{codeLabel(code)}</Badge>
                    ))}
                    {selectedCodes.length > 10 ? (
                      <Badge variant="secondary">+{selectedCodes.length - 10} more</Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => (
                      <Button key={preset.id} onClick={() => handlePresetApply(preset)} type="button" variant="outline">
                        {preset.name}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button disabled={isSearching} type="submit">
                      <MagnifyingGlassIcon data-icon="inline-start" />
                      {isSearching ? "Searching live" : "Run live comparison"}
                    </Button>
                    <Button onClick={() => updateSelected(codes.map((code) => code.code))} type="button" variant="outline">
                      Use all codes
                    </Button>
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button type="button" variant="outline">
                          <MapPinIcon data-icon="inline-start" />
                          Open map
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="sm:max-w-xl">
                        <SheetHeader>
                          <SheetTitle>Property map</SheetTitle>
                          <SheetDescription>Using Marriott's live coordinates for every returned property.</SheetDescription>
                        </SheetHeader>
                        <div className="pt-4">
                          <PropertyMap onSelect={(name) => {
                            setSelectedProperty(name)
                            saveSelectedProperty(name)
                          }} properties={properties} selectedProperty={selectedProperty} />
                        </div>
                      </SheetContent>
                    </Sheet>
                    {job?.failedCodes.length ? (
                      <Button disabled={isSearching} onClick={handleRetryFailed} type="button" variant="outline">
                        Retry failed codes
                      </Button>
                    ) : null}
                  </div>
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                </form>

                <Card className="bg-muted/40" size="sm">
                  <CardHeader>
                    <CardDescription>Current search brief</CardDescription>
                    <CardTitle>{job ? `${properties.length} properties returned` : "Ready to compare"}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {job ? (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <Badge>{job.params.city}, {job.params.country}</Badge>
                          <Badge variant="secondary">{job.params.codes.length} codes</Badge>
                          <Badge variant="secondary">{job.failedCodes.length} failed</Badge>
                        </div>
                        <Separator />
                        <div className="grid gap-2 text-sm text-muted-foreground">
                          <div>Best savings: <span className="text-foreground">{properties[0] ? formatCurrency(properties[0].savings, properties[0].currency) : "No savings yet"}</span></div>
                          <div>Top winner: <span className="text-foreground">{properties.find((property) => property.bestCode && property.bestCode !== "BASELINE")?.bestCodeLabel || "STD"}</span></div>
                          <div>Completed: <span className="text-foreground">{formatDateTime(job.completedAt)}</span></div>
                        </div>
                      </>
                    ) : (
                      <Empty className="border">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <SparkleIcon />
                          </EmptyMedia>
                          <EmptyTitle>No search yet</EmptyTitle>
                          <EmptyDescription>Kick off a live rate pull and the best-code-first board will land here.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            <Tabs className="gap-4" defaultValue={activeView} value={activeView} onValueChange={(value) => setActiveView(value as ViewKey)}>
              <TabsList variant="line">
                <TabsTrigger value="search">Search board</TabsTrigger>
                <TabsTrigger value="library">Code library</TabsTrigger>
                <TabsTrigger value="history">Recent runs</TabsTrigger>
              </TabsList>

              <TabsContent value="search">
                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <Card>
                    <CardHeader>
                      <CardDescription>Best deal first</CardDescription>
                      <CardTitle>Property results</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {isSearching ? (
                        <div className="grid gap-3">
                          {Array.from({ length: 4 }).map((_, index) => (
                            <Skeleton className="h-32 w-full" key={index} />
                          ))}
                        </div>
                      ) : properties.length ? (
                        <ScrollArea className="h-[44rem] pr-3">
                          <div className="grid gap-4">
                            {properties.map((property) => (
                              <div
                                key={property.name}
                                ref={(element) => {
                                  propertyRefs.current[property.name] = element
                                }}
                              >
                              <Card
                                className={property.name === selectedProperty ? "cursor-pointer ring-2 ring-primary bg-primary/5 shadow-lg" : "cursor-pointer transition-shadow hover:shadow-md"}
                                onClick={() => focusProperty(property.name)}
                                size="sm"
                              >
                                <CardHeader>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge>{property.bestCodeLabel || "No rate"}</Badge>
                                    <Badge variant="secondary">{property.availableCodes} priced codes</Badge>
                                    {property.distance ? <Badge variant="secondary">{property.distance}</Badge> : null}
                                  </div>
                                  <CardTitle>{property.name}</CardTitle>
                                  <CardDescription>{property.description || "Live Marriott property result."}</CardDescription>
                                </CardHeader>
                                <CardContent className="grid gap-4 lg:grid-cols-[1fr_220px]">
                                  <div className="grid gap-3">
                                    <div className="flex flex-wrap gap-3 text-sm">
                                      <div>
                                        <div className="text-muted-foreground">Best price</div>
                                        <div className="font-heading text-xl">{formatCurrency(property.bestPrice, property.currency)}</div>
                                      </div>
                                      <div>
                                        <div className="text-muted-foreground">Baseline</div>
                                        <div className="font-heading text-xl">{formatCurrency(property.baselinePrice, property.currency)}</div>
                                      </div>
                                      <div>
                                        <div className="text-muted-foreground">Savings</div>
                                        <div className="font-heading text-xl">{formatCurrency(property.savings, property.currency)}</div>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {(property.rates || []).slice(0, 6).map((rate) => (
                                        <Badge key={`${property.name}-${rate.code}`} variant="secondary">
                                          {rate.label}: {rate.available ? formatCurrency(rate.price, rate.currency) : "No rate"}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-3">
                                    {property.imageUrl ? (
                                      <img
                                        alt={property.name}
                                        className="aspect-[4/3] rounded-xl object-cover ring-1 ring-border"
                                        src={property.imageUrl}
                                      />
                                    ) : null}
                                    <Button
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        focusProperty(property.name)
                                      }}
                                      variant="outline"
                                    >
                                      Focus on map
                                    </Button>
                                    {property.bookingUrl ? (
                                      <Button asChild>
                                        <a
                                          href={property.bookingUrl}
                                          onClick={(event) => event.stopPropagation()}
                                          rel="noreferrer"
                                          target="_blank"
                                        >
                                          Open booking path
                                        </a>
                                      </Button>
                                    ) : null}
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
                            <EmptyTitle>No live results yet</EmptyTitle>
                            <EmptyDescription>Run a search and this board will re-rank every property by savings and winning code.</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      )}
                    </CardContent>
                  </Card>

                  <div className="grid gap-4">
                    <Card>
                      <CardHeader>
                        <CardDescription>Map</CardDescription>
                        <CardTitle>Property positions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {properties.length ? (
                          <PropertyMap
                            onSelect={(name) => {
                              focusProperty(name)
                            }}
                            properties={properties}
                            selectedProperty={selectedProperty}
                          />
                        ) : (
                          <Empty className="border">
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <MapPinIcon />
                              </EmptyMedia>
                              <EmptyTitle>Map waiting on a search</EmptyTitle>
                              <EmptyDescription>The map uses Marriott coordinates first and refines suspicious markers only when a location needs help.</EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        )}
                        {properties.length ? (
                          <p className="mt-3 text-xs text-muted-foreground">
                            {refinedPropertyCount
                              ? `${refinedPropertyCount} properties were refined with fallback geocoding.`
                              : "All visible markers are using Marriott-provided coordinates."}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardDescription>Secondary compare</CardDescription>
                        <CardTitle>Code matrix</CardTitle>
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
                                {properties.slice(0, 16).map((property) => (
                                  <TableRow
                                    className={property.name === selectedProperty ? "bg-primary/8" : "cursor-pointer"}
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
                              <EmptyDescription>The secondary code table appears after your first live run.</EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="library">
                <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                  <Card>
                    <CardHeader>
                      <CardDescription>Custom tools</CardDescription>
                      <CardTitle>Presets and personal codes</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-6">
                      <form className="grid gap-3" onSubmit={handleSavePreset}>
                        <Input onChange={(event) => setNewPresetName(event.target.value)} placeholder="Save current selection as preset" value={newPresetName} />
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

                  <Card>
                    <CardHeader>
                      <CardDescription>Code library</CardDescription>
                      <CardTitle>Recommended, favorites, and your own codes</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <Input onChange={(event) => setCodeSearch(event.target.value)} placeholder="Filter by code or company" value={codeSearch} />
                      <ScrollArea className="h-[42rem] pr-3">
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
              </TabsContent>

              <TabsContent value="history">
                <Card>
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
                          <EmptyDescription>Recent searches stay in your browser so you can revisit them without any account system.</EmptyDescription>
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
              </TabsContent>
            </Tabs>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
