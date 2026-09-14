import { useEffect, useMemo, useRef, useState } from "react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { type PropertySummary } from "@/lib/transform"
import { loadAppleMapKit } from "@/lib/apple-mapkit"

type PropertyMapProps = {
  properties: PropertySummary[]
  selectedProperty: string | null
  winnerProperty?: string | null
  fitKey?: string
  onSelect: (key: string) => void
}

function glyphLabel(property: PropertySummary) {
  if (property.bestPrice === null) return "—"

  const rounded = Math.round(property.bestPrice)
  if (rounded > 999) return "999+"
  return String(rounded)
}

function markerColor(key: string, selectedProperty: string | null, winnerProperty: string | null) {
  if (key === selectedProperty) return "#7f352b"
  if (key === winnerProperty) return "#285b4b"
  return "#c08f52"
}

export function PropertyMap({
  properties,
  selectedProperty,
  winnerProperty = null,
  fitKey = "",
  onSelect,
}: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const annotationsRef = useRef<Map<string, any>>(new Map())
  const lastFitKeyRef = useRef("")
  const onSelectRef = useRef(onSelect)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  const points = useMemo(
    () =>
      properties.filter(
        (property) =>
          property.bestPrice !== null &&
          typeof property.latitude === "number" &&
          typeof property.longitude === "number",
      ),
    [properties],
  )
  const hasPoints = points.length > 0

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!hasPoints || !containerRef.current || mapRef.current) return

    let cancelled = false
    const annotations = annotationsRef.current

    loadAppleMapKit()
      .then((mapkit) => {
        if (cancelled || !containerRef.current) return

        mapRef.current = new mapkit.Map(containerRef.current, {
          showsCompass: mapkit.FeatureVisibility.Hidden,
          showsMapTypeControl: false,
          showsZoomControl: true,
          isRotationEnabled: false,
          isScrollEnabled: true,
          showsPointsOfInterest: false,
        })

        if ("showsPointsOfInterest" in mapRef.current) {
          mapRef.current.showsPointsOfInterest = false
        }
        if (mapkit.PointOfInterestFilter?.excludingAll) {
          mapRef.current.pointOfInterestFilter = mapkit.PointOfInterestFilter.excludingAll
        }

        setState("ready")
      })
      .catch(() => {
        if (!cancelled) {
          setState("error")
        }
      })

    return () => {
      cancelled = true
      if (mapRef.current && typeof mapRef.current.destroy === "function") {
        mapRef.current.destroy()
      }
      mapRef.current = null
      annotations.clear()
      lastFitKeyRef.current = ""
    }
  }, [hasPoints])

  useEffect(() => {
    if (state !== "ready" || !mapRef.current || !window.mapkit) return

    const mapkit = window.mapkit
    const map = mapRef.current
    const existing = [...annotationsRef.current.values()]

    if (existing.length) {
      map.removeAnnotations(existing)
      annotationsRef.current.clear()
    }

    const annotations = points.map((property) => {
      const annotation = new mapkit.MarkerAnnotation(
        new mapkit.Coordinate(property.latitude as number, property.longitude as number),
        {
          title: property.name,
          subtitle: `${glyphLabel(property)} ${property.currency || ""}`.trim(),
          color: markerColor(property.key, null, winnerProperty),
          glyphText: glyphLabel(property),
        },
      )

      if (typeof annotation.addEventListener === "function") {
        annotation.addEventListener("select", () => onSelectRef.current(property.key))
      }

      annotationsRef.current.set(property.key, annotation)
      return annotation
    })

    if (annotations.length) {
      map.addAnnotations(annotations)
    }
  }, [points, state, winnerProperty])

  useEffect(() => {
    if (state !== "ready" || !mapRef.current || !window.mapkit || lastFitKeyRef.current === fitKey) {
      return
    }

    const annotations = [...annotationsRef.current.values()]
    if (!annotations.length) return

    mapRef.current.showItems(annotations, {
      animate: true,
      padding: new window.mapkit.Padding(96, 72, 120, 72),
    })
    lastFitKeyRef.current = fitKey
  }, [fitKey, points.length, state])

  useEffect(() => {
    if (state !== "ready") return

    for (const [key, annotation] of annotationsRef.current.entries()) {
      annotation.color = markerColor(key, selectedProperty, winnerProperty)
      annotation.selected = key === selectedProperty
    }
  }, [selectedProperty, state, winnerProperty])

  if (state === "error") {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <span className="rw-google-placeholder-dot" />
          </EmptyMedia>
          <EmptyTitle>Apple Maps failed to load</EmptyTitle>
          <EmptyDescription>
            The search results still work, but the Apple Maps view could not initialize in this session.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!points.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <span className="rw-google-placeholder-dot" />
          </EmptyMedia>
          <EmptyTitle>Map waiting on priced properties</EmptyTitle>
          <EmptyDescription>
            The Apple map appears once the current search returns hotels with coordinates and a live rate.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="rw-property-map">
      <div className="rw-property-map-canvas" ref={containerRef} />
      {state === "loading" ? <span className="rw-map-loading">Loading price map…</span> : null}
    </div>
  )
}
