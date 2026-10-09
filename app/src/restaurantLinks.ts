import type { FoodPlace } from './domain'

export interface RestaurantLink {
  href: string
  label: string
}

function safeExternalUrl(value: string | undefined): URL | null {
  if (!value) return null
  try {
    const url = new URL(value.startsWith('http://') || value.startsWith('https://')
      ? value
      : `https://${value}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password || url.port) return null
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) return null
    if (/^\d+(?:\.\d+)+$/.test(url.hostname) || url.hostname.startsWith('[')) return null
    url.protocol = 'https:'
    url.hash = ''
    return url
  } catch {
    return null
  }
}

function isDoorDashOrderPage(url: URL): boolean {
  return (url.hostname === 'doordash.com' || url.hostname.endsWith('.doordash.com'))
    && url.pathname.includes('/store/')
}

function firstValidUrl(tags: Record<string, string>, keys: string[]): URL | null {
  for (const key of keys) {
    const url = safeExternalUrl(tags[key])
    if (url) return url
  }
  return null
}

export function getRestaurantLinks(place: FoodPlace): RestaurantLink[] {
  if (place.category !== 'restaurant') return []
  const { tags } = place
  const website = firstValidUrl(tags, ['website', 'contact:website'])
  const directDoorDash = [
    firstValidUrl(tags, ['contact:doordash', 'delivery:doordash', 'doordash']),
    website,
  ].find((url) => url && isDoorDashOrderPage(url))
  if (directDoorDash) return [{ href: directDoorDash.toString(), label: 'Order on DoorDash' }]

  const orderUrl = firstValidUrl(tags, [
    'contact:order',
    'order',
    'takeaway',
    'delivery:website',
    'contact:delivery',
  ])
  if (orderUrl) {
    return [{
      href: orderUrl.toString(),
      label: isDoorDashOrderPage(orderUrl) ? 'Order on DoorDash' : 'Order online',
    }]
  }

  const menuUrl = firstValidUrl(tags, ['contact:menu', 'menu', 'website:menu'])
  if (menuUrl) return [{ href: menuUrl.toString(), label: 'View menu' }]

  const searchUrl = new URL('https://www.google.com/search')
  searchUrl.searchParams.set('q', `site:doordash.com/store "${place.name}" "San Francisco"`)
  return [
    { href: searchUrl.toString(), label: 'Search DoorDash listings' },
    ...(website ? [{ href: website.toString(), label: 'Business website' }] : []),
  ]
}
