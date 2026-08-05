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
  totalPrice?: number | string
  taxes?: number | null
  fees?: number | null
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
  completedAt: string | null
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
  progress: {
    totalCodes: number
    completedCodes: number
    successfulCodes: number
    failedCodes: number
    runningCodes?: string[]
    queuedCodes?: number
    workerLimit?: number
  }
  codeStates?: Record<string, { status: "queued" | "running" | "completed" | "failed"; attempts: number; error: string | null }>
  results: CodeResult[]
}

export type PropertySummary = {
  key: string
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
    totalPrice?: number | null
    taxes?: number | null
    fees?: number | null
    currency: string | null
    available: boolean
    bookingUrl: string
    company: string
    error: string | null
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

export function summarizeProperties(results: CodeResult[], codeCompanies: Record<string, string> = {}) {
  const properties = new Map<string, PropertySummary>()
  const baseline = results.find((result) => result.code === "BASELINE")
  const baselinePrices = new Map(
    (baseline?.hotels || []).map((hotel) => [hotel.propertyId || `name:${hotel.name.toLowerCase()}`, typeof hotel.price === "number" ? hotel.price : null])
  )

  for (const result of results) {
    for (const hotel of result.hotels || []) {
      const propertyKey = hotel.propertyId || `name:${hotel.name.toLowerCase()}`
      const current = properties.get(propertyKey) || {
        key: propertyKey,
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
        totalPrice: typeof hotel.totalPrice === "number" ? hotel.totalPrice : null,
        taxes: hotel.taxes ?? null,
        fees: hotel.fees ?? null,
        currency: hotel.currency || null,
        available: typeof hotel.price === "number",
        bookingUrl: result.url,
        company: result.code === "BASELINE" ? "Standard rate" : codeCompanies[result.code] || "Corporate code",
        error: result.success ? null : result.error,
      })

      properties.set(propertyKey, current)
    }
  }

  for (const property of properties.values()) {
    property.baselinePrice = baselinePrices.get(property.key) ?? null
    const presentCodes = new Set(property.rates.map((rate) => rate.code))
    for (const result of results) {
      if (presentCodes.has(result.code)) continue
      property.rates.push({
        code: result.code,
        label: codeLabel(result.code),
        price: null,
        totalPrice: null,
        taxes: null,
        fees: null,
        currency: property.currency,
        available: false,
        bookingUrl: result.url,
        company: result.code === "BASELINE" ? "Standard rate" : codeCompanies[result.code] || "Corporate code",
        error: result.success ? "No rate returned" : result.error || "Search failed",
      })
    }
    property.rates.sort((left, right) => {
      if (left.code === "BASELINE") return -1
      if (right.code === "BASELINE") return 1
      if (left.available !== right.available) return Number(right.available) - Number(left.available)
      return (left.price ?? Number.POSITIVE_INFINITY) - (right.price ?? Number.POSITIVE_INFINITY)
    })
    // Keep the standard rate pinned at the top of the detail matrix, but do
    // not let that presentation order choose the winner. The comparison card
    // must surface the lowest available selected code; standard is only the
    // fallback when no selected code returns a price.
    const pricedCodes = property.rates.filter((rate) => rate.available && rate.code !== "BASELINE")
    const best = (pricedCodes.length ? pricedCodes : property.rates.filter((rate) => rate.available))
      .reduce<typeof property.rates[number] | null>((winner, rate) =>
        !winner || (rate.price ?? Number.POSITIVE_INFINITY) < (winner.price ?? Number.POSITIVE_INFINITY)
          ? rate
          : winner,
      null)
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
    // Preserve cents when Marriott supplies them so a quote cannot appear to
    // differ simply because our display rounded it to a different whole dollar.
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
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
