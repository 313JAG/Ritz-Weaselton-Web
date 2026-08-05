import { describe, expect, it } from "vitest"
import { getLocalDate } from "../src/lib/destinations"
import { summarizeProperties, type CodeResult } from "../src/lib/transform"

const hotel = (propertyId: string, name: string, price: number) => ({
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
  latitude: null,
  longitude: null,
})

describe("property comparison", () => {
  it("keeps same-named properties separate by Marriott property ID and shows every checked code", () => {
    const results: CodeResult[] = [
      { code: "BASELINE", success: true, error: null, url: "https://example.com/std", hotels: [hotel("A", "Downtown Marriott", 220), hotel("B", "Downtown Marriott", 260)] },
      { code: "AAA", success: true, error: null, url: "https://example.com/aaa", hotels: [hotel("A", "Downtown Marriott", 180)] },
      { code: "GOV", success: false, error: "TIMEOUT", url: "https://example.com/gov", hotels: [] },
    ]
    const properties = summarizeProperties(results, { AAA: "AAA", GOV: "Government" })

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
})

describe("local date defaults", () => {
  it("returns an ISO local date and advances by one day", () => {
    const today = getLocalDate()
    const tomorrow = getLocalDate(1)
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(tomorrow > today).toBe(true)
  })
})
