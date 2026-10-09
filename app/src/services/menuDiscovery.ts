import type { FoodPlace } from '../domain'
import {
  type MenuDiscoveryResult,
  type MenuScanStatus,
  type PublishedMenuItem,
} from '../menuData'

const MENU_STATUSES = new Set<MenuScanStatus>([
  'menu_found',
  'no_menu_data',
  'missing_website',
  'robots_disallowed',
  'robots_unavailable',
  'site_unreachable',
  'unsupported_site',
  'blocked_redirect',
])

const MENU_API_URL = import.meta.env.VITE_MENU_API_URL?.trim() || '/api/menu-discovery'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseMenuItem(value: unknown): PublishedMenuItem | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.name !== 'string'
    || typeof value.description !== 'string' || typeof value.section !== 'string'
    || !Array.isArray(value.suitableForDiet)
    || !value.suitableForDiet.every((label) => typeof label === 'string')
    || (value.price !== null && (typeof value.price !== 'number' || !Number.isFinite(value.price)))
    || (value.currency !== null && typeof value.currency !== 'string')) return null
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    section: value.section,
    suitableForDiet: value.suitableForDiet,
    price: value.price,
    currency: value.currency,
  }
}

function parseResult(value: unknown): MenuDiscoveryResult | null {
  if (!isRecord(value) || typeof value.placeId !== 'string'
    || (value.website !== null && typeof value.website !== 'string')
    || (value.menuUrl !== null && typeof value.menuUrl !== 'string')
    || typeof value.fetchedAt !== 'string'
    || typeof value.status !== 'string'
    || !MENU_STATUSES.has(value.status as MenuScanStatus)
    || typeof value.message !== 'string'
    || !Array.isArray(value.items)) return null
  const items = value.items.map(parseMenuItem)
  if (items.some((item) => item === null)) return null
  return {
    placeId: value.placeId,
    website: value.website,
    menuUrl: value.menuUrl,
    fetchedAt: value.fetchedAt,
    status: value.status as MenuScanStatus,
    message: value.message,
    items: items.filter((item): item is PublishedMenuItem => item !== null),
  }
}

export async function discoverMenus(
  places: FoodPlace[],
  signal?: AbortSignal,
): Promise<MenuDiscoveryResult[]> {
  const response = await fetch(MENU_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      places: places.map((place) => ({
        id: place.id,
        website: place.tags.website ?? place.tags['contact:website'] ?? null,
      })),
    }),
    signal,
  })
  if (!response.ok) {
    let message = `Menu checks are unavailable (${response.status}).`
    try {
      const body: unknown = await response.json()
      if (isRecord(body) && typeof body.error === 'string') message = body.error
    } catch {
      message = `Menu checks are unavailable (${response.status}); the service returned an unreadable error.`
    }
    throw new Error(message)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Menu checks returned an unreadable response.')
  }
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new Error('Menu checks returned data in an unexpected format.')
  }
  const results = payload.results.map(parseResult)
  if (results.some((result) => result === null)) {
    throw new Error('Menu checks returned an invalid result.')
  }
  return results.filter((result): result is MenuDiscoveryResult => result !== null)
}
