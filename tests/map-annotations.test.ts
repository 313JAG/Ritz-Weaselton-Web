import { describe, expect, it } from "vitest"
import {
  diffMapPins,
  glyphLabel,
  markerColor,
  toMapPinSnapshots,
  type MapPinSnapshot,
} from "../src/lib/map-annotations"
import type { PropertySummary } from "../src/lib/transform"

function property(overrides: Partial<PropertySummary> & Pick<PropertySummary, "key" | "name">): PropertySummary {
  return {
    propertyId: overrides.key,
    brandName: "Marriott",
    description: "",
    imageUrl: "",
    rating: null,
    reviewCount: null,
    distance: "",
    latitude: 36.1,
    longitude: -115.1,
    locationSource: null,
    locationLabel: null,
    distanceFromCheapestMeters: null,
    baselinePrice: 200,
    currency: "USD",
    bestCode: "S9R",
    bestCodeLabel: "S9R",
    bestPrice: 120,
    bookingUrl: "",
    savings: 80,
    availableCodes: 1,
    rates: [],
    ...overrides,
  }
}

describe("map annotation sync", () => {
  it("builds priced coordinate pins and skips unpriced hotels", () => {
    const pins = toMapPinSnapshots(
      [
        property({ key: "a", name: "Alpha", bestPrice: 127 }),
        property({ key: "b", name: "Beta", bestPrice: null, latitude: 36.2, longitude: -115.2 }),
        property({ key: "c", name: "Gamma", bestPrice: 140, latitude: null, longitude: null }),
      ],
      "a",
      "a",
    )

    expect(pins).toHaveLength(1)
    expect(pins[0]).toMatchObject({
      key: "a",
      glyph: "127",
      subtitle: "127 USD",
      color: "#7f352b",
    })
  })

  it("diffs pins without treating identical snapshots as updates", () => {
    const previous: MapPinSnapshot[] = [
      {
        key: "a",
        name: "Alpha",
        latitude: 36.1,
        longitude: -115.1,
        glyph: "120",
        subtitle: "120 USD",
        color: "#285b4b",
      },
      {
        key: "b",
        name: "Beta",
        latitude: 36.2,
        longitude: -115.2,
        glyph: "140",
        subtitle: "140 USD",
        color: "#c08f52",
      },
    ]
    const next: MapPinSnapshot[] = [
      {
        key: "a",
        name: "Alpha",
        latitude: 36.1,
        longitude: -115.1,
        glyph: "115",
        subtitle: "115 USD",
        color: "#285b4b",
      },
      {
        key: "c",
        name: "Charlie",
        latitude: 36.3,
        longitude: -115.3,
        glyph: "99",
        subtitle: "99 USD",
        color: "#c08f52",
      },
    ]

    const diff = diffMapPins(previous, next)
    expect(diff.removed).toEqual(["b"])
    expect(diff.added.map((pin) => pin.key)).toEqual(["c"])
    expect(diff.updated.map((pin) => pin.key)).toEqual(["a"])
  })

  it("keeps glyph and color helpers stable for progressive updates", () => {
    expect(glyphLabel({ bestPrice: 999.4 })).toBe("999")
    expect(glyphLabel({ bestPrice: 1000 })).toBe("999+")
    expect(markerColor("winner", "other", "winner")).toBe("#285b4b")
    expect(markerColor("selected", "selected", "winner")).toBe("#7f352b")
  })

  it("avoids remove-all recreation when progressive search only updates prices", () => {
    const firstPass = toMapPinSnapshots(
      [
        property({ key: "a", name: "Alpha", bestPrice: 180 }),
        property({ key: "b", name: "Beta", bestPrice: 210, latitude: 36.2, longitude: -115.2 }),
      ],
      null,
      "a",
    )
    const secondPass = toMapPinSnapshots(
      [
        property({ key: "a", name: "Alpha", bestPrice: 127 }),
        property({ key: "b", name: "Beta", bestPrice: 135, latitude: 36.2, longitude: -115.2 }),
        property({ key: "c", name: "Charlie", bestPrice: 149, latitude: 36.3, longitude: -115.3 }),
      ],
      "c",
      "a",
    )

    const diff = diffMapPins(firstPass, secondPass)
    expect(diff.removed).toEqual([])
    expect(diff.added.map((pin) => pin.key)).toEqual(["c"])
    expect(diff.updated.map((pin) => pin.key).sort()).toEqual(["a", "b"])
  })
})
