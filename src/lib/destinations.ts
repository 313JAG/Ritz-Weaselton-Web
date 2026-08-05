export const COUNTRIES = [
  ["AU", "Australia"], ["CA", "Canada"], ["CN", "China"], ["FR", "France"], ["DE", "Germany"],
  ["HK", "Hong Kong"], ["IN", "India"], ["IT", "Italy"], ["JP", "Japan"], ["MX", "Mexico"],
  ["NZ", "New Zealand"], ["SG", "Singapore"], ["ES", "Spain"], ["AE", "United Arab Emirates"],
  ["GB", "United Kingdom"], ["US", "United States"],
] as const

export const DESTINATIONS = [
  ["Adelaide", "AU"], ["Amsterdam", "NL"], ["Atlanta", "US"], ["Bangkok", "TH"], ["Barcelona", "ES"],
  ["Beijing", "CN"], ["Brisbane", "AU"], ["Chicago", "US"], ["Dubai", "AE"], ["Gold Coast", "AU"],
  ["Honolulu", "US"], ["Hong Kong", "HK"], ["Las Vegas", "US"], ["London", "GB"], ["Los Angeles", "US"],
  ["Melbourne", "AU"], ["Miami", "US"], ["New York", "US"], ["Paris", "FR"], ["Perth", "AU"],
  ["San Francisco", "US"], ["Singapore", "SG"], ["Sydney", "AU"], ["Tokyo", "JP"], ["Toronto", "CA"],
] as const

export function countryName(country: string) {
  return COUNTRIES.find(([code]) => code === country)?.[1] || country
}

export function getLocalDate(offsetDays = 0) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
}
