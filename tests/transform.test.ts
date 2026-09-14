import { describe, expect, it } from "vitest"
import { addDaysToLocalDate, getLocalDate, normalizeStayDates } from "../src/lib/destinations"
import {
  distanceBetweenCoordinatesMeters,
  filterDefaultPresetCodes,
  summarizeProperties,
  type CodeResult,
} from "../src/lib/transform"

const hotel = (
  propertyId: string,
  name: string,
  price: number,
  latitude: number | null = null,
  longitude: number | null = null,
) => ({
  propertyId,
  name,
  price,
  currency: "USD",
  rating: null,
  reviewCount: null,
  distance: "1 mi from destination",
  description: "",
  imageUrl: "",
  brandName: "Marriott",
  latitude,
  longitude,
})

describe("property comparison", () => {
  it("keeps same-named properties separate by Marriott property ID and shows every checked code", () => {
    const results: CodeResult[] = [
      {
        code: "BASELINE",
        success: true,
        error: null,
        url: "https://example.com/std",
        hotels: [hotel("A", "Downtown Marriott", 220), hotel("B", "Downtown Marriott", 260)],
      },
      {
        code: "AAA",
        success: true,
        error: null,
        url: "https://example.com/aaa",
        hotels: [hotel("A", "Downtown Marriott", 180)],
      },
      {
        code: "GOV",
        success: false,
        error: "TIMEOUT",
        url: "https://example.com/gov",
        hotels: [],
      },
    ]
    const properties = summarizeProperties(results, {
      AAA: "AAA",
      GOV: "Government",
    })

    expect(properties).toHaveLength(2)
    expect(properties.find((property) => property.propertyId === "A")?.rates).toMatchObject([
      { code: "BASELINE", price: 220, available: true },
      { code: "AAA", price: 180, available: true },
      { code: "GOV", available: false, error: "TIMEOUT" },
    ])
    expect(properties.find((property) => property.propertyId === "B")?.rates).toHaveLength(3)
    expect(properties.find((property) => property.propertyId === "A")).toMatchObject({
      bestCode: "AAA",
      bestPrice: 180,
      baselinePrice: 220,
      savings: 40,
    })
  })

  it("ranks by lowest price before savings and measures alternatives from the winner", () => {
    const results: CodeResult[] = [
      {
        code: "BASELINE",
        success: true,
        error: null,
        url: "https://example.com/std",
        hotels: [hotel("A", "Large saving", 500, 42.33, -83.04), hotel("B", "Lowest price", 180, 42.34, -83.04)],
      },
      {
        code: "DTC",
        success: true,
        error: null,
        url: "https://example.com/dtc",
        hotels: [hotel("A", "Large saving", 300, 42.33, -83.04), hotel("B", "Lowest price", 170, 42.34, -83.04)],
      },
    ]

    const properties = summarizeProperties(results)

    expect(properties.map((property) => property.propertyId)).toEqual(["B", "A"])
    expect(properties[0]).toMatchObject({
      bestPrice: 170,
      savings: 10,
      distanceFromCheapestMeters: 0,
    })
    expect(properties[1].distanceFromCheapestMeters).toBeGreaterThan(1_000)
    expect(properties[1].distanceFromCheapestMeters).toBeLessThan(1_200)
  })

  it("breaks equal-price ties by savings, then property name", () => {
    const results: CodeResult[] = [
      {
        code: "BASELINE",
        success: true,
        error: null,
        url: "https://example.com/std",
        hotels: [hotel("A", "Alpha", 250), hotel("B", "Beta", 300), hotel("C", "Charlie", 300)],
      },
      {
        code: "DTC",
        success: true,
        error: null,
        url: "https://example.com/dtc",
        hotels: [hotel("A", "Alpha", 200), hotel("B", "Beta", 200), hotel("C", "Charlie", 200)],
      },
    ]

    expect(summarizeProperties(results).map((property) => property.propertyId)).toEqual(["B", "C", "A"])
  })

  it("does not crown a numerically lower foreign-currency rate in a border market", () => {
    const cadHotel = {
      ...hotel("CAD", "Windsor hotel", 134, 42.32, -83.04),
      currency: "CAD",
    }
    const results: CodeResult[] = [
      {
        code: "BASELINE",
        success: true,
        error: null,
        url: "https://example.com/std",
        hotels: [
          hotel("USD1", "Detroit hotel", 170, 42.33, -83.04),
          hotel("USD2", "Another Detroit hotel", 180, 42.34, -83.04),
          { ...cadHotel, price: 168 },
        ],
      },
      {
        code: "DTC",
        success: true,
        error: null,
        url: "https://example.com/dtc",
        hotels: [
          hotel("USD1", "Detroit hotel", 152, 42.33, -83.04),
          hotel("USD2", "Another Detroit hotel", 160, 42.34, -83.04),
          cadHotel,
        ],
      },
    ]

    expect(summarizeProperties(results).map((property) => property.propertyId)).toEqual(["USD1", "USD2", "CAD"])
  })

  it("returns null distance when either property lacks coordinates", () => {
    expect(distanceBetweenCoordinatesMeters(42.33, -83.04, null, null)).toBeNull()
  })
})

describe("default rate presets", () => {
  it("omits manual-only rates without removing them from explicit selections", () => {
    const codes = ["DTC", "GOV", "AAA", "MMF", "GEE"]

    expect(filterDefaultPresetCodes(codes, ["GOV", "AAA", "MMF"])).toEqual(["DTC", "GEE"])
    expect(codes).toContain("GOV")
  })
})

describe("local date defaults", () => {
  it("returns an ISO local date and advances by one day", () => {
    const today = getLocalDate()
    const tomorrow = getLocalDate(1)
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(tomorrow > today).toBe(true)
  })

  it("clamps stale stays to today and tomorrow", () => {
    expect(normalizeStayDates("2025-01-01", "2025-01-03", "2026-09-14")).toEqual({
      checkIn: "2026-09-14",
      checkOut: "2026-09-15",
    })
  })

  it("keeps future check-in and enforces a one-night minimum", () => {
    expect(normalizeStayDates("2026-11-25", "2026-11-25", "2026-09-14")).toEqual({
      checkIn: "2026-11-25",
      checkOut: "2026-11-26",
    })
    expect(addDaysToLocalDate("2026-12-31")).toBe("2027-01-01")
  })

  it("recovers safely from malformed dates", () => {
    expect(normalizeStayDates("not-a-date", "", "2026-09-14")).toEqual({
      checkIn: "2026-09-14",
      checkOut: "2026-09-15",
    })
  })
})
