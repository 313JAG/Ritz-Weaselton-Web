import { useEffect, useMemo, useRef, useState } from "react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { type PropertySummary } from "@/lib/transform"

declare global {
  interface Window {
    mapkit?: any
    __rwAppleMapsPromise?: Promise<any>
    __rwAppleMapsInitialized?: boolean
    __rwAppleMapsReady?: () => void
  }
}

type PropertyMapProps = {
  properties: PropertySummary[]
  selectedProperty: string | null
  onSelect: (key: string) => void
}

function loadAppleMapKit() {
  if (window.mapkit) {
    return Promise.resolve(window.mapkit)
  }

  if (window.__rwAppleMapsPromise) {
    return window.__rwAppleMapsPromise
  }

  window.__rwAppleMapsPromise = new Promise((resolve, reject) => {
    window.__rwAppleMapsReady = () => {
      if (window.mapkit) {
        resolve(window.mapkit)
      } else {
        reject(new Error("Apple Maps failed to initialize"))
      }
    }

    const script = document.createElement("script")
    script.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"
    script.async = true
    script.crossOrigin = "anonymous"
    script.setAttribute("data-callback", "__rwAppleMapsReady")
    script.onerror = () => reject(new Error("Apple Maps failed to load"))
    document.head.appendChild(script)
  })

  return window.__rwAppleMapsPromise
}

async function initializeAppleMapKit() {
  const mapkit = await loadAppleMapKit()

  if (!window.__rwAppleMapsInitialized) {
    mapkit.init({
      authorizationCallback: async (done: (token: string) => void) => {
        const response = await fetch("/api/apple-maps-token")
        const data = await response.json().catch(() => ({}))

        if (!response.ok || !data.token) {
          throw new Error(data.error || "Apple Maps token request failed")
        }

        done(data.token)
      },
    })
    window.__rwAppleMapsInitialized = true
  }

  return mapkit
}

function glyphLabel(property: PropertySummary) {
  if (property.bestPrice === null) return "—"

  const rounded = Math.round(property.bestPrice)
  if (rounded > 999) return "999+"
  return String(rounded)
}

export function PropertyMap({ properties, selectedProperty, onSelect }: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const annotationsRef = useRef<Map<string, any>>(new Map())
  const fittedRef = useRef(false)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  const points = useMemo(
    () =>
      properties.filter(
        (property) =>
          property.bestPrice !== null &&
          typeof property.latitude === "number" &&
          typeof property.longitude === "number"
      ),
    [properties]
  )

  useEffect(() => {
    if (!points.length || !containerRef.current || mapRef.current) return

    let cancelled = false

    initializeAppleMapKit()
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
    }
  }, [points.length])

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
          title: "",
          subtitle: "",
          color: property.key === selectedProperty ? "#b76419" : "#caa06a",
          glyphText: glyphLabel(property),
        }
      )

      if (typeof annotation.addEventListener === "function") {
          annotation.addEventListener("select", () => onSelect(property.key))
      }

      annotationsRef.current.set(property.key, annotation)
      return annotation
    })

    if (annotations.length) {
      map.addAnnotations(annotations)
      if (!fittedRef.current) {
        map.showItems(annotations, {
          animate: true,
          padding: new mapkit.Padding(80, 56, 80, 56),
        })
        fittedRef.current = true
      }
    }
  }, [onSelect, points, state])

  useEffect(() => {
    if (state !== "ready") return

    for (const [name, annotation] of annotationsRef.current.entries()) {
      annotation.color = name === selectedProperty ? "#b76419" : "#caa06a"
      annotation.selected = name === selectedProperty
    }
  }, [selectedProperty, state])

  if (state === "error") {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <span className="rw-google-placeholder-dot" />
          </EmptyMedia>
          <EmptyTitle>Apple Maps failed to load</EmptyTitle>
          <EmptyDescription>The search results still work, but the Apple Maps view could not initialize in this session.</EmptyDescription>
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
    <div className="grid gap-3">
      <div className="min-h-[32rem] overflow-hidden rounded-none border border-border/70" ref={containerRef} />
      <p className="text-xs text-muted-foreground">
        Apple Maps shows your hotel results as price-first pins. Selecting a pin or hotel card keeps the map and ranked list in sync.
      </p>
    </div>
  )
}
