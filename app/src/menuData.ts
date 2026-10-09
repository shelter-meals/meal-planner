import type { DietaryNeed, MealGroup } from './domain'

export interface PublishedMenuItem {
  id: string
  name: string
  description: string
  section: string
  suitableForDiet: string[]
  price: number | null
  currency: string | null
}

export type MenuScanStatus =
  | 'menu_found'
  | 'no_menu_data'
  | 'missing_website'
  | 'robots_disallowed'
  | 'robots_unavailable'
  | 'site_unreachable'
  | 'unsupported_site'
  | 'blocked_redirect'

export interface MenuDiscoveryResult {
  placeId: string
  website: string | null
  menuUrl: string | null
  fetchedAt: string
  status: MenuScanStatus
  message: string
  items: PublishedMenuItem[]
}

export interface DraftOrderLine {
  groupId: string
  groupName: string
  quantity: number
  candidates: PublishedMenuItem[]
  options: PublishedMenuItem[]
  reason: string
  requiresAllergenConfirmation: boolean
}

export interface RestaurantRankEvidence {
  availabilityRank: number
  distanceMiles: number
  menuMatchCount: number
}

export function compareRestaurantRank(a: RestaurantRankEvidence, b: RestaurantRankEvidence): number {
  return a.availabilityRank - b.availabilityRank
    || a.distanceMiles - b.distanceMiles
    || b.menuMatchCount - a.menuMatchCount
}

type JsonObject = Record<string, unknown>

function asObjects(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(asObjects)
  return value && typeof value === 'object' ? [value as JsonObject] : []
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function asTextList(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value])
    .flatMap((entry) => {
      if (typeof entry === 'string' || typeof entry === 'number') {
        const text = asText(entry)
        return text ? [text] : []
      }
      if (entry && typeof entry === 'object') {
        const item = entry as JsonObject
        const text = asText(item.name) || asText(item['@id'])
        return text ? [text] : []
      }
      return []
    })
}

function schemaTypes(value: unknown): string[] {
  return asTextList(value).map((type) => type.split(/[/#]/).pop()?.toLowerCase() ?? '')
}

function priceFromOffers(value: unknown): { price: number | null; currency: string | null } {
  const offer = asObjects(value)[0]
  if (!offer) return { price: null, currency: null }
  const rawPrice = asText(offer.price) || asText(offer.lowPrice)
  const price = rawPrice && /^\d+(?:\.\d{1,2})?$/.test(rawPrice) ? Number(rawPrice) : null
  const currency = asText(offer.priceCurrency).toUpperCase()
  return {
    price: price !== null && Number.isFinite(price) ? price : null,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
  }
}

function menuItemFromObject(value: JsonObject, section: string, index: number): PublishedMenuItem | null {
  const name = asText(value.name)
  if (!name || !schemaTypes(value['@type']).includes('menuitem')) return null
  const offers = priceFromOffers(value.offers)
  return {
    id: `menu-item-${index + 1}`,
    name: name.slice(0, 160),
    description: asText(value.description).slice(0, 320),
    section: section.slice(0, 100),
    suitableForDiet: asTextList(value.suitableForDiet).slice(0, 12),
    price: offers.price,
    currency: offers.currency,
  }
}

function collectMenuItems(
  value: unknown,
  section: string,
  output: PublishedMenuItem[],
  seen: Set<string>,
): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectMenuItems(entry, section, output, seen)
    return
  }
  if (!value || typeof value !== 'object') return
  const object = value as JsonObject
  const types = schemaTypes(object['@type'])
  const currentSection = types.includes('menusection') ? asText(object.name) || section : section
  const item = menuItemFromObject(object, currentSection, output.length)
  if (item) {
    const key = `${item.section.toLowerCase()}\u0000${item.name.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      output.push(item)
    }
  }
  for (const nested of Object.values(object)) {
    collectMenuItems(nested, currentSection, output, seen)
  }
}

export function parseMenuHtml(html: string): { items: PublishedMenuItem[]; malformedJsonLd: boolean } {
  const items: PublishedMenuItem[] = []
  const seen = new Set<string>()
  const scripts = html.matchAll(
    /<script\b[^>]*\btype\s*=\s*(["'])application\/ld\+json(?:\s*;\s*charset=[^"']+)?\1[^>]*>([\s\S]*?)<\/script\s*>/gi,
  )
  let malformedJsonLd = false
  for (const match of scripts) {
    const contents = match[2]?.trim()
    if (!contents || contents.length > 100_000) continue
    try {
      collectMenuItems(JSON.parse(contents) as unknown, '', items, seen)
    } catch {
      malformedJsonLd = true
    }
  }
  return {
    items: items.slice(0, 100).map((item, index) => ({ ...item, id: `menu-item-${index + 1}` })),
    malformedJsonLd,
  }
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#x2f;/gi, '/')
    .replace(/&#47;/gi, '/')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

export function findMenuLinks(html: string, sourceUrl: URL, limit = 2): URL[] {
  const links: URL[] = []
  const seen = new Set<string>()
  const anchors = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)
  for (const match of anchors) {
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(match[1] ?? '')?.[2]
    if (!href || !/\b(menu|food|dining|entree|entrée)\b/i.test(`${href} ${match[2] ?? ''}`)) continue
    try {
      const target = new URL(decodeAttribute(href), sourceUrl)
      if (target.protocol !== 'https:' || target.hostname !== sourceUrl.hostname || target.port) continue
      target.hash = ''
      const key = target.toString()
      if (seen.has(key)) continue
      seen.add(key)
      links.push(target)
      if (links.length >= limit) break
    } catch {
      continue
    }
  }
  return links
}

const DIET_EVIDENCE: Record<DietaryNeed, string[]> = {
  Vegetarian: ['vegetariandiet', 'vegetarian'],
  Vegan: ['vegandiet', 'vegan'],
  'Gluten-free': ['glutenfreediet', 'glutenfree'],
  'Dairy-free': ['dairyfreediet', 'dairyfree'],
  Halal: ['halaldiet', 'halal'],
  Kosher: ['kosherdiet', 'kosher'],
  'Pork-free': ['porkfreediet', 'porkfree'],
}

export function itemHasPublishedDietEvidence(item: PublishedMenuItem, need: DietaryNeed): boolean {
  const acceptedValues = DIET_EVIDENCE[need]
  return item.suitableForDiet.some((value) => {
    const normalized = value
      .split(/[/#]/)
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z]/g, '')
    return Boolean(normalized && acceptedValues.includes(normalized))
  })
}

function isLikelyMain(item: PublishedMenuItem): boolean {
  const label = `${item.section} ${item.name}`.toLowerCase()
  if (/\b(drink|beverage|dessert|side|sauce|appetizer|starter|snack|add[- ]?on)\b/.test(label)) return false
  return /\b(entrees?|entrées?|mains?|meals?|bowls?|sandwiches?|burgers?|wraps?|pizzas?|plates?|curries?|pastas?|rice|noodles?|tacos?|burritos?|platters?|ramen|salad|soup|bento)\b/.test(label)
}

export function createDraftOrderLines(
  groups: MealGroup[],
  items: PublishedMenuItem[],
): DraftOrderLine[] {
  return groups
    .filter((group) => group.count > 0)
    .map((group) => {
      const mains = items.filter(isLikelyMain)
      const candidates = group.notes.trim()
        ? []
        : mains.filter((item) => group.diets.every((need) => itemHasPublishedDietEvidence(item, need)))
      const reason = group.notes.trim()
        ? 'Other requirements need direct review.'
        : candidates.length
          ? ''
          : group.diets.length
            ? 'No published menu item explicitly confirms every selected dietary need.'
            : 'No clearly identified individual main-course items were found.'
      return {
        groupId: group.id,
        groupName: group.name || 'Meal group',
        quantity: group.count,
        candidates,
        options: mains,
        reason,
        requiresAllergenConfirmation: group.allergens.length > 0,
      }
    })
}
