import { useEffect, useRef, useState } from "react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { PropertySummary } from "@/lib/transform"

declare global {
  interface Window {
    google?: any
    __rwGoogleMapsPromise?: Promise<any>
  }
}

type GooglePropertyMapProps = {
  properties: PropertySummary[]
  selectedProperty: string | null
  onSelect: (name: string) => void
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

function loadGoogleMaps() {
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps)
  }

  if (window.__rwGoogleMapsPromise) {
    return window.__rwGoogleMapsPromise
  }

  window.__rwGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=marker`
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google.maps)
      } else {
        reject(new Error("Google Maps failed to initialize"))
      }
    }
    script.onerror = () => reject(new Error("Google Maps failed to load"))
    document.head.appendChild(script)
  })

  return window.__rwGoogleMapsPromise
}

function buildPin(property: PropertySummary, active: boolean) {
  const amount = property.bestPrice !== null ? new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: property.currency || "USD",
    maximumFractionDigits: 0,
  }).format(property.bestPrice) : "No rate"

  const element = document.createElement("button")
  element.type = "button"
  element.className = `rw-google-pin${active ? " is-active" : ""}`
  element.innerHTML = `
    <span class="rw-google-pin-price">${amount}</span>
    <span class="rw-google-pin-code">${property.bestCodeLabel || "STD"}</span>
  `
  return element
}

export function GooglePropertyMap({
  properties,
  selectedProperty,
  onSelect,
}: GooglePropertyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const infoRef = useRef<any>(null)
  const [state, setState] = useState<"idle" | "loading" | "ready" | "missing-key" | "error">(
    GOOGLE_MAPS_API_KEY ? "loading" : "missing-key"
  )

  const points = properties.filter(
    (property) => typeof property.latitude === "number" && typeof property.longitude === "number"
  )

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !containerRef.current || mapRef.current) {
      return
    }

    let cancelled = false

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return

        mapRef.current = new maps.Map(containerRef.current, {
          center: { lat: 36.1699, lng: -115.1398 },
          zoom: 11,
          mapId: "ritz-weaselton-map",
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        })
        infoRef.current = new maps.InfoWindow()
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
  }, [])

  useEffect(() => {
    if (state !== "ready" || !mapRef.current || !window.google?.maps) return

    for (const marker of markersRef.current.values()) {
      marker.map = null
    }
    markersRef.current.clear()

    const bounds = new window.google.maps.LatLngBounds()

    for (const property of points) {
      const active = property.name === selectedProperty
      const content = buildPin(property, active)
      content.addEventListener("click", () => onSelect(property.name))

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current,
        position: { lat: property.latitude as number, lng: property.longitude as number },
        title: property.name,
        content,
        zIndex: active ? 1000 : 1,
      })

      marker.addListener("click", () => {
        onSelect(property.name)
        if (infoRef.current) {
          infoRef.current.setContent(`
            <div class="rw-google-info">
              <strong>${property.name}</strong><br/>
              Best code: ${property.bestCodeLabel || "STD"}<br/>
              Best price: ${property.bestPrice !== null ? new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: property.currency || "USD",
                maximumFractionDigits: 0,
              }).format(property.bestPrice) : "No rate"}
            </div>
          `)
          infoRef.current.open({
            map: mapRef.current,
            anchor: marker,
          })
        }
      })

      markersRef.current.set(property.name, marker)
      bounds.extend({ lat: property.latitude as number, lng: property.longitude as number })
    }

    if (points.length === 1) {
      mapRef.current.setCenter({
        lat: points[0].latitude as number,
        lng: points[0].longitude as number,
      })
      mapRef.current.setZoom(13)
    } else if (points.length > 1) {
      mapRef.current.fitBounds(bounds, 64)
    }

    if (selectedProperty) {
      const selected = points.find((property) => property.name === selectedProperty)
      const marker = selected ? markersRef.current.get(selected.name) : null
      if (selected && marker) {
        mapRef.current.panTo({ lat: selected.latitude as number, lng: selected.longitude as number })
      }
    }
  }, [onSelect, points, selectedProperty, state])

  if (state === "missing-key") {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <span className="rw-google-placeholder-dot" />
          </EmptyMedia>
          <EmptyTitle>Google Maps key needed</EmptyTitle>
          <EmptyDescription>Add `VITE_GOOGLE_MAPS_API_KEY` to enable the results map on hosted and local builds.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (state === "error") {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <span className="rw-google-placeholder-dot" />
          </EmptyMedia>
          <EmptyTitle>Google Maps failed to load</EmptyTitle>
          <EmptyDescription>The search results still work, but the map could not initialize in this session.</EmptyDescription>
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
          <EmptyTitle>Map waiting on properties</EmptyTitle>
          <EmptyDescription>The Google map will appear once the current search returns hotels with coordinates.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="min-h-[32rem] overflow-hidden rounded-none border border-border/70" ref={containerRef} />
      <p className="text-xs text-muted-foreground">
        Pins show the best available price first. Selecting a pin or hotel card keeps the map and ranked list in sync.
      </p>
    </div>
  )
}
