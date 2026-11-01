export const COUNTRIES = [
  ["AU", "Australia"],
  ["CA", "Canada"],
  ["CN", "China"],
  ["FR", "France"],
  ["DE", "Germany"],
  ["HK", "Hong Kong"],
  ["IN", "India"],
  ["IT", "Italy"],
  ["JP", "Japan"],
  ["MX", "Mexico"],
  ["NZ", "New Zealand"],
  ["SG", "Singapore"],
  ["ES", "Spain"],
  ["AE", "United Arab Emirates"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
] as const

export const DESTINATIONS = [
  ["Adelaide", "AU"],
  ["Amsterdam", "NL"],
  ["Atlanta", "US"],
  ["Bangkok", "TH"],
  ["Barcelona", "ES"],
  ["Beijing", "CN"],
  ["Brisbane", "AU"],
  ["Chicago", "US"],
  ["Detroit", "US"],
  ["Dubai", "AE"],
  ["Gold Coast", "AU"],
  ["Honolulu", "US"],
  ["Hong Kong", "HK"],
  ["Las Vegas", "US"],
  ["London", "GB"],
  ["Los Angeles", "US"],
  ["Melbourne", "AU"],
  ["Miami", "US"],
  ["New York", "US"],
  ["Paris", "FR"],
  ["Perth", "AU"],
  ["San Francisco", "US"],
  ["Singapore", "SG"],
  ["Sydney", "AU"],
  ["Tokyo", "JP"],
  ["Toronto", "CA"],
] as const

export function countryName(country: string) {
  return COUNTRIES.find(([code]) => code === country)?.[1] || country
}

export function getLocalDate(offsetDays = 0) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function isValidLocalDate(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

export function addDaysToLocalDate(isoDate: string, offsetDays = 1) {
  if (!isValidLocalDate(isoDate)) {
    return getLocalDate(offsetDays)
  }
  const [year, month, day] = isoDate.split("-").map(Number)
  const date = new Date(year, month - 1, day, 12)
  date.setDate(date.getDate() + offsetDays)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

export function normalizeStayDates(checkIn?: string, checkOut?: string, today = getLocalDate()) {
  const safeToday = isValidLocalDate(today) ? today : getLocalDate()
  const normalizedCheckIn = isValidLocalDate(checkIn) && checkIn >= safeToday ? checkIn : safeToday
  const minimumCheckOut = addDaysToLocalDate(normalizedCheckIn)
  const normalizedCheckOut = isValidLocalDate(checkOut) && checkOut >= minimumCheckOut ? checkOut : minimumCheckOut

  return {
    checkIn: normalizedCheckIn,
    checkOut: normalizedCheckOut,
  }
}
