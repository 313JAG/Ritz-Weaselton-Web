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
