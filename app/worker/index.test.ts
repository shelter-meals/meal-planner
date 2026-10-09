import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  handleMenuDiscovery,
  normalizeWebsiteUrl,
  parseRobotsTxt,
  robotsAllows,
} from './index'

const environment = { ALLOWED_ORIGINS: 'http://localhost:5173' }

function menuRequest(places: unknown[], origin = 'http://localhost:5173'): Request {
  return new Request('https://menu-worker.example/api/menu-discovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ places }),
  })
}

function nearbyRequest(
  body: unknown,
  origin = 'http://localhost:5173',
  method = 'POST',
): Request {
  return new Request('https://menu-worker.example/api/nearby-food', {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('nearby OpenStreetMap proxy', () => {
  it('validates coordinates and the supported radius before calling Overpass', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(nearbyRequest({
      lat: 91,
      lon: -122,
      radiusMiles: 5,
    }), environment)
    expect(response.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards bounded coordinates to Overpass and returns nearby listing data', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toBe('https://overpass-api.de/api/interpreter')
      expect(init?.headers).toMatchObject({ 'User-Agent': 'ShelterMealPlanner/0.1' })
      const body = init?.body as URLSearchParams
      expect(body.get('data')).toContain('around:8047,37.7729681,-122.4214546')
      expect(body.get('data')).toContain('[out:json][timeout:15]')
      return new Response(JSON.stringify({
        elements: [{ type: 'node', id: 123, lat: 37.77, lon: -122.42, tags: { name: 'Cafe' } }],
        osm3s: { timestamp_osm_base: '2026-10-09T00:00:00Z' },
      }), { headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(nearbyRequest({
      lat: 37.7729681,
      lon: -122.4214546,
      radiusMiles: 5,
    }), environment)
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
    expect(await response.json()).toMatchObject({
      elements: [{ id: 123, tags: { name: 'Cafe' } }],
      osm3s: { timestamp_osm_base: '2026-10-09T00:00:00Z' },
    })
  })

  it('reports upstream unavailability as a service error', async () => {
    const fetch = vi.fn(async () => new Response('Unavailable', { status: 429 }))
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(nearbyRequest({
      lat: 37.77,
      lon: -122.42,
      radiusMiles: 10,
    }), environment)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('servers are temporarily unavailable'),
    })
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('uses the secondary Overpass server when the primary is unavailable', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://overpass-api.de/api/interpreter') {
        return new Response('Unavailable', { status: 504 })
      }
      expect(String(input)).toBe('https://overpass.private.coffee/api/interpreter')
      return new Response(JSON.stringify({
        elements: [{ type: 'node', id: 456, lat: 37.77, lon: -122.42, tags: { name: 'Fallback Cafe' } }],
        osm3s: { timestamp_osm_base: '2026-10-09T00:00:00Z' },
      }), { headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(nearbyRequest({
      lat: 37.7729681,
      lon: -122.4214546,
      radiusMiles: 5,
    }), environment)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      elements: [{ id: 456, tags: { name: 'Fallback Cafe' } }],
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('skips successful responses with invalid OpenStreetMap timestamps', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/reverse') {
        const grocerySearch = url.searchParams.getAll('osm_tag').some((tag) => tag.startsWith('shop:'))
        return new Response(JSON.stringify({
          features: grocerySearch ? [] : [{
            geometry: { coordinates: [-122.42, 37.77] },
            properties: {
              name: 'Photon Fallback',
              osm_id: 789,
              osm_key: 'amenity',
              osm_type: 'N',
              osm_value: 'restaurant',
            },
          }],
        }), { headers: { 'Content-Type': 'application/geo+json' } })
      }
      return new Response(JSON.stringify({
        elements: [],
        osm3s: { timestamp_osm_base: '117609' },
      }), { headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(nearbyRequest({
      lat: 37.7729681,
      lon: -122.4214546,
      radiusMiles: 5,
    }), environment)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      elements: [{ id: 789, tags: { name: 'Photon Fallback' } }],
      source: 'photon',
    })
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('does not return malformed map data as an empty successful search', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      elements: [],
      osm3s: { timestamp_osm_base: '117608' },
    }), { headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(nearbyRequest({
      lat: 37.77,
      lon: -122.42,
      radiusMiles: 5,
    }), environment)
    expect(response.status).toBe(503)
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('requests only named listings that can be displayed', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const queryBody = init?.body
      const query = queryBody instanceof URLSearchParams ? queryBody.get('data') ?? '' : ''
      expect(query).toContain('["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]["name"]')
      expect(query).toContain('["shop"~"^(supermarket|convenience)$"]["name"]')
      expect(query).not.toContain('butcher')
      expect(query).not.toContain('liquor')
      expect(query).not.toContain('car_wash')
      return new Response(JSON.stringify({
        elements: [],
        osm3s: { timestamp_osm_base: '2026-10-09T00:00:00Z' },
      }), { headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(nearbyRequest({
      lat: 37.7729681,
      lon: -122.4214546,
      radiusMiles: 5,
    }), environment)
    expect(response.status).toBe(200)
  })

  it('searches restaurants and grocery stores separately in the Photon fallback', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'photon.komoot.io') {
        expect(url.pathname).toBe('/reverse')
        expect(url.searchParams.get('radius')).toBe('8.04672')
        expect(url.searchParams.get('limit')).toBe('50')
        const tags = url.searchParams.getAll('osm_tag')
        const grocerySearch = tags.includes('shop:supermarket')
        expect(tags.every((tag) => tag.startsWith(grocerySearch ? 'shop:' : 'amenity:'))).toBe(true)
        const features = grocerySearch
          ? Array.from({ length: 5 }, (_, index) => ({
            geometry: { coordinates: [-122.4213, 37.7731] },
            properties: {
              name: `Market ${index}`,
              osm_id: 987 + index,
              osm_key: 'shop',
              osm_type: 'N',
              osm_value: 'supermarket',
            },
          }))
          : Array.from({ length: 50 }, (_, index) => ({
            geometry: { coordinates: [-122.4213, 37.7731] },
            properties: {
              name: `Restaurant ${index}`,
              osm_id: index + 1,
              osm_key: 'amenity',
              osm_type: 'N',
              osm_value: 'restaurant',
            },
          }))
        return new Response(JSON.stringify({
          features,
        }), { headers: { 'Content-Type': 'application/geo+json' } })
      }
      return new Response('Unavailable', { status: 504 })
    })
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(nearbyRequest({
      lat: 37.7729681,
      lon: -122.4214546,
      radiusMiles: 5,
    }), environment)
    expect(response.status).toBe(200)
    const data = await response.json() as {
      source: string
      elements: { type: string; id: number; tags: Record<string, string> }[]
    }
    expect(data.source).toBe('photon')
    expect(data.elements).toHaveLength(55)
    expect(data.elements.filter((element) => element.tags.shop === 'supermarket')).toHaveLength(5)
    expect(data.elements.filter((element) => element.tags.amenity === 'restaurant')).toHaveLength(50)
    expect(fetch).toHaveBeenCalledTimes(5)
  })
})

describe('menu website safety checks', () => {
  it('upgrades mapped HTTP website links and rejects local, IP, and credential URLs', () => {
    expect(normalizeWebsiteUrl('http://restaurant.example/menu')?.href)
      .toBe('https://restaurant.example/menu')
    expect(normalizeWebsiteUrl('https://localhost/menu')).toBeNull()
    expect(normalizeWebsiteUrl('https://127.0.0.1/menu')).toBeNull()
    expect(normalizeWebsiteUrl('https://user:secret@restaurant.example/menu')).toBeNull()
  })

  it('applies site-specific robots rules and longest allow/disallow matches', () => {
    const rules = parseRobotsTxt([
      'User-agent: *',
      'Disallow: /private',
      'Allow: /private/menu',
      '',
      'User-agent: ShelterMealPlanner',
      'Disallow: /menu$',
    ].join('\n'))
    expect(robotsAllows(rules, '/menu')).toBe(false)
    expect(robotsAllows(rules, '/menu/lunch')).toBe(true)
    expect(robotsAllows(rules, '/private/menu')).toBe(true)
    expect(robotsAllows(rules, '/private/account')).toBe(true)
    const wildcardRules = parseRobotsTxt('User-agent: *\nDisallow: /private\nAllow: /private/menu')
    expect(robotsAllows(wildcardRules, '/private/menu')).toBe(true)
    expect(robotsAllows(wildcardRules, '/private/account')).toBe(false)
  })

  it('rejects requests from origins not configured for the app', async () => {
    const response = await handleMenuDiscovery(menuRequest([], 'https://unknown.example'), environment)
    expect(response.status).toBe(403)
  })

  it('serves only the menu discovery endpoint', async () => {
    const request = new Request('https://menu-worker.example/other', {
      headers: { Origin: 'http://localhost:5173' },
    })
    const response = await handleMenuDiscovery(request, environment)
    expect(response.status).toBe(404)
  })

  it('refuses to fetch menu pages that robots.txt disallows', async () => {
    const fetch = vi.fn(async () => new Response(
      'User-agent: *\nDisallow: /',
      { headers: { 'Content-Type': 'text/plain' } },
    ))
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(menuRequest([
      { id: 'place-1', website: 'https://restaurant.example/' },
    ]), environment)
    const body = await response.json() as { results: Array<{ status: string }> }
    expect(body.results[0].status).toBe('robots_disallowed')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('explains when a website exceeds the bounded page size and returns its website link', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /', { headers: { 'Content-Type': 'text/plain' } })
      }
      return new Response('<html></html>', {
        headers: { 'Content-Type': 'text/html', 'Content-Length': '1000001' },
      })
    })
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(menuRequest([
      { id: 'place-1', website: 'https://restaurant.example/' },
    ]), environment)
    const body = await response.json() as {
      results: Array<{ status: string; menuUrl: string; message: string }>
    }
    expect(body.results[0]).toMatchObject({
      status: 'page_too_large',
      menuUrl: 'https://restaurant.example/',
      message: expect.stringContaining('Open the website or call'),
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not follow redirects away from the mapped business website', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /', { headers: { 'Content-Type': 'text/plain' } })
      }
      return new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } })
    })
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(menuRequest([
      { id: 'place-1', website: 'https://restaurant.example/' },
    ]), environment)
    const body = await response.json() as { results: Array<{ status: string }> }
    expect(body.results[0].status).toBe('blocked_redirect')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('returns extracted structured menu data without fetching or retaining it elsewhere', async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Menu',
      hasMenuSection: {
        '@type': 'MenuSection',
        name: 'Sandwiches',
        hasMenuItem: {
          '@type': 'MenuItem',
          name: 'Garden Sandwich',
          suitableForDiet: 'https://schema.org/VegetarianDiet',
        },
      },
    })}</script>`
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /', { headers: { 'Content-Type': 'text/plain' } })
      }
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    })
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(menuRequest([
      { id: 'place-1', website: 'https://restaurant.example/' },
    ]), environment)
    const body = await response.json() as {
      results: Array<{ status: string; items: Array<{ name: string; section: string }> }>
    }
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body.results[0]).toMatchObject({
      status: 'menu_found',
      items: [{ name: 'Garden Sandwich', section: 'Sandwiches' }],
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('reads visible items and prices from linked menu pages on the same site', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /', { headers: { 'Content-Type': 'text/plain' } })
      }
      if (url.endsWith('/')) {
        return new Response('<a href="/menu">Food menu</a><a href="/lunch-menu">Lunch menu</a>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      if (url.endsWith('/lunch-menu')) {
        return new Response(`
          <main><h1>Lunch menu</h1><h2>Sandwiches</h2>
            <h3>Chicken sandwich</h3>
            <p>Grilled chicken with greens and tomato.</p><span>$11</span>
          </main>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      return new Response(`
        <main><h1>Menu</h1><h2>Bowls</h2>
          <h3>Roasted vegetable bowl</h3>
          <p>Brown rice, seasonal vegetables, and tahini.</p><span>$13.25</span>
          <h2>Desserts</h2><h3>Fruit cup</h3><span>$4</span>
        </main>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    })
    vi.stubGlobal('fetch', fetch)
    const response = await handleMenuDiscovery(menuRequest([
      { id: 'place-1', website: 'https://restaurant.example/' },
    ]), environment)
    const body = await response.json() as {
      results: Array<{
        status: string
        menuUrl: string
        message: string
        items: Array<{ name: string; price: number | null; sourceType: string }>
      }>
    }
    expect(body.results[0]).toMatchObject({
      status: 'menu_found',
      menuUrl: 'https://restaurant.example/menu',
      message: expect.stringContaining('visible menu text'),
      items: [
        { name: 'Roasted vegetable bowl', price: 13.25, sourceType: 'visible_text' },
        { name: 'Fruit cup', price: 4, sourceType: 'visible_text' },
        { name: 'Chicken sandwich', price: 11, sourceType: 'visible_text' },
      ],
    })
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('explains how to proceed when menu text is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /', { headers: { 'Content-Type': 'text/plain' } })
      }
      return new Response('<main><h1>Welcome</h1><p>Contact us to learn more.</p></main>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }))
    const response = await handleMenuDiscovery(menuRequest([
      { id: 'place-1', website: 'https://restaurant.example/' },
    ]), environment)
    const body = await response.json() as {
      results: Array<{ status: string; message: string; menuUrl: string }>
    }
    expect(body.results[0]).toMatchObject({
      status: 'no_menu_data',
      menuUrl: 'https://restaurant.example/',
      message: expect.stringContaining('The menu may be in a PDF'),
    })
    expect(body.results[0].message).toContain('Open the business website or call')
  })

  it('limits scans to five listings per request', async () => {
    const response = await handleMenuDiscovery(menuRequest(
      Array.from({ length: 6 }, (_, index) => ({ id: `place-${index}`, website: null })),
    ), environment)
    expect(response.status).toBe(400)
  })
})
