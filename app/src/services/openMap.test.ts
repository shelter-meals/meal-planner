import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchFoodPlaces } from './openMap'

const geocodedAddress = {
  lat: '37.7729681',
  lon: '-122.4214546',
  display_name: '1663 Market Street, San Francisco, CA',
}

afterEach(() => vi.unstubAllGlobals())

describe('nearby business search fallback', () => {
  it('returns a grocery-planning result when the live business service is unavailable', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => JSON.stringify(geocodedAddress)),
      setItem: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unavailable', { status: 503 })))

    const result = await searchFoodPlaces('1663 Market Street, San Francisco, CA', 5)

    expect(result.matches).toEqual([])
    expect(result.nearbyError).toContain('(503)')
    expect(result.searchedAddress).toBe(geocodedAddress.display_name)
    expect(result.searchPoint).toEqual({ lat: 37.7729681, lon: -122.4214546 })
    expect(result.dataSource).toBeNull()
  })

  it('keeps successful nearby results marked as live data', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => JSON.stringify(geocodedAddress)),
      setItem: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      elements: [],
      osm3s: { timestamp_osm_base: '2026-10-09T00:00:00Z' },
      source: 'overpass',
    }), { headers: { 'Content-Type': 'application/json' } })))

    const result = await searchFoodPlaces('1663 Market Street, San Francisco, CA', 5)

    expect(result.nearbyError).toBeNull()
    expect(result.dataTimestamp).toBe('2026-10-09T00:00:00Z')
    expect(result.dataSource).toBe('overpass')
  })

  it('excludes coffee, tea, boba, and cafe businesses from restaurant results', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => JSON.stringify(geocodedAddress)),
      setItem: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      elements: [
        { type: 'node', id: 1, lat: 37.773, lon: -122.421, tags: { name: 'Coffee House', amenity: 'cafe' } },
        { type: 'node', id: 2, lat: 37.773, lon: -122.421, tags: { name: 'Tea Corner', amenity: 'restaurant' } },
        { type: 'node', id: 3, lat: 37.773, lon: -122.421, tags: { name: 'Boba Time', amenity: 'fast_food' } },
        { type: 'node', id: 4, lat: 37.773, lon: -122.421, tags: { name: 'Bubble Spot', amenity: 'restaurant', cuisine: 'bubble tea' } },
        { type: 'node', id: 5, lat: 37.773, lon: -122.421, tags: { name: 'Cafe Corner', amenity: 'restaurant' } },
        { type: 'node', id: 6, lat: 37.773, lon: -122.421, tags: { name: 'Lunch Kitchen', amenity: 'restaurant', cuisine: 'sandwich' } },
      ],
    }), { headers: { 'Content-Type': 'application/json' } })))

    const result = await searchFoodPlaces('1663 Market Street, San Francisco, CA', 5)

    expect(result.matches.map((place) => place.name)).toEqual(['Lunch Kitchen'])
  })
})
