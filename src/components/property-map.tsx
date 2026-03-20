import { useEffect, useRef } from "react"
import L from "leaflet"
import marker2x from "leaflet/dist/images/marker-icon-2x.png"
import marker from "leaflet/dist/images/marker-icon.png"
import shadow from "leaflet/dist/images/marker-shadow.png"

import type { PropertySummary } from "@/lib/transform"

L.Icon.Default.mergeOptions({
  iconRetinaUrl: marker2x,
  iconUrl: marker,
  shadowUrl: shadow,
})

type PropertyMapProps = {
  properties: PropertySummary[]
  selectedProperty: string | null
  onSelect: (name: string) => void
}

export function PropertyMap({
  properties,
  selectedProperty,
  onSelect,
}: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())

  function createMarkerIcon(active: boolean) {
    return L.divIcon({
      className: "rw-marker-shell",
      html: `<span class="rw-marker${active ? " is-active" : ""}"></span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -10],
    })
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
      scrollWheelZoom: false,
    }).setView([20, 0], 2)

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map)

    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    markersRef.current.clear()
    const points = properties.filter(
      (property) =>
        typeof property.latitude === "number" && typeof property.longitude === "number"
    )

    for (const property of points) {
      const isSelected = property.name === selectedProperty
      const markerInstance = L.marker([property.latitude as number, property.longitude as number], {
        icon: createMarkerIcon(isSelected),
        zIndexOffset: isSelected ? 600 : 0,
      })
      markerInstance.bindPopup(
        [
          `<strong>${property.name}</strong>`,
          property.bestCodeLabel ? `Best code: ${property.bestCodeLabel}` : "No winning code yet",
          property.locationLabel || "",
        ]
          .filter(Boolean)
          .join("<br>")
      )
      markerInstance.on("click", () => onSelect(property.name))
      markerInstance.addTo(layer)
      markersRef.current.set(property.name, markerInstance)
    }

    if (points.length) {
      map.fitBounds(
        L.latLngBounds(
          points.map((property) => [property.latitude as number, property.longitude as number])
        ).pad(0.18)
      )
    }

    if (selectedProperty) {
      const property = points.find((item) => item.name === selectedProperty)
      if (property) {
        const marker = markersRef.current.get(property.name)
        marker?.openPopup()
        map.panTo([property.latitude as number, property.longitude as number], { animate: true })
      }
    }
    window.setTimeout(() => map.invalidateSize(), 80)
  }, [properties, selectedProperty, onSelect])

  return <div className="min-h-[26rem] w-full rounded-xl border" ref={containerRef} />
}
