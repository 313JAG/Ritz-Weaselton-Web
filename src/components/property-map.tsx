import { useEffect, useMemo, useRef, useState } from "react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  diffMapPins,
  type MapPinSnapshot,
  toMapPinSnapshots,
} from "@/lib/map-annotations"
import { type PropertySummary } from "@/lib/transform"
import { loadAppleMapKit } from "@/lib/apple-mapkit"

type PropertyMapProps = {
  properties: PropertySummary[]
  selectedProperty: string | null
  winnerProperty?: string | null
  fitKey?: string
  onSelect: (key: string) => void
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
  const pinSnapshotsRef = useRef<MapPinSnapshot[]>([])
  const lastFitKeyRef = useRef("")
  const lastFitSignatureRef = useRef("")
  const onSelectRef = useRef(onSelect)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [mapMounted, setMapMounted] = useState(false)

  const pins = useMemo(
    () => toMapPinSnapshots(properties, selectedProperty, winnerProperty),
    [properties, selectedProperty, winnerProperty],
  )
  const hasPoints = pins.length > 0
  const pinSignature = pins.map((pin) => pin.key).join("|")

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Keep the map canvas mounted once we have ever had priced points so progressive
  // search updates never tear the MapKit instance down mid-run.
  useEffect(() => {
    if (hasPoints) setMapMounted(true)
  }, [hasPoints])

  useEffect(() => {
    if (!mapMounted || !containerRef.current || mapRef.current) return

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
      pinSnapshotsRef.current = []
      lastFitKeyRef.current = ""
      lastFitSignatureRef.current = ""
    }
  }, [mapMounted])

  useEffect(() => {
    if (state !== "ready" || !mapRef.current || !window.mapkit) return

    const mapkit = window.mapkit
    const map = mapRef.current
    const { added, updated, removed } = diffMapPins(pinSnapshotsRef.current, pins)

    for (const key of removed) {
      const annotation = annotationsRef.current.get(key)
      if (!annotation) continue
      map.removeAnnotation(annotation)
      annotationsRef.current.delete(key)
    }

    for (const pin of updated) {
      const annotation = annotationsRef.current.get(pin.key)
      if (!annotation) continue
      annotation.title = pin.name
      annotation.subtitle = pin.subtitle
      annotation.glyphText = pin.glyph
      annotation.color = pin.color
      annotation.selected = pin.key === selectedProperty
      if (
        annotation.coordinate?.latitude !== pin.latitude ||
        annotation.coordinate?.longitude !== pin.longitude
      ) {
        annotation.coordinate = new mapkit.Coordinate(pin.latitude, pin.longitude)
      }
    }

    if (added.length) {
      const annotations = added.map((pin) => {
        const annotation = new mapkit.MarkerAnnotation(new mapkit.Coordinate(pin.latitude, pin.longitude), {
          title: pin.name,
          subtitle: pin.subtitle,
          color: pin.color,
          glyphText: pin.glyph,
        })

        if (typeof annotation.addEventListener === "function") {
          annotation.addEventListener("select", () => onSelectRef.current(pin.key))
        }

        annotation.selected = pin.key === selectedProperty
        annotationsRef.current.set(pin.key, annotation)
        return annotation
      })
      map.addAnnotations(annotations)
    }

    pinSnapshotsRef.current = pins
  }, [pins, selectedProperty, state])

  useEffect(() => {
    if (state !== "ready" || !mapRef.current || !window.mapkit) return

    const annotations = [...annotationsRef.current.values()]
    if (!annotations.length) return

    const fitNeeded = lastFitKeyRef.current !== fitKey || lastFitSignatureRef.current === ""
    if (!fitNeeded) return

    mapRef.current.showItems(annotations, {
      animate: lastFitKeyRef.current === fitKey,
      padding: new window.mapkit.Padding(96, 72, 120, 72),
    })
    lastFitKeyRef.current = fitKey
    lastFitSignatureRef.current = pinSignature
  }, [fitKey, pinSignature, state])

  if (state === "error") {
    return (
      <Empty className="rw-property-map-fallback border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <span className="rw-google-placeholder-dot" />
          </EmptyMedia>
          <EmptyTitle>Apple Maps failed to load</EmptyTitle>
          <EmptyDescription>
            Ranked stays still work. Map pins will return once Apple Maps is available in this environment.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!mapMounted && !hasPoints) {
    return (
      <Empty className="rw-property-map-fallback border">
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
      {state === "ready" && !hasPoints ? (
        <span className="rw-map-loading">Waiting for the first priced hotel…</span>
      ) : null}
    </div>
  )
}
