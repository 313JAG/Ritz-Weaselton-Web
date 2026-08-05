import { useEffect, useRef, useState } from "react"
import { MapPinIcon, SpinnerGapIcon } from "@phosphor-icons/react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DESTINATIONS } from "@/lib/destinations"
import { loadAppleMapKit } from "@/lib/apple-mapkit"

type Choice = { label: string; city: string; country: string; searchTerm: string; raw?: any }

async function mapkitSearch() {
  const mapkit = await loadAppleMapKit()
  return new mapkit.Search({ includeAddresses: true, includePointsOfInterest: true, includeQueries: false })
}

function requestPlaces(search: any, query: any): Promise<any> {
  // MapKit JS 5 (the same library that renders our map) delivers both search
  // and autocomplete through callbacks. Wrap that public API so a failed
  // service request reaches the picker rather than being mistaken for no POIs.
  return new Promise((resolve, reject) => {
    search.search(query, (error: Error | null, data?: any) => error ? reject(error) : resolve(data || {}))
  })
}

function requestAutocomplete(search: any, query: string): Promise<any> {
  return new Promise((resolve, reject) => {
    search.autocomplete(query, (error: Error | null, data?: any) => error ? reject(error) : resolve(data || {}))
  })
}

function fallback(query: string): Choice[] {
  return DESTINATIONS.filter(([city]) => city.toLowerCase().includes(query.toLowerCase())).slice(0, 6).map(([city, country]) => ({ label: `${city}, ${country}`, city, country, searchTerm: city }))
}

function choicesFromAutocomplete(results: any[], query: string): Choice[] {
  return results.map((result: any) => ({
    label: (result.displayLines || [result.name, result.locality]).filter(Boolean).join(", "),
    city: result.locality || result.name || query,
    country: result.countryCode || "US",
    searchTerm: result.name || result.locality || query,
    raw: result,
  }))
}

function choicesFromPlaces(places: any[], query: string): Choice[] {
  return places.map((place: any) => ({
    label: [place.name, place.locality || place.formattedAddress].filter(Boolean).join(", "),
    city: place.locality || place.name || query,
    country: place.countryCode || "US",
    searchTerm: place.name || place.locality || query,
    raw: place,
  }))
}

export function DestinationPicker({ value, onChange }: { value: string; onChange: (city: string, country: string) => void }) {
  const [query, setQuery] = useState(value)
  const [choices, setChoices] = useState<Choice[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSelected, setHasSelected] = useState(false)
  const request = useRef(0)

  useEffect(() => setQuery(value), [value])

  async function find(next: string) {
    setQuery(next)
    setHasSelected(false)
    // Keep the form usable worldwide even when Maps is slow, unavailable, or
    // has not suggested a specific place yet. A selected suggestion later
    // replaces this with Apple's resolved place and country.
    onChange(next, "")
    const token = ++request.current
    if (next.trim().length < 2) return setChoices([])
    setLoading(true)
    try {
      const search = await mapkitSearch()
      const data = await requestAutocomplete(search, next)
      if (token !== request.current) return
      const autocompleteChoices = choicesFromAutocomplete(data.results || [], next)
      // Autocomplete often ranks cities ahead of a named venue. Always merge
      // the direct place lookup and show those precise POI results first.
      const placeChoices = choicesFromPlaces((await requestPlaces(search, next)).places || [], next)
      const deduped = [...placeChoices, ...autocompleteChoices].filter((choice, index, all) =>
        Boolean(choice.label) && all.findIndex((other) => other.label === choice.label) === index,
      )
      setChoices(deduped.slice(0, 6))
    } catch {
      if (token === request.current) setChoices(fallback(next))
    } finally {
      if (token === request.current) setLoading(false)
    }
  }

  async function select(choice: Choice) {
    let city = choice.city
    let country = choice.country
    let searchTerm = choice.searchTerm
    try {
      if (choice.raw) {
        const response = await requestPlaces(await mapkitSearch(), choice.raw)
        const place = response.places?.[0]
        city = place?.locality || city
        country = place?.countryCode || country
        searchTerm = place?.name || searchTerm
      }
    } catch { /* autocomplete already provides a usable destination */ }
    onChange(searchTerm, country)
    setQuery(searchTerm)
    setChoices([])
    setHasSelected(true)
  }

  const freeTextChoice: Choice | null = query.trim().length >= 2 && !loading && !hasSelected && choices.length === 0
    ? { label: query.trim(), city: query.trim(), country: "", searchTerm: query.trim() }
    : null

  return <div className="relative">
    <input name="city" type="hidden" value={value} />
    <div className="relative"><MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="h-14 pl-10 pr-10 text-base md:text-lg" id="city" onChange={(event) => void find(event.target.value)} placeholder="City, landmark, airport, or neighbourhood" value={query} />{loading ? <SpinnerGapIcon className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}</div>
    {choices.length || freeTextChoice ? <div className="absolute z-20 mt-2 grid w-full overflow-hidden rounded-xl border bg-popover p-1 shadow-xl">{choices.map((choice) => <Button className="justify-start whitespace-normal px-3 py-3 text-left" key={`${choice.label}-${choice.city}`} onClick={() => void select(choice)} type="button" variant="ghost"><MapPinIcon className="shrink-0" />{choice.label}</Button>)}{freeTextChoice ? <Button className="justify-start whitespace-normal px-3 py-3 text-left" onClick={() => void select(freeTextChoice)} type="button" variant="ghost"><MapPinIcon className="shrink-0" />{freeTextChoice.label}</Button> : null}</div> : null}
  </div>
}
