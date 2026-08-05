import { ArrowClockwiseIcon, MapPinIcon, SparkleIcon } from "@phosphor-icons/react"

import { PropertyMap } from "@/components/property-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatCurrency, type PropertySummary, type SearchJob } from "@/lib/transform"

type CodeProgress = { code: string; status: "done" | "queued" | "running" | "failed" }

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
  job, properties, visibleProperties, selectedProperty, propertyQuery, isSearching, codeProgress, showUnavailableRates,
  onBack, onCancel, onRetry, onSelect, onPropertyQuery, onToggleUnavailable,
}: Props) {
  const active = properties.find((property) => property.key === selectedProperty) || properties[0] || null
  const completed = job?.progress?.completedCodes || 0
  const total = job?.progress?.totalCodes || 0
  const progress = total ? Math.round((completed / total) * 100) : 0

  if (!job) {
    return <Empty className="rw-empty-results"><EmptyHeader><EmptyMedia variant="icon"><SparkleIcon /></EmptyMedia><EmptyTitle>Ready when you are</EmptyTitle><EmptyDescription>Run a live comparison to see each property and every selected rate in one place.</EmptyDescription></EmptyHeader><Button onClick={onBack} variant="outline">Start a search</Button></Empty>
  }

  return (
    <section className="rw-comparison">
      <header className="rw-comparison-head">
        <div>
          <p className="rw-eyebrow">Comparison desk</p>
          <h2>{job.params.city}<span>, {job.params.country}</span></h2>
          <p>{job.params.checkIn} → {job.params.checkOut} · {properties.length} properties found</p>
        </div>
        <div className="rw-results-actions">
          <Badge>{job.params.codes.length - 1} codes</Badge>
          <Button onClick={onBack} variant="outline">New search</Button>
          {job.failedCodes.length ? <Button disabled={isSearching} onClick={onRetry} variant="outline"><ArrowClockwiseIcon /> Retry failed</Button> : null}
          {job.status !== "completed" && job.status !== "cancelled" ? <Button onClick={onCancel} variant="outline">Stop run</Button> : null}
        </div>
      </header>

      {job.status !== "completed" && job.status !== "cancelled" ? (
        <div className="rw-run-status">
          <div><strong>Checking your selected codes</strong><span>{completed} of {total} complete · {job.failedCodes.length} failed</span></div>
          <div className="rw-progress-track"><i style={{ width: `${Math.max(3, progress)}%` }} /></div>
          <div className="rw-code-statuses">{codeProgress.map(({ code, status }) => <span className={cn(`is-${status}`)} key={code}>{status === "done" ? "✓" : status === "failed" ? "!" : status === "running" ? "…" : "○"} {code}</span>)}</div>
        </div>
      ) : null}

      <div className="rw-comparison-grid">
        <aside className="rw-property-index">
          <div className="rw-index-head"><div><strong>Properties</strong><span>Best saving first</span></div><Input onChange={(event) => onPropertyQuery(event.target.value)} placeholder="Find a hotel" value={propertyQuery} /></div>
          <div className="rw-property-rows">
            {visibleProperties.map((property, index) => (
              <button className={cn("rw-property-row", active?.key === property.key && "is-selected")} key={property.key} onClick={() => onSelect(property.key)} type="button">
                <span className="rw-rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="rw-property-name"><strong>{property.name}</strong><small>{property.brandName || "Marriott"} · {property.availableCodes} code rates</small></span>
                <span className="rw-property-price"><em>{property.bestCodeLabel || "—"}</em><strong>{formatCurrency(property.bestPrice, property.currency)}</strong><small>{formatCurrency(property.savings, property.currency)} saved</small></span>
              </button>
            ))}
          </div>
        </aside>

        <article className="rw-rate-detail">
          {active ? <>
            <div className="rw-detail-top">
              <div><p className="rw-eyebrow">Selected property</p><h3>{active.name}</h3><p>{active.brandName} {active.distance ? `· ${active.distance}` : ""}</p></div>
              {active.imageUrl ? <img alt="" src={active.imageUrl} /> : null}
            </div>
            <div className="rw-price-hero"><div><span>Best available rate</span><strong>{formatCurrency(active.bestPrice, active.currency)}</strong><em>per night · {active.bestCodeLabel || "No code"}</em></div><div><span>Standard rate</span><strong>{formatCurrency(active.baselinePrice, active.currency)}</strong></div><div className="is-saving"><span>You save</span><strong>{formatCurrency(active.savings, active.currency)}</strong></div></div>
            <div className="rw-matrix-head"><div><strong>Every checked rate</strong><span>Standard is a reference; the lowest available code wins.</span></div><Button onClick={onToggleUnavailable} size="sm" variant="outline">{showUnavailableRates ? "Available only" : "Show unavailable"}</Button></div>
            <div className="rw-rate-matrix"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Rate</TableHead><TableHead>vs standard</TableHead><TableHead>Availability</TableHead><TableHead /></TableRow></TableHeader><TableBody>{active.rates.filter((rate) => showUnavailableRates || rate.available).map((rate) => <TableRow className={rate.code === active.bestCode ? "rw-winning-rate" : ""} key={rate.code}><TableCell><strong>{rate.label}</strong><small>{rate.company}</small></TableCell><TableCell>{rate.available ? formatCurrency(rate.price, rate.currency) : "—"}</TableCell><TableCell>{rate.available && active.baselinePrice !== null && rate.price !== null ? formatCurrency(Math.max(active.baselinePrice - rate.price, 0), rate.currency) : "—"}</TableCell><TableCell>{rate.available ? rate.code === active.bestCode ? "Best rate" : "Available" : rate.error || "Unavailable"}</TableCell><TableCell>{rate.bookingUrl && rate.available ? <Button asChild size="sm"><a href={rate.bookingUrl} rel="noreferrer" target="_blank">Book</a></Button> : null}</TableCell></TableRow>)}</TableBody></Table></div>
          </> : <Empty><EmptyHeader><EmptyTitle>No property selected</EmptyTitle><EmptyDescription>Select one from the list to compare all rates.</EmptyDescription></EmptyHeader></Empty>}
        </article>

        <aside className="rw-map-panel"><div><p className="rw-eyebrow">Location</p><strong>Map is optional</strong><span>Pricing remains usable even if maps are unavailable.</span></div><PropertyMap onSelect={onSelect} properties={properties} selectedProperty={active?.key || null} /><Separator /><div className="rw-map-selected"><MapPinIcon /><span>{active?.name || "Choose a property"}</span></div></aside>
      </div>
    </section>
  )
}
