import { describe, expect, it } from 'vitest'
import { type FoodPlace } from './domain'
import { getRestaurantLinks } from './restaurantLinks'

const restaurant: FoodPlace = {
  id: 'restaurant',
  name: 'Neighborhood Kitchen',
  category: 'restaurant',
  typeLabel: 'Restaurant',
  lat: 37.77,
  lon: -122.42,
  distanceMiles: 1,
  tags: {},
}

describe('restaurant ordering links', () => {
  it('prefers a mapped DoorDash order page', () => {
    expect(getRestaurantLinks({
      ...restaurant,
      tags: {
        'contact:doordash': 'https://www.doordash.com/store/neighborhood-kitchen/123',
        website: 'https://restaurant.example/',
      },
    })).toEqual([
      { href: 'https://www.doordash.com/store/neighborhood-kitchen/123', label: 'Order on DoorDash' },
    ])
  })

  it('uses a mapped restaurant ordering page before its menu or website', () => {
    expect(getRestaurantLinks({
      ...restaurant,
      tags: {
        'contact:order': 'http://order.restaurant.example/',
        'contact:menu': 'https://restaurant.example/menu',
        website: 'https://restaurant.example/',
      },
    })).toEqual([
      { href: 'https://order.restaurant.example/', label: 'Order online' },
    ])
  })

  it('uses a mapped menu page before DoorDash search', () => {
    expect(getRestaurantLinks({
      ...restaurant,
      tags: {
        'contact:menu': 'https://restaurant.example/menu',
        website: 'https://restaurant.example/',
      },
    })).toEqual([
      { href: 'https://restaurant.example/menu', label: 'View menu' },
    ])
  })

  it('offers a DoorDash-focused web search followed by the restaurant website when no direct order or menu page is mapped', () => {
    const [searchLink, websiteLink] = getRestaurantLinks({
      ...restaurant,
      tags: { website: 'https://restaurant.example/' },
    })
    expect(searchLink.label).toBe('Search DoorDash listings')
    expect(new URL(searchLink.href).hostname).toBe('www.google.com')
    expect(new URL(searchLink.href).searchParams.get('q'))
      .toBe('site:doordash.com/store "Neighborhood Kitchen" "San Francisco"')
    expect(websiteLink).toEqual({
      href: 'https://restaurant.example/',
      label: 'Business website',
    })
  })

  it('offers a DoorDash-focused search when no business website is mapped', () => {
    expect(getRestaurantLinks(restaurant).map(({ label }) => label)).toEqual(['Search DoorDash listings'])
  })

  it('does not create ordering links for grocery stores', () => {
    expect(getRestaurantLinks({ ...restaurant, category: 'grocery' })).toEqual([])
  })
})
