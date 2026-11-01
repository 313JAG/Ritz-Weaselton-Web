import type { PropertySummary } from "@/lib/transform"

export type MapPinSnapshot = {
  key: string
  name: string
  latitude: number
  longitude: number
  glyph: string
  subtitle: string
  color: string
}

export function glyphLabel(property: Pick<PropertySummary, "bestPrice">) {
  if (property.bestPrice === null) return "—"

  const rounded = Math.round(property.bestPrice)
  if (rounded > 999) return "999+"
  return String(rounded)
}

export function markerColor(key: string, selectedProperty: string | null, winnerProperty: string | null) {
  if (key === selectedProperty) return "#7f352b"
  if (key === winnerProperty) return "#285b4b"
  return "#c08f52"
}

export function toMapPinSnapshots(
  properties: PropertySummary[],
  selectedProperty: string | null = null,
  winnerProperty: string | null = null,
): MapPinSnapshot[] {
  return properties
    .filter(
      (property) =>
        property.bestPrice !== null &&
        typeof property.latitude === "number" &&
        typeof property.longitude === "number",
    )
    .map((property) => {
      const glyph = glyphLabel(property)
      return {
        key: property.key,
        name: property.name,
        latitude: property.latitude as number,
        longitude: property.longitude as number,
        glyph,
        subtitle: `${glyph} ${property.currency || ""}`.trim(),
        color: markerColor(property.key, selectedProperty, winnerProperty),
      }
    })
}

/**
 * Compute add/update/remove ops so map markers can be patched in place
 * instead of tearing the whole annotation set down on every search tick.
 */
export function diffMapPins(previous: MapPinSnapshot[], next: MapPinSnapshot[]) {
  const previousByKey = new Map(previous.map((pin) => [pin.key, pin]))
  const nextByKey = new Map(next.map((pin) => [pin.key, pin]))

  const removed = previous.filter((pin) => !nextByKey.has(pin.key)).map((pin) => pin.key)
  const added = next.filter((pin) => !previousByKey.has(pin.key))
  const updated = next.filter((pin) => {
    const prior = previousByKey.get(pin.key)
    if (!prior) return false
    return (
      prior.glyph !== pin.glyph ||
      prior.subtitle !== pin.subtitle ||
      prior.name !== pin.name ||
      prior.color !== pin.color ||
      prior.latitude !== pin.latitude ||
      prior.longitude !== pin.longitude
    )
  })

  return { added, updated, removed }
}
