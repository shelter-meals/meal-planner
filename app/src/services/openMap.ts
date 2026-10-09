import OpeningHours from 'opening_hours'
import type { FoodPlace } from '../domain'

interface GeocodingResult {
  lat: string
  lon: string
  display_name: string
}

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements: OverpassElement[]
  osm3s?: { timestamp_osm_base?: string }
}

export interface PlaceSearchResult {
  matches: FoodPlace[]
  searchedAddress: string
  searchPoint: { lat: number; lon: number }
  dataTimestamp: string | null
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const METERS_PER_MILE = 1609.344
let lastGeocodingRequest = 0

function distanceMiles(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(to.lat - from.lat)
  const longitudeDelta = radians(to.lon - from.lon)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(longitudeDelta / 2) ** 2
  return (6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / 1.609344
}

function mapPlace(element: OverpassElement, point: { lat: number; lon: number }): FoodPlace | null {
  const tags = element.tags ?? {}
  const lat = element.lat ?? element.center?.lat
  const lon = element.lon ?? element.center?.lon
  const name = tags.name?.trim()
  if (lat === undefined || lon === undefined || !name) return null

  const amenity = tags.amenity
  const shop = tags.shop
  const category = amenity ? 'restaurant' : 'grocery'
  const typeLabel = amenity === 'fast_food'
    ? 'Fast food'
    : amenity === 'food_court'
      ? 'Food court'
      : amenity === 'cafe'
        ? 'Cafe'
        : amenity === 'restaurant'
          ? 'Restaurant'
          : shop === 'supermarket'
            ? 'Supermarket'
            : shop === 'convenience'
              ? 'Convenience store'
              : shop === 'butcher'
                ? 'Butcher'
                : shop === 'deli'
                  ? 'Deli'
                  : shop === 'health_food'
                    ? 'Health food store'
                    : 'Food store'

  return {
    id: `${element.type}-${element.id}`,
    name,
    category,
    typeLabel,
    lat,
    lon,
    distanceMiles: distanceMiles(point, { lat, lon }),
    tags,
  }
}

export async function searchFoodPlaces(address: string, radiusMiles: number): Promise<PlaceSearchResult> {
  const normalizedAddress = address.trim()
  if (!normalizedAddress) throw new Error('Enter a shelter address to search.')

  const cached = sessionStorage.getItem(`meal-planner-geocode:${normalizedAddress.toLowerCase()}`)
  let geocodingResult: GeocodingResult | undefined
  if (cached) {
    geocodingResult = JSON.parse(cached) as GeocodingResult
  } else {
    const waitMs = Math.max(0, 1100 - (Date.now() - lastGeocodingRequest))
    if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs))
    lastGeocodingRequest = Date.now()
    const url = new URL(NOMINATIM_URL)
    url.searchParams.set('q', normalizedAddress)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '1')
    url.searchParams.set('countrycodes', 'us')
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Address lookup failed (${response.status}). Try checking the address.`)
    const results = (await response.json()) as GeocodingResult[]
    geocodingResult = results[0]
    if (!geocodingResult) throw new Error('We could not find that address. Check it and try again.')
    sessionStorage.setItem(`meal-planner-geocode:${normalizedAddress.toLowerCase()}`, JSON.stringify(geocodingResult))
  }

  const point = { lat: Number(geocodingResult.lat), lon: Number(geocodingResult.lon) }
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    throw new Error('Address lookup returned an invalid location. Check the address and try again.')
  }

  const radiusMeters = Math.round(radiusMiles * METERS_PER_MILE)
  const query = `
    [out:json][timeout:25];
    (
      nwr(around:${radiusMeters},${point.lat},${point.lon})["amenity"~"^(restaurant|fast_food|cafe|food_court)$"];
      nwr(around:${radiusMeters},${point.lat},${point.lon})["shop"~"^(supermarket|convenience|butcher|deli|health_food|greengrocer)$"];
    );
    out center tags;
  `
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'application/json' },
    body: new URLSearchParams({ data: query }),
  })
  if (!response.ok) {
    throw new Error(`Nearby business search is unavailable right now (${response.status}). Try again later.`)
  }
  const data = (await response.json()) as OverpassResponse
  const matches = data.elements
    .map((element) => mapPlace(element, point))
    .filter((place): place is FoodPlace => place !== null && place.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
  return {
    matches,
    searchedAddress: geocodingResult.display_name,
    searchPoint: point,
    dataTimestamp: data.osm3s?.timestamp_osm_base ?? null,
  }
}

export type HoursState = 'open' | 'closed' | 'unknown' | 'unlisted'

export function getHoursState(hours: string | undefined, at: Date | null): HoursState {
  if (!hours) return 'unlisted'
  if (!at) return 'unknown'
  try {
    const parsed = new OpeningHours(hours)
    const state = parsed.getStateString(at)
    return state === 'open' ? 'open' : state === 'close' ? 'closed' : 'unknown'
  } catch (error) {
    console.warn('Could not interpret mapped opening-hours data.', error)
    return 'unknown'
  }
}

export function getDeliveryStatus(tags: Record<string, string>): 'listed' | 'pickup' | 'unknown' {
  if (tags.delivery?.toLowerCase() === 'yes') return 'listed'
  if (tags.delivery?.toLowerCase() === 'no') return 'pickup'
  return 'unknown'
}

export function getDietTag(tags: Record<string, string>, need: string): boolean {
  const key = need.toLowerCase().replace('-', '_')
  return tags[`diet:${key}`]?.toLowerCase() === 'yes'
}
