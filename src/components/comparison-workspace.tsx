import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowClockwiseIcon, MapPinIcon, SparkleIcon } from "@phosphor-icons/react"

import { PropertyMap } from "@/components/property-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { formatCurrency, type PropertySummary, type SearchJob } from "@/lib/transform"

type CodeProgress = { code: string; status: string }

function formatAustralianDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-")
  return year && month && day ? `${day}/${month}/${year}` : isoDate
}

function formatDistanceFromCheapest(meters: number | null, isCheapest: boolean) {
  if (isCheapest) return "Lowest rate"
  if (meters === null) return "Distance unavailable"
  if (meters < 20) return "Same area as cheapest"

  const miles = meters / 1609.344
  return `${miles < 0.1 ? "<0.1" : miles.toFixed(1)} mi from cheapest`
}

function priceDelta(property: PropertySummary, cheapest: PropertySummary | null) {
  if (
    property.bestPrice === null ||
    cheapest?.bestPrice === null ||
    !cheapest ||
    property.currency !== cheapest.currency
  ) {
    return null
  }
  return Math.max(property.bestPrice - cheapest.bestPrice, 0)
}

type RateDetailProps = {
  property: PropertySummary
  stayNights: number
  showUnavailableRates: boolean
  onToggleUnavailable: () => void
}

function RateDetail({ property, stayNights, showUnavailableRates, onToggleUnavailable }: RateDetailProps) {
  const [showMatrix, setShowMatrix] = useState(false)
  const bestRate = property.rates.find((rate) => rate.code === property.bestCode)

  return (
    <div className="rw-sheet-body">
      {property.imageUrl ? (
        <img alt={`${property.name} exterior`} className="rw-sheet-image" src={property.imageUrl} />
      ) : null}

      <div className="rw-sheet-price">
        <div>
          <span>Best nightly rate</span>
          <strong>{formatCurrency(property.bestPrice, property.currency)}</strong>
          <small>via {property.bestCodeLabel || "standard rate"}</small>
        </div>
        <div>
          <span>Stay total</span>
          <strong>{formatCurrency(bestRate?.totalPrice ?? null, property.currency)}</strong>
          <small>
            {stayNights} {stayNights === 1 ? "night" : "nights"}
          </small>
        </div>
        <div>
          <span>Standard nightly</span>
          <strong>{formatCurrency(property.baselinePrice, property.currency)}</strong>
          <small>{formatCurrency(property.savings, property.currency)} saved nightly</small>
        </div>
      </div>

      <div className="rw-sheet-actions">
        {property.bookingUrl ? (
          <Button asChild>
            <a href={property.bookingUrl} rel="noreferrer" target="_blank">
              Open Marriott
            </a>
          </Button>
        ) : null}
        <Button onClick={() => setShowMatrix((current) => !current)} variant="outline">
          {showMatrix ? "Hide rate details" : "See all rates"}
        </Button>
      </div>

      {showMatrix ? (
        <>
          <Separator />
          <div className="rw-matrix-head">
            <div>
              <strong>Every checked Marriott rate</strong>
              <span>Marriott confirms taxes and fees at checkout.</span>
            </div>
            <Button onClick={onToggleUnavailable} size="sm" variant="ghost">
              {showUnavailableRates ? "Available only" : "Show unavailable"}
            </Button>
          </div>
          <div className="rw-rate-matrix">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rate</TableHead>
                  <TableHead>Nightly</TableHead>
                  <TableHead>Stay</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {property.rates
                  .filter((rate) => showUnavailableRates || rate.available)
                  .map((rate) => (
                    <TableRow className={rate.code === property.bestCode ? "rw-winning-rate" : ""} key={rate.code}>
                      <TableCell>
                        <strong>{rate.label}</strong>
                        <small>{rate.company}</small>
                      </TableCell>
                      <TableCell>{rate.available ? formatCurrency(rate.price, rate.currency) : "—"}</TableCell>
                      <TableCell>
                        {rate.available ? formatCurrency(rate.totalPrice ?? null, rate.currency) : "—"}
                      </TableCell>
                      <TableCell>
                        {rate.available && rate.bookingUrl ? (
                          <Button asChild size="sm" variant="ghost">
                            <a href={rate.bookingUrl} rel="noreferrer" target="_blank">
                              Book
                            </a>
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
    </div>
  )
}

type Props = {
  job: SearchJob | null
  properties: PropertySummary[]
  visibleProperties: PropertySummary[]
  selectedProperty: string | null
  propertyQuery: string
  isSearching: boolean
  codeProgress: CodeProgress[]
  showUnavailableRates: boolean
  onBack: () => void
  onCancel: () => void
  onRetry: () => void
  onSelect: (key: string) => void
  onPropertyQuery: (value: string) => void
  onToggleUnavailable: () => void
}

export function ComparisonWorkspace({
  job,
  properties,
  visibleProperties,
  selectedProperty,
  propertyQuery,
  isSearching,
  codeProgress,
  showUnavailableRates,
  onBack,
  onCancel,
  onRetry,
  onSelect,
  onPropertyQuery,
  onToggleUnavailable,
}: Props) {
  const [detailOpen, setDetailOpen] = useState(false)
  const isMobile = useIsMobile()
  const listRef = useRef<HTMLDivElement | null>(null)
  const cheapest = properties.find((property) => property.bestPrice !== null) || null
  const active = properties.find((property) => property.key === selectedProperty) || cheapest || properties[0] || null
  const propertyRanks = useMemo(
    () => new Map(properties.map((property, index) => [property.key, index + 1])),
    [properties],
  )
  const stayNights = Math.max(
    1,
    Math.round(
      (new Date(`${job?.params.checkOut || ""}T12:00:00`).getTime() -
        new Date(`${job?.params.checkIn || ""}T12:00:00`).getTime()) /
        86400000,
    ) || 1,
  )
  const completed = job?.progress?.completedCodes || 0
  const total = job?.progress?.totalCodes || 0
  const progress = total ? Math.round((completed / total) * 100) : 0
  const pricedPropertyCount = properties.filter((property) => property.bestPrice !== null).length
  const mappablePropertyCount = properties.filter(
    (property) =>
      property.bestPrice !== null &&
      typeof property.latitude === "number" &&
      typeof property.longitude === "number",
  ).length
  const activeDelta = active ? priceDelta(active, cheapest) : null
  const isRunning = Boolean(job && job.status !== "completed" && job.status !== "cancelled")
  const showMapSelection = Boolean(active && mappablePropertyCount > 0 && active.key !== cheapest?.key)

  useEffect(() => {
    if (!active?.key || !listRef.current) return
    const row = listRef.current.querySelector<HTMLElement>(`[data-property-key="${CSS.escape(active.key)}"]`)
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [active?.key])

  function showDetails(key: string) {
    onSelect(key)
    setDetailOpen(true)
  }

  if (!job) {
    return (
      <Empty className="rw-empty-results">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SparkleIcon />
          </EmptyMedia>
          <EmptyTitle>Ready when you are</EmptyTitle>
          <EmptyDescription>Run a live comparison to see the cheapest stay and nearby choices.</EmptyDescription>
        </EmptyHeader>
        <Button onClick={onBack} variant="outline">
          Start a search
        </Button>
      </Empty>
    )
  }

  return (
    <section className="rw-comparison">
      <header className="rw-comparison-head">
        <div>
          <p className="rw-eyebrow">Results map</p>
          <h1>
            {job.params.city}
            <span>, {job.params.country}</span>
          </h1>
          <p>
            {formatAustralianDate(job.params.checkIn)} → {formatAustralianDate(job.params.checkOut)} ·{" "}
            {pricedPropertyCount}/{properties.length} priced
            {isRunning ? " · updating live" : ""}
          </p>
        </div>
        <div className="rw-results-actions">
          <Badge variant="secondary">{Math.max(job.params.codes.length - 1, 0)} codes</Badge>
          <Button onClick={onBack} variant="outline">
            Edit search
          </Button>
          {job.failedCodes.length ? (
            <Button disabled={isSearching} onClick={onRetry} variant="outline">
              <ArrowClockwiseIcon /> Retry failed
            </Button>
          ) : null}
          {isRunning ? (
            <Button onClick={onCancel} variant="outline">
              Stop
            </Button>
          ) : null}
        </div>
      </header>

      {isRunning ? (
        <div className="rw-run-status" aria-live="polite">
          <div>
            <strong>Comparing Marriott rates</strong>
            <span>
              {completed} of {total} codes · pins update without resetting the map
            </span>
          </div>
          <div className="rw-progress-track">
            <i style={{ width: `${Math.max(3, progress)}%` }} />
          </div>
          <details>
            <summary>Code activity</summary>
            <div className="rw-code-statuses">
              {codeProgress.map(({ code, status }) => (
                <span className={cn(`is-${status}`)} key={code}>
                  {status === "done" ? "✓" : status === "failed" ? "!" : status === "running" ? "…" : "○"} {code}
                </span>
              ))}
            </div>
          </details>
        </div>
      ) : null}

      <div className="rw-map-first-grid">
        <article className="rw-map-canvas">
          {cheapest ? (
            <div className="rw-winner-strip">
              <div className="rw-winner-strip-copy">
                <span className="rw-winner-label">
                  <SparkleIcon weight="fill" />
                  Lowest {cheapest.currency || "comparable"} rate
                </span>
                <strong>{cheapest.name}</strong>
                <small>
                  {formatCurrency(cheapest.bestPrice, cheapest.currency)} / night · via{" "}
                  {cheapest.bestCodeLabel || "standard"}
                  {cheapest.savings > 0
                    ? ` · save ${formatCurrency(cheapest.savings, cheapest.currency)} vs standard`
                    : ""}
                </small>
              </div>
              <div className="rw-winner-strip-actions">
                <Button onClick={() => onSelect(cheapest.key)} size="sm" variant="outline">
                  <MapPinIcon /> Focus
                </Button>
                <Button onClick={() => showDetails(cheapest.key)} size="sm">
                  Rates
                </Button>
              </div>
            </div>
          ) : (
            <div className="r