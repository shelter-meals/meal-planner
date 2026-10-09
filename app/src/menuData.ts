import type { DietaryNeed, MealGroup } from './domain'

export interface PublishedMenuItem {
  id: string
  name: string
  description: string
  section: string
  suitableForDiet: string[]
  price: number | null
  currency: string | null
  sourceType: 'structured' | 'visible_text'
}

export type MenuScanStatus =
  | 'menu_found'
  | 'no_menu_data'
  | 'missing_website'
  | 'robots_disallowed'
  | 'robots_unavailable'
  | 'site_unreachable'
  | 'unsupported_site'
  | 'page_too_large'
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
    sourceType: 'structured',
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

function decodeAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#x2f;/gi, '/')
    .replace(/&#47;/gi, '/')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&euro;/gi, '€')
    .replace(/&pound;/gi, '£')
    .replace(/&dollar;/gi, '$')
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([\da-f]+);/gi, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
}

function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|nav|header|footer|button|form|iframe|select|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(?:script|style|noscript|svg|template|nav|header|footer|button|form|iframe|select|textarea)\b[^>]*\/?>/gi, ' ')
    .replace(/<h[1-2]\b[^>]*>/gi, '\n__SECTION__')
    .replace(/<\/h[1-6]\s*>/gi, '\n')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|td|th|article|section|main|ul|ol|dl|dt|dd)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)
    .map((line) => decodeAttribute(line.replace(/\s+/g, ' ')).trim())
    .filter(Boolean)
    .join('\n')
}

const NON_MENU_LINE = /\b(home|contact|locations?|careers?|about us|privacy|terms|sign in|log in|cart|checkout|order now|order online|food menu|gift cards?|giftcard|gifting|buy now|shop now|book a table|make a reservation|join now|explore|loading done|whoa there|skip to content|accessibility|follow us)\b/i
const SECTION_LINE = /^(?:our\s+)?(?:menu|appetizers?|starters?|entrees?|entrées?|mains?|sides?|salads?|soups?|sandwiches?|subs?|wraps?|jacket potatoes|burgers?|pizzas?|pasta|noodles?|bowls?|tacos?|desserts?|drinks?|beverages?|breakfast|lunch|dinner|kids(?:'|’)? menu|shareables?|small plates?)$/i
const MAIN_MENU_SECTION = /^(?:entrees?|entrées?|mains?|salads?|soups?|sandwiches?|subs?|wraps?|burgers?|pizzas?|pasta|noodles?|bowls?|tacos?|breakfast|lunch|dinner|shareables?|small plates?)$/i
const EXCLUDED_SECTION = /\b(drinks?|beverages?|desserts?|sides?|sauces?|appetizers?|starters?|snacks?|add[- ]?ons?)\b/i
const PRICE_AT_END = /(?:^|\s)([$€£]\s?\d{1,4}(?:\.\d{1,2})?|\d{1,4}\.\d{2}\s?(?:USD|CAD|EUR|GBP))\s*$/i

function isMenuNameLine(line: string): boolean {
  return line.length >= 3
    && line.length <= 100
    && !NON_MENU_LINE.test(line)
    && !/[.!?]\s*$/.test(line)
    && !/^[$€£\d]/.test(line)
    && !/^(?:\/|https?:\/\/|www\.)/i.test(line)
    && !/^(?:view|read|learn|click|see|follow|visit|call|email|copyright|all rights reserved)\b/i.test(line)
  }

function visibleTextMenuItems(html: string): PublishedMenuItem[] {
  const lines = visibleText(html).split('\n')
  const entries: PublishedMenuItem[] = []
  let section = ''
  let previousName = ''
  const seen = new Set<string>()

  for (const rawLine of lines) {
    const isSection = rawLine.startsWith('__SECTION__')
    const line = (isSection ? rawLine.slice('__SECTION__'.length) : rawLine).trim()
    if (!line) continue
    if (isSection || SECTION_LINE.test(line) && !PRICE_AT_END.test(line)) {
      section = line.slice(0, 100)
      previousName = ''
      continue
    }

    const standalonePrice = /^([$€£]\s?\d{1,4}(?:\.\d{1,2})?|\d{1,4}\.\d{2}\s?(?:USD|CAD|EUR|GBP))$/i.exec(line)
    if (standalonePrice && previousName) {
      const priceText = standalonePrice[1].replace(/[^\d.]/g, '')
      const price = Number(priceText)
      const previous = entries[entries.length - 1]
      if (previous?.name === previousName) {
        previous.price = Number.isFinite(price) ? price : null
        previous.currency = standalonePrice[1].includes('$') ? 'USD'
          : standalonePrice[1].includes('€') ? 'EUR'
            : standalonePrice[1].includes('£') ? 'GBP'
              : /USD/i.test(standalonePrice[1]) ? 'USD'
                : /CAD/i.test(standalonePrice[1]) ? 'CAD'
                  : /EUR/i.test(standalonePrice[1]) ? 'EUR'
                    : /GBP/i.test(standalonePrice[1]) ? 'GBP' : null
      }
      previousName = ''
      continue
    }

    const itemWithPrice = line.match(/^(.*?)\s+([$€£]\s?\d{1,4}(?:\.\d{1,2})?|\d{1,4}\.\d{2}\s?(?:USD|CAD|EUR|GBP))$/i)
    const name = (itemWithPrice?.[1] ?? line).trim()
    if (isMenuNameLine(name) && (itemWithPrice || !/[,:;]\s/.test(name))) {
      const key = `${section.toLowerCase()}\u0000${name.toLowerCase()}`
      if (seen.has(key)) {
        previousName = ''
        continue
      }
      seen.add(key)
      const rawPrice = itemWithPrice?.[2]
      entries.push({
        id: `menu-item-${entries.length + 1}`,
        name: name.slice(0, 160),
        description: '',
        section,
        suitableForDiet: [],
        price: rawPrice ? Number(rawPrice.replace(/[^\d.]/g, '')) : null,
        currency: rawPrice?.includes('$') ? 'USD'
          : rawPrice?.includes('€') ? 'EUR'
            : rawPrice?.includes('£') ? 'GBP'
              : /USD/i.test(rawPrice ?? '') ? 'USD'
                : /CAD/i.test(rawPrice ?? '') ? 'CAD'
                  : /EUR/i.test(rawPrice ?? '') ? 'EUR'
                    : /GBP/i.test(rawPrice ?? '') ? 'GBP' : null,
        sourceType: 'visible_text',
      })
      previousName = name
    } else if (previousName && line.length <= 240 && /[.!?]/.test(line)) {
      const previous = entries[entries.length - 1]
      if (previous?.name === previousName) previous.description = line.slice(0, 320)
    } else {
      previousName = ''
    }
  }
  return entries
    .filter((item) => item.price !== null
      || item.description.length > 0
      || MAIN_MENU_SECTION.test(item.section))
    .slice(0, 100)
}

export function parseMenuHtml(
  html: string,
  options: { includeVisibleText?: boolean } = {},
): { items: PublishedMenuItem[]; malformedJsonLd: boolean } {
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
  if (items.length) {
    return {
      items: items.slice(0, 100).map((item, index) => ({ ...item, id: `menu-item-${index + 1}` })),
      malformedJsonLd,
    }
  }
  return {
    items: options.includeVisibleText ? visibleTextMenuItems(html) : [],
    malformedJsonLd,
  }
}

export function findMenuLinks(html: string, sourceUrl: URL, limit = 3): URL[] {
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
  if (EXCLUDED_SECTION.test(label)) return false
  if (item.sourceType === 'visible_text') return true
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
