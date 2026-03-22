export type CatalogCode = {
  code: string
  company: string
  recommended?: boolean
}

export type CatalogPreset = {
  id: string
  name: string
  codes: string[]
  isDefault?: boolean
  dynamic?: string | null
}

export type HotelResult = {
  propertyId: string
  name: string
  price: number | string
  currency: string | null
  rating: number | null
  reviewCount: number | null
  distanceMeters?: number | null
  distance: string
  description: string
  imageUrl: string
  brandName: string
  latitude: number | null
  longitude: number | null
  seoNickname?: string
  locationSource?: string | null
  locationLabel?: string | null
}

export type CodeResult = {
  code: string
  success: boolean
  error: string | null
  hotels: HotelResult[]
  url: string
}

export type SearchJob = {
  id: string
  status: string
  completedAt: string
  createdAt: string
  updatedAt: string
  params: {
    city: string
    country: string
    checkIn: string
    checkOut: string
    codes: string[]
  }
  failedCodes: string[]
  results: CodeResult[]
}

export type PropertySummary = {
  propertyId: string
  name: string
  brandName: string
  description: string
  imageUrl: string
  rating: number | null
  reviewCount: number | null
  distance: string
  latitude: number | null
  longitude: number | null
  locationSource: string | null
  locationLabel: string | null
  baselinePrice: number | null
  currency: string | null
  bestCode: string | null
  bestCodeLabel: string | null
  bestPrice: number | null
  bookingUrl: string
  savings: number
  availableCodes: number
  rates: Array<{
    code: string
    label: string
    price: number | null
    currency: string | null
    available: boolean
    bookingUrl: string
  }>
}

export function codeLabel(code: string) {
  return code === "BASELINE" ? "STD" : code
}

export function uniqueCodes(values: string[]) {
  return [...new Set(values.map((value) => String(value).trim().toUpperCase()).filter(Boolean))]
}

export function mergeCodes(
  remoteCodes: CatalogCode[],
  customCodes: CatalogCode[],
  favoriteCodes: string[]
) {
  const merged = new Map<string, CatalogCode & { favorite?: boolean; custom?: boolean }>()

  for (const code of remoteCodes) {
    merged.set(code.code, { ...code, favorite: false, custom: false })
  }

  for (const code of customCodes) {
    if (!code.code) continue
    merged.set(code.code, {
      code: code.code,
      company: code.company || "Personal code",
      recommended: false,
      favorite: false,
      custom: true,
    })
  }

  for (const favorite of favoriteCodes) {
    const entry = merged.get(favorite)
    if (entry) {
      entry.favorite = true
    }
  }

  return [...merged.values()].sort((left, right) => {
    if (Boolean(left.favorite) !== Boolean(right.favorite)) {
      return Number(Boolean(right.favorite)) - Number(Boolean(left.favorite))
    }
    if (Boolean(left.recommended) !== Boolean(right.recommended)) {
      return Number(Boolean(right.recommended)) - Number(Boolean(left.recommended))
    }
    return left.company.localeCompare(right.company) || left.code.localeCompare(right.code)
  })
}

export function mergePresets(
  defaults: CatalogPreset[],
  customs: CatalogPreset[],
  recommendedCodes: string[],
  allCodes: string[]
) {
  return [...defaults, ...customs].map((preset) => ({
    ...preset,
    codes:
      preset.dynamic === "recommended"
        ? recommendedCodes
        : preset.dynamic === "all"
          ? allCodes
          : uniqueCodes(preset.codes || []),
  }))
}

export function summarizeProperties(results: CodeResult[]) {
  const properties = new Map<string, PropertySummary>()
  const baseline = results.find((result) => result.code === "BASELINE")
  const baselinePrices = new Map(
    (baseline?.hotels || []).map((hotel) => [hotel.name, typeof hotel.price === "number" ? hotel.price : null])
  )

  for (const result of results) {
    for (const hotel of result.hotels || []) {
      const current = properties.get(hotel.name) || {
        propertyId: hotel.propertyId || "",
        name: hotel.name,
        brandName: hotel.brandName || "",
        description: hotel.description || "",
        imageUrl: hotel.imageUrl || "",
        rating: hotel.rating ?? null,
        reviewCount: hotel.reviewCount ?? null,
        distance: hotel.distance || "",
        latitude: hotel.latitude ?? null,
        longitude: hotel.longitude ?? null,
        locationSource: hotel.locationSource || null,
        locationLabel: hotel.locationLabel || null,
        baselinePrice: null,
        currency: hotel.currency || null,
        bestCode: null,
        bestCodeLabel: null,
        bestPrice: null,
        bookingUrl: "",
        savings: 0,
        availableCodes: 0,
        rates: [],
      }

      current.rates.push({
        code: result.code,
        label: codeLabel(result.code),
        price: typeof hotel.price === "number" ? hotel.price : null,
        currency: hotel.currency || null,
        available: typeof hotel.price === "number",
        bookingUrl: result.url,
      })

      properties.set(hotel.name, current)
    }
  }

  for (const property of properties.values()) {
    property.baselinePrice = baselinePrices.get(property.name) ?? null
    property.rates.sort((left, right) => {
      if (left.available !== right.available) return Number(right.available) - Number(left.available)
      return (left.price ?? Number.POSITIVE_INFINITY) - (right.price ?? Number.POSITIVE_INFINITY)
    })
    const best = property.rates.find((rate) => rate.available)
    property.bestCode = best?.code ?? null
    property.bestCodeLabel = best?.label ?? null
    property.bestPrice = best?.price ?? null
    property.currency = best?.currency ?? property.currency ?? null
    property.bookingUrl = best?.bookingUrl ?? ""
    property.availableCodes = property.rates.filter((rate) => rate.available).length
    property.savings =
      property.bestPrice !== null && property.baselinePrice !== null
        ? Math.max(property.baselinePrice - property.bestPrice, 0)
        : 0
  }

  return [...properties.values()].sort((left, right) => {
    if (right.savings !== left.savings) return right.savings - left.savings
    return (left.bestPrice ?? Number.POSITIVE_INFINITY) - (right.bestPrice ?? Number.POSITIVE_INFINITY)
  })
}

export function getInsights(history: Array<{ destination: string; bestSavings: number; topWinningCode: string | null }>) {
  const destinationCounts = new Map<string, number>()
  const codeCounts = new Map<string, number>()
  let bestSavings = 0

  for (const item of history) {
    destinationCounts.set(item.destination, (destinationCounts.get(item.destination) || 0) + 1)
    if (item.topWinningCode) {
      codeCounts.set(item.topWinningCode, (codeCounts.get(item.topWinningCode) || 0) + 1)
    }
    bestSavings = Math.max(bestSavings, item.bestSavings)
  }

  const topDestination = [...destinationCounts.entries()].sort((left, right) => right[1] - left[1])[0]
  const topCode = [...codeCounts.entries()].sort((left, right) => right[1] - left[1])[0]

  return {
    trackedSearches: history.length,
    bestSavings,
    topDestination: topDestination ? { destination: topDestination[0], count: topDestination[1] } : null,
    topCode: topCode ? { code: topCode[0], count: topCode[1] } : null,
  }
}

export function formatCurrency(value: number | null, currency: string | null) {
  if (value === null) return "No rate"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}
