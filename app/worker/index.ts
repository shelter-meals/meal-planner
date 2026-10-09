import {
  findMenuLinks,
  parseMenuHtml,
  type MenuDiscoveryResult,
} from '../src/menuData'

interface Environment {
  ALLOWED_ORIGINS?: string
}

interface MenuCandidate {
  id: string
  website: string | null
}

interface RobotsRule {
  allow: boolean
  path: string
}

export interface RobotsGroup {
  agents: string[]
  rules: RobotsRule[]
}

const MAX_CANDIDATES = 5
const MAX_REQUEST_BYTES = 24_000
const MAX_PAGE_BYTES = 1_000_000
const MAX_ROBOTS_BYTES = 50_000
const MAX_FETCH_MS = 4_000
const MAX_MENU_LINKS = 3
const MAX_OVERPASS_BYTES = 3_000_000
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const USER_AGENT = 'ShelterMealPlanner'
const SCAN_MESSAGE = 'No menu items were visible in the website pages this scan could read. The menu may be in a PDF, an interactive viewer, or a separate ordering service. Open the business website or call to choose dishes.'

interface NearbySearchRequest {
  lat: number
  lon: number
  radiusMiles: 5 | 10 | 15
}

class ScanFailure extends Error {
  readonly status: MenuDiscoveryResult['status']

  constructor(status: MenuDiscoveryResult['status'], message: string) {
    super(message)
    this.status = status
  }
}

export function normalizeWebsiteUrl(value: string): URL | null {
  try {
    const url = new URL(value.startsWith('http://') || value.startsWith('https://')
      ? value
      : `https://${value}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password || url.port) return null
    const host = url.hostname.toLowerCase()
    if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost')) return null
    if (/^\d+(?:\.\d+)+$/.test(host) || host.startsWith('[')) return null
    url.protocol = 'https:'
    url.username = ''
    url.password = ''
    url.port = ''
    url.hash = ''
    url.search = ''
    return url
  } catch {
    return null
  }
}

export function parseRobotsTxt(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  let hasRules = false
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split('#', 1)[0]?.trim()
    if (!line) {
      if (hasRules) {
        current = null
        hasRules = false
      }
      continue
    }
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const directive = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (directive === 'user-agent') {
      if (!current || hasRules) {
        current = { agents: [], rules: [] }
        groups.push(current)
        hasRules = false
      }
      current.agents.push(value.toLowerCase())
    } else if (current && (directive === 'allow' || directive === 'disallow')) {
      if (value) current.rules.push({ allow: directive === 'allow', path: value })
      hasRules = true
    }
  }
  return groups
}

export function robotsAllows(groups: RobotsGroup[], path: string): boolean {
  const specific = groups.filter((group) =>
    group.agents.some((agent) => agent !== '*' && USER_AGENT.toLowerCase().startsWith(agent)),
  )
  const selected = specific.length
    ? specific
    : groups.filter((group) => group.agents.includes('*'))
  const rules = selected.flatMap((group) => group.rules)
  const matches = rules
    .map((rule) => {
      const exact = rule.path.endsWith('$')
      const source = exact ? rule.path.slice(0, -1) : rule.path
      const pattern = source.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
      const regex = new RegExp(`^${pattern}${exact ? '' : '.*'}$`)
      return regex.test(path) ? rule : null
    })
    .filter((rule): rule is RobotsRule => rule !== null)
    .sort((a, b) => b.path.replace(/[*$]/g, '').length - a.path.replace(/[*$]/g, '').length)
  if (!matches.length) return true
  const longestMatch = matches[0].path.replace(/[*$]/g, '').length
  return matches.some((rule) =>
    rule.path.replace(/[*$]/g, '').length === longestMatch && rule.allow,
  )
}

function allowedOrigin(origin: string | null, environment: Environment): boolean {
  if (!origin) return false
  return (environment.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(origin)
}

function responseHeaders(origin: string | null, environment: Environment): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  })
  if (origin && allowedOrigin(origin, environment)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type')
    headers.set('Access-Control-Max-Age', '600')
  }
  return headers
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  environment: Environment,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin, environment),
  })
}

async function readTextLimited(response: Response | Request, maximumBytes: number): Promise<string> {
  const reportedLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(reportedLength) && reportedLength > maximumBytes) {
    throw new ScanFailure(
      'page_too_large',
      'This restaurant page is larger than the automatic menu scan can read. Open the website or call to check the menu.',
    )
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parts: string[] = []
  let bytesRead = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytesRead += value.byteLength
    if (bytesRead > maximumBytes) {
      await reader.cancel()
      throw new ScanFailure(
        'page_too_large',
        'This restaurant page is larger than the automatic menu scan can read. Open the website or call to check the menu.',
      )
    }
    parts.push(decoder.decode(value, { stream: true }))
  }
  parts.push(decoder.decode())
  return parts.join('')
}

function sameSiteHost(host: string, originalHost: string): boolean {
  if (host === originalHost) return true
  return originalHost.startsWith('www.')
    ? host === originalHost.slice(4)
    : host === `www.${originalHost}`
}

async function fetchWithTimeout(url: URL, redirect: RequestRedirect): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: 'text/html, application/xhtml+xml;q=0.9, text/plain;q=0.5',
      'User-Agent': `${USER_AGENT}/0.1`,
    },
    redirect,
    signal: AbortSignal.timeout(MAX_FETCH_MS),
  })
}

async function getRobotsRules(origin: string, cache: Map<string, Promise<RobotsGroup[] | null>>) {
  const existing = cache.get(origin)
  if (existing) return existing
  const pending = (async () => {
    const robotsUrl = new URL('/robots.txt', origin)
    try {
      const response = await fetchWithTimeout(robotsUrl, 'manual')
      if (response.status === 404 || response.status === 410) return []
      if (!response.ok || response.status >= 300) return null
      const text = await readTextLimited(response, MAX_ROBOTS_BYTES)
      return parseRobotsTxt(text)
    } catch {
      return null
    }
  })()
  cache.set(origin, pending)
  return pending
}

async function checkRobots(url: URL, cache: Map<string, Promise<RobotsGroup[] | null>>) {
  const rules = await getRobotsRules(url.origin, cache)
  if (!rules) throw new ScanFailure(
    'robots_unavailable',
    'The restaurant website did not provide its access policy, so we could not read its menu automatically. Open the official website or call to check the menu.',
  )
  const path = `${url.pathname}${url.search}`
  if (!robotsAllows(rules, path)) {
    throw new ScanFailure(
      'robots_disallowed',
      'The restaurant website asks automated tools not to read this page. Open the official website or call to check its menu.',
    )
  }
}

async function fetchMenuPage(
  requestedUrl: URL,
  originalHost: string,
  robotsCache: Map<string, Promise<RobotsGroup[] | null>>,
): Promise<{ html: string; url: URL }> {
  let url = requestedUrl
  for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
    if (url.protocol !== 'https:' || !sameSiteHost(url.hostname.toLowerCase(), originalHost)) {
      throw new ScanFailure('blocked_redirect', 'The menu link redirects away from the listed business website.')
    }
    await checkRobots(url, robotsCache)
    let response: Response
    try {
      response = await fetchWithTimeout(url, 'manual')
    } catch {
      throw new ScanFailure('site_unreachable', 'The listed business website did not respond to the menu check.')
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location || redirectCount === 2) {
        throw new ScanFailure('blocked_redirect', 'The menu page has an unsupported redirect.')
      }
      try {
        url = new URL(location, url)
      } catch {
        throw new ScanFailure('blocked_redirect', 'The menu page has an invalid redirect.')
      }
      continue
    }
    if (!response.ok) {
      throw new ScanFailure('site_unreachable', `The business website returned an error (${response.status}).`)
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new ScanFailure('unsupported_site', 'The linked page is not a supported HTML menu page.')
    }
    const html = await readTextLimited(response, MAX_PAGE_BYTES)
    return { html, url }
  }
  throw new ScanFailure('blocked_redirect', 'The menu page has too many redirects.')
}

async function scanCandidate(
  candidate: MenuCandidate,
  robotsCache: Map<string, Promise<RobotsGroup[] | null>>,
): Promise<MenuDiscoveryResult> {
  const website = candidate.website ? normalizeWebsiteUrl(candidate.website) : null
  const empty = (
    status: MenuDiscoveryResult['status'],
    message: string,
    menuUrl: string | null = website?.toString() ?? null,
  ): MenuDiscoveryResult => ({
    placeId: candidate.id,
    website: website?.toString() ?? candidate.website,
    menuUrl,
    fetchedAt: new Date().toISOString(),
    status,
    message,
    items: [],
  })
  if (!candidate.website) return empty('missing_website', 'No business website is listed in OpenStreetMap.', null)
  if (!website) return empty('unsupported_site', 'The listed website is not a supported public HTTPS site.', null)

  try {
    const home = await fetchMenuPage(website, website.hostname.toLowerCase(), robotsCache)
    const homeResult = parseMenuHtml(home.html)
    if (homeResult.items.length) {
      return {
        ...empty('menu_found', 'Published structured menu data was found on the linked website.', home.url.toString()),
        items: homeResult.items,
      }
    }
    const homeTextResult = parseMenuHtml(home.html, { includeVisibleText: true })
    const menuLinks = findMenuLinks(home.html, home.url, MAX_MENU_LINKS)
    let menuLinkBlockedByRobots = false
    let menuItems: MenuDiscoveryResult['items'] = homeTextResult.items
    let firstMenuUrl: URL | null = null
    for (const menuLink of menuLinks) {
      try {
        const page = await fetchMenuPage(menuLink, website.hostname.toLowerCase(), robotsCache)
        const parsed = parseMenuHtml(page.html, { includeVisibleText: true })
        if (parsed.items.length) {
          firstMenuUrl ??= page.url
          menuItems.push(...parsed.items)
        }
      } catch (error) {
        if (error instanceof ScanFailure && error.status === 'robots_disallowed') {
          menuLinkBlockedByRobots = true
          continue
        }
        throw error
      }
    }
    if (menuItems.length) {
      const visibleTextCount = menuItems.filter((item) => item.sourceType === 'visible_text').length
      const seenItems = new Set<string>()
      menuItems = menuItems
        .filter((item) => {
          const key = `${item.section.toLowerCase()}\u0000${item.name.toLowerCase()}`
          if (seenItems.has(key)) return false
          seenItems.add(key)
          return true
        })
        .slice(0, 100)
        .map((item, index) => ({ ...item, id: `menu-item-${index + 1}` }))
      return {
        ...empty(
          'menu_found',
          `Found ${menuItems.length} menu item${menuItems.length === 1 ? '' : 's'} on the restaurant website${visibleTextCount ? ' by reading visible menu text' : ''}. Confirm today's availability, prices, portions, and dietary details with the business.`,
          firstMenuUrl?.toString() ?? home.url.toString(),
        ),
        items: menuItems,
      }
    }
    if (menuLinkBlockedByRobots) {
      return empty(
        'robots_disallowed',
        'The restaurant website asks automated tools not to read its menu. Open the official website or call to choose items.',
        home.url.toString(),
      )
    }
    return empty(
      'no_menu_data',
      SCAN_MESSAGE,
      home.url.toString(),
    )
  } catch (error) {
    if (error instanceof ScanFailure) return empty(error.status, error.message)
    return empty('site_unreachable', 'The business website could not be checked.')
  }
}

function parseCandidates(body: unknown): MenuCandidate[] | null {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { places?: unknown }).places)) return null
  const places = (body as { places: unknown[] }).places
  if (places.length > MAX_CANDIDATES) return null
  const candidates: MenuCandidate[] = []
  for (const place of places) {
    if (!place || typeof place !== 'object') return null
    const candidate = place as Record<string, unknown>
    if (typeof candidate.id !== 'string' || candidate.id.length > 100) return null
    if (candidate.website !== null && typeof candidate.website !== 'string') return null
    if (typeof candidate.website === 'string' && candidate.website.length > 2_048) return null
    candidates.push({
      id: candidate.id,
      website: typeof candidate.website === 'string' ? candidate.website : null,
    })
  }
  return candidates
}

function parseNearbySearchRequest(body: unknown): NearbySearchRequest | null {
  if (!body || typeof body !== 'object') return null
  const candidate = body as Record<string, unknown>
  if (typeof candidate.lat !== 'number' || !Number.isFinite(candidate.lat)
    || candidate.lat < -90 || candidate.lat > 90
    || typeof candidate.lon !== 'number' || !Number.isFinite(candidate.lon)
    || candidate.lon < -180 || candidate.lon > 180
    || (candidate.radiusMiles !== 5 && candidate.radiusMiles !== 10 && candidate.radiusMiles !== 15)) {
    return null
  }
  return {
    lat: candidate.lat,
    lon: candidate.lon,
    radiusMiles: candidate.radiusMiles,
  }
}

async function handleNearbyFoodSearch(request: Request, environment: Environment): Promise<Response> {
  const origin = request.headers.get('Origin')
  if (request.method === 'OPTIONS') {
    return allowedOrigin(origin, environment)
      ? new Response(null, { status: 204, headers: responseHeaders(origin, environment) })
      : jsonResponse({ error: 'This app origin is not allowed.' }, 403, origin, environment)
  }
  if (!allowedOrigin(origin, environment)) {
    return jsonResponse({ error: 'This app origin is not allowed.' }, 403, origin, environment)
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Use POST for nearby business searches.' }, 405, origin, environment)
  }
  let body: unknown
  try {
    body = JSON.parse(await readTextLimited(request, 1_000)) as unknown
  } catch (error) {
    if (error instanceof ScanFailure && error.message.includes('size limit')) {
      return jsonResponse({ error: 'The nearby-search request is too large.' }, 413, origin, environment)
    }
    return jsonResponse({ error: 'The nearby-search request is invalid JSON.' }, 400, origin, environment)
  }
  const search = parseNearbySearchRequest(body)
  if (!search) {
    return jsonResponse({ error: 'Provide valid coordinates and a search radius of 5, 10, or 15 miles.' }, 400, origin, environment)
  }
  const radiusMeters = Math.round(search.radiusMiles * 1609.344)
  const query = `
    [out:json][timeout:25];
    (
      nwr(around:${radiusMeters},${search.lat},${search.lon})["amenity"~"^(restaurant|fast_food|cafe|food_court)$"];
      nwr(around:${radiusMeters},${search.lat},${search.lon})["shop"~"^(supermarket|convenience|butcher|deli|health_food|greengrocer)$"];
    );
    out center tags;
  `
  let upstream: Response
  try {
    upstream = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': `${USER_AGENT}/0.1`,
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return jsonResponse({ error: 'OpenStreetMap nearby search could not be reached. Try again shortly.' }, 503, origin, environment)
  }
  if (!upstream.ok) {
    return jsonResponse({ error: `OpenStreetMap nearby search is temporarily unavailable (${upstream.status}). Try again shortly.` }, 503, origin, environment)
  }
  let data: unknown
  try {
    data = JSON.parse(await readTextLimited(upstream, MAX_OVERPASS_BYTES)) as unknown
  } catch {
    return jsonResponse({ error: 'OpenStreetMap returned an unreadable nearby-search response.' }, 502, origin, environment)
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as { elements?: unknown }).elements)) {
    return jsonResponse({ error: 'OpenStreetMap returned an invalid nearby-search response.' }, 502, origin, environment)
  }
  const response = data as { elements: unknown[]; osm3s?: { timestamp_osm_base?: string } }
  return jsonResponse({
    elements: response.elements,
    osm3s: response.osm3s,
  }, 200, origin, environment)
}

export async function handleMenuDiscovery(request: Request, environment: Environment): Promise<Response> {
  const origin = request.headers.get('Origin')
  const pathname = new URL(request.url).pathname
  if (pathname === '/api/nearby-food') {
    return handleNearbyFoodSearch(request, environment)
  }
  if (pathname !== '/api/menu-discovery') {
    return jsonResponse({ error: 'Menu discovery was not found.' }, 404, origin, environment)
  }
  if (request.method === 'OPTIONS') {
    return allowedOrigin(origin, environment)
      ? new Response(null, { status: 204, headers: responseHeaders(origin, environment) })
      : jsonResponse({ error: 'This app origin is not allowed.' }, 403, origin, environment)
  }
  if (!allowedOrigin(origin, environment)) {
    return jsonResponse({ error: 'This app origin is not allowed.' }, 403, origin, environment)
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Use POST for menu checks.' }, 405, origin, environment)
  const contentLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: 'The menu-check request is too large.' }, 413, origin, environment)
  }
  let body: unknown
  try {
    body = JSON.parse(await readTextLimited(request, MAX_REQUEST_BYTES)) as unknown
  } catch (error) {
    if (error instanceof ScanFailure && error.message.includes('size limit')) {
      return jsonResponse({ error: 'The menu-check request is too large.' }, 413, origin, environment)
    }
    return jsonResponse({ error: 'The menu-check request is invalid JSON or exceeds the size limit.' }, 400, origin, environment)
  }
  const candidates = parseCandidates(body)
  if (!candidates) {
    return jsonResponse({ error: `Send no more than ${MAX_CANDIDATES} valid restaurant listings.` }, 400, origin, environment)
  }
  const robotsCache = new Map<string, Promise<RobotsGroup[] | null>>()
  const results: MenuDiscoveryResult[] = []
  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3)
    results.push(...await Promise.all(batch.map((candidate) => scanCandidate(candidate, robotsCache))))
  }
  return jsonResponse({ results }, 200, origin, environment)
}

export default {
  fetch(request: Request, environment: Environment): Promise<Response> {
    return handleMenuDiscovery(request, environment)
  },
}
