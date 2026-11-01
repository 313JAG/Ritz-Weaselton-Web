import { useCallback, useDeferredValue, useEffect, useMemo, useState, startTransition } from "react"
import {
  ClockCounterClockwiseIcon,
  CompassIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  MapTrifoldIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
} from "@phosphor-icons/react"

import { DestinationPicker } from "@/components/destination-picker"
import { ComparisonWorkspace } from "@/components/comparison-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  getBrowserState,
  normalizeCode,
  saveCustomCodes,
  saveEnabledCodes,
  saveFavoriteCodes,
  saveHistory,
  savePresets,
  saveSelectedProperty,
  type SearchHistoryEntry,
  type StoredCustomCode,
  type StoredPreset,
} from "@/lib/browser-store"
import {
  codeLabel,
  filterDefaultPresetCodes,
  formatDateTime,
  mergeCodes,
  mergePresets,
  summarizeProperties,
  uniqueCodes,
  type CatalogCode,
  type CatalogPreset,
  type CodeResult,
  type SearchJob,
} from "@/lib/transform"
import { addDaysToLocalDate, getLocalDate, normalizeStayDates } from "@/lib/destinations"
import logo from "../logo.jpg"

type BootstrapPayload = {
  codes: CatalogCode[]
  presets: CatalogPreset[]
  ratePreferences?: {
    excludedFromDefaultPresetCodes?: string[]
  }
}

type ViewKey = "search" | "results" | "library" | "history"

const searchPollDelayMs = 750

async function apiFetch<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, options)
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok) {
    throw new Error(data.error || "Request failed")
  }
  return data
}

function buildHistoryEntry(job: SearchJob): SearchHistoryEntry {
  const properties = summarizeProperties(job.results)
  return {
    id: job.id,
    createdAt: job.completedAt || job.updatedAt,
    destination: [job.params.city, job.params.country].filter(Boolean).join(", "),
    city: job.params.city,
    country: job.params.country,
    checkIn: job.params.checkIn,
    checkOut: job.params.checkOut,
    codes: job.params.codes.filter((code) => code !== "BASELINE"),
    propertyCount: properties.length,
    bestSavings: properties.reduce((best, property) => Math.max(best, property.savings), 0),
    topWinningCode:
      properties.find((property) => property.bestCode && property.bestCode !== "BASELINE")?.bestCode || null,
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>("search")
  const [city, setCity] = useState("Las Vegas")
  const [country, setCountry] = useState("US")
  const [checkIn, setCheckIn] = useState(() => getLocalDate())
  const [checkOut, setCheckOut] = useState(() => getLocalDate(1))
  const [codes, setCodes] = useState<Array<CatalogCode & { favorite?: boolean; custom?: boolean }>>([])
  const [codesReady, setCodesReady] = useState(false)
  const [presets, setPresets] = useState<StoredPreset[]>([])
  const [defaultPresetExcludedCodes, setDefaultPresetExcludedCodes] = useState<string[]>([])
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [favoriteCodes, setFavoriteCodes] = useState<string[]>([])
  const [customCodes, setCustomCodes] = useState<StoredCustomCode[]>([])
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [job, setJob] = useState<SearchJob | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [showUnavailableRates, setShowUnavailableRates] = useState(false)
  const [propertyQuery, setPropertyQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [codeSearch, setCodeSearch] = useState("")
  const [newCode, setNewCode] = useState("")
  const [newCodeCompany, setNewCodeCompany] = useState("")
  const [newPresetName, setNewPresetName] = useState("")
  const deferredCodeSearch = useDeferredValue(codeSearch)

  useEffect(() => {
    async function bootstrap() {
      const browser = getBrowserState()
      const payload = await apiFetch<BootstrapPayload>("/api/bootstrap")
      const mergedCodes = mergeCodes(payload.codes, browser.customCodes as CatalogCode[], browser.favoriteCodes)
      const excludedCodes = uniqueCodes(payload.ratePreferences?.excludedFromDefaultPresetCodes || [])
      const allCodeValues = filterDefaultPresetCodes(
        mergedCodes.map((code) => code.code),
        excludedCodes,
      )
      const recommendedCodes = filterDefaultPresetCodes(
        mergedCodes.filter((code) => code.recommended).map((code) => code.code),
        excludedCodes,
      )
      const defaultPresets = [
        {
          id: "all-codes",
          name: "All Codes",
          codes: allCodeValues,
          isDefault: true,
          dynamic: "all",
        },
        ...payload.presets.map((preset) => ({
          ...preset,
          codes: filterDefaultPresetCodes(preset.codes, excludedCodes),
        })),
      ]

      setCodes(mergedCodes)
      setCustomCodes(browser.customCodes)
      setFavoriteCodes(browser.favoriteCodes)
      setDefaultPresetExcludedCodes(excludedCodes)
      const quickPreset = defaultPresets.find((preset) => preset.id === "quick10")
      setSelectedCodes(browser.enabledCodes.length ? browser.enabledCodes : quickPreset?.codes || recommendedCodes)
      setPresets(mergePresets(defaultPresets, browser.presets, recommendedCodes, allCodeValues))
      setHistory(browser.history)
      setSelectedProperty(browser.selectedProperty)
      setCodesReady(true)
    }

    bootstrap().catch((caughtError: Error) => {
      setError(caughtError.message)
    })
  }, [])

  const codeCompanies = useMemo(() => Object.fromEntries(codes.map((code) => [code.code, code.company])), [codes])
  const properties = useMemo(() => (job ? summarizeProperties(job.results, codeCompanies) : []), [job, codeCompanies])
  const visibleProperties = useMemo(() => {
    const term = propertyQuery.trim().toLowerCase()
    return term
      ? properties.filter(
          (property) => property.name.toLowerCase().includes(term) || property.brandName.toLowerCase().includes(term),
        )
      : properties
  }, [properties, propertyQuery])
  const filteredCodes = useMemo(() => {
    const term = deferredCodeSearch.trim().toLowerCase()
    return codes.filter((code) => {
      if (!term) return true
      return code.code.toLowerCase().includes(term) || code.company.toLowerCase().includes(term)
    })
  }, [codes, deferredCodeSearch])

  const selectedPresetId = useMemo(() => {
    const normalizedSelected = uniqueCodes(selectedCodes)
    const matched = presets.find((preset) => {
      const presetCodes = uniqueCodes(preset.codes)
      return (
        presetCodes.length === normalizedSelected.length &&
        presetCodes.every((code, index) => code === normalizedSelected[index])
      )
    })
    return matched?.id ?? ""
  }, [presets, selectedCodes])

  const codeProgress = useMemo(() => {
    if (job?.codeStates)
      return Object.entries(job.codeStates)
        .filter(([code]) => code !== "BASELINE")
        .map(([code, state]) => ({
          code,
          status: state.status === "completed" ? "done" : state.status === "failed" ? "failed" : state.status,
        }))
    const finished = new Map((job?.results || []).map((result) => [result.code, result]))
    const running = new Set(job?.progress?.runningCodes || [