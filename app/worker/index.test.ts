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

afterEach(() => vi.unstubAllGlobals())

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

  it('limits scans to five listings per request', async () => {
    const response = await handleMenuDiscovery(menuRequest(
      Array.from({ length: 6 }, (_, index) => ({ id: `place-${index}`, website: null })),
    ), environment)
    expect(response.status).toBe(400)
  })
})
