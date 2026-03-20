export type StoredCustomCode = {
  code: string
  company: string
}

export type StoredPreset = {
  id: string
  name: string
  codes: string[]
  isDefault?: boolean
  dynamic?: string | null
}

export type SearchHistoryEntry = {
  id: string
  createdAt: string
  destination: string
  city: string
  country: string
  checkIn: string
  checkOut: string
  codes: string[]
  propertyCount: number
  bestSavings: number
  topWinningCode: string | null
}

const STORAGE_KEYS = {
  customCodes: "rw_custom_codes",
  enabledCodes: "rw_enabled_codes",
  favoriteCodes: "rw_favorite_codes",
  history: "rw_history",
  presets: "rw_presets",
  selectedProperty: "rw_selected_property",
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function normalizeCode(code: string) {
  return String(code || "").trim().toUpperCase()
}

export function getBrowserState() {
  return {
    customCodes: readJson<StoredCustomCode[]>(STORAGE_KEYS.customCodes, []),
    enabledCodes: readJson<string[]>(STORAGE_KEYS.enabledCodes, []),
    favoriteCodes: readJson<string[]>(STORAGE_KEYS.favoriteCodes, []),
    history: readJson<SearchHistoryEntry[]>(STORAGE_KEYS.history, []),
    presets: readJson<StoredPreset[]>(STORAGE_KEYS.presets, []),
    selectedProperty: readJson<string | null>(STORAGE_KEYS.selectedProperty, null),
  }
}

export function saveEnabledCodes(codes: string[]) {
  writeJson(STORAGE_KEYS.enabledCodes, codes)
}

export function saveFavoriteCodes(codes: string[]) {
  writeJson(STORAGE_KEYS.favoriteCodes, codes)
}

export function saveCustomCodes(codes: StoredCustomCode[]) {
  writeJson(STORAGE_KEYS.customCodes, codes)
}

export function savePresets(presets: StoredPreset[]) {
  writeJson(STORAGE_KEYS.presets, presets)
}

export function saveHistory(history: SearchHistoryEntry[]) {
  writeJson(STORAGE_KEYS.history, history)
}

export function saveSelectedProperty(name: string | null) {
  writeJson(STORAGE_KEYS.selectedProperty, name)
}
