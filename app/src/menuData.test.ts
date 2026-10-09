import { describe, expect, it } from 'vitest'
import { createMealGroup, type MealGroup } from './domain'
import {
  compareRestaurantRank,
  createDraftOrderLines,
  findMenuLinks,
  itemHasPublishedDietEvidence,
  parseMenuHtml,
} from './menuData'

const structuredMenu = {
  '@context': 'https://schema.org',
  '@type': 'Menu',
  hasMenuSection: {
    '@type': 'MenuSection',
    name: 'Entrees',
    hasMenuItem: [
      {
        '@type': 'MenuItem',
        name: 'Garden Bowl',
        description: 'Rice, vegetables, and tofu.',
        suitableForDiet: ['https://schema.org/VeganDiet', 'https://schema.org/GlutenFreeDiet'],
        offers: { '@type': 'Offer', price: '14.50', priceCurrency: 'USD' },
      },
      {
        '@type': 'MenuItem',
        name: 'Sesame Cookie',
        suitableForDiet: ['https://schema.org/VeganDiet'],
      },
    ],
  },
}

const bowl = parseMenuHtml(`<script type="application/ld+json">${JSON.stringify(structuredMenu)}</script>`).items[0]

describe('published menu extraction', () => {
  it('extracts nested menu sections, exact published diet labels, and prices', () => {
    const result = parseMenuHtml(`<script type="application/ld+json">${JSON.stringify(structuredMenu)}</script>`)
    expect(result.malformedJsonLd).toBe(false)
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      name: 'Garden Bowl',
      section: 'Entrees',
      suitableForDiet: ['https://schema.org/VeganDiet', 'https://schema.org/GlutenFreeDiet'],
      price: 14.5,
      currency: 'USD',
    })
  })

  it('ignores malformed JSON-LD without inventing menu items', () => {
    expect(parseMenuHtml('<script type="application/ld+json">{oops</script>'))
      .toEqual({ items: [], malformedJsonLd: true })
  })

  it('reads visible menu names, descriptions, and prices without treating navigation as food', () => {
    const html = `
      <nav><a href="/menu">Menu</a><a href="/contact">Contact</a><a href="/giftcard">Order Now</a></nav>
      <main>
        <h1>Our menu</h1>
        <h2>Sandwiches</h2>
        <h3>Roasted veggie sandwich</h3>
        <p>Roasted seasonal vegetables, feta, and pesto.</p><span>$12.50</span>
        <h3>Chicken sandwich</h3>
        <p>Grilled chicken with greens and tomato.</p><span>$14</span>
        <h2>Sides</h2><h3>Fries</h3><span>$5</span>
        <h2>Desserts</h2><h3>Chocolate cookie</h3><span>$3</span>
        <h2>Drinks</h2><h3>Iced tea</h3><span>$2</span>
        <h3>Get Gifting</h3><h3>Order Now</h3>
        <a href="/route">/en-gb/menu/category/436</a>
      </main>`
    const result = parseMenuHtml(html, { includeVisibleText: true })
    expect(result.items).toMatchObject([
      {
        name: 'Roasted veggie sandwich',
        section: 'Sandwiches',
        description: 'Roasted seasonal vegetables, feta, and pesto.',
        price: 12.5,
        currency: 'USD',
        sourceType: 'visible_text',
      },
      {
        name: 'Chicken sandwich',
        section: 'Sandwiches',
        description: 'Grilled chicken with greens and tomato.',
        price: 14,
        currency: 'USD',
      },
      { name: 'Fries', section: 'Sides', price: 5 },
      { name: 'Chocolate cookie', section: 'Desserts', price: 3 },
      { name: 'Iced tea', section: 'Drinks', price: 2 },
    ])
    expect(result.items.some((item) => item.name === 'Contact')).toBe(false)
    expect(result.items.some((item) => item.name === 'Menu')).toBe(false)
    expect(result.items.some((item) => /gifting|order now|category\/\d+/i.test(item.name))).toBe(false)
  })

  it('finds same-site menu links but excludes external menu hosts', () => {
    const links = findMenuLinks(
      '<a href="/menu">Menu</a><a href="/ordering">Order Now</a><a href="https://orders.example.net/menu">Order menu</a>',
      new URL('https://restaurant.example/'),
    )
    expect(links.map((link) => link.href)).toEqual(['https://restaurant.example/menu'])
  })

  it('requires some menu evidence before treating unpriced page headings as dishes', () => {
    const result = parseMenuHtml(`
      <main>
        <h2>Sandwiches</h2><h3>Turkey club</h3>
        <h2>Drinks</h2><h3>Loading done</h3>
        <h2>Whoa there!</h2><h3>Check connection</h3>
      </main>`, { includeVisibleText: true })
    expect(result.items.map((item) => item.name)).toEqual(['Turkey club'])
  })

  it('keeps inline prices attached to their own item after an unpriced item', () => {
    const result = parseMenuHtml(`
      <main><h2>Sandwiches</h2>
        <h3>Garden sandwich</h3>
        <h3>Chicken sandwich $14.00</h3>
      </main>`, { includeVisibleText: true })
    expect(result.items).toMatchObject([
      { name: 'Garden sandwich', price: null },
      { name: 'Chicken sandwich', price: 14, currency: 'USD' },
    ])
  })
})

describe('menu suitability and quantities', () => {
  it('uses only explicit suitableForDiet evidence, not item descriptions', () => {
    expect(itemHasPublishedDietEvidence(bowl, 'Vegan')).toBe(true)
    expect(itemHasPublishedDietEvidence(bowl, 'Gluten-free')).toBe(true)
    expect(itemHasPublishedDietEvidence(bowl, 'Dairy-free')).toBe(false)
    expect(itemHasPublishedDietEvidence({ ...bowl, suitableForDiet: [] }, 'Vegan')).toBe(false)
  })

  it('drafts one selected main per person, but never claims allergy safety', () => {
    const groups: MealGroup[] = [
      {
        ...createMealGroup('vegan'),
        name: 'Vegan and gluten-free',
        count: 6,
        diets: ['Vegan', 'Gluten-free'],
        allergens: ['Sesame'],
      },
      { ...createMealGroup('halal'), name: 'Halal', count: 3, diets: ['Halal'] },
      { ...createMealGroup('notes'), name: 'Other need', count: 2, notes: 'No shared equipment' },
    ]
    const lines = createDraftOrderLines(groups, [bowl])
    expect(lines[0]).toMatchObject({
      groupId: 'vegan',
      quantity: 6,
      candidates: [bowl],
      requiresAllergenConfirmation: true,
    })
    expect(lines[1].candidates).toEqual([])
    expect(lines[1].options).toEqual([bowl])
    expect(lines[1].reason).toContain('explicitly confirms')
    expect(lines[2].candidates).toEqual([])
    expect(lines[2].options).toEqual([bowl])
    expect(lines[2].reason).toContain('direct review')
  })

  it('ranks availability first, distance second, and menu match third', () => {
    const openNearby = { availabilityRank: 0, distanceMiles: 1, menuMatchCount: 0 }
    const openFar = { availabilityRank: 0, distanceMiles: 3, menuMatchCount: 4 }
    const unknownNearby = { availabilityRank: 10, distanceMiles: 0.2, menuMatchCount: 8 }
    expect(compareRestaurantRank(openNearby, openFar)).toBeLessThan(0)
    expect(compareRestaurantRank(openFar, unknownNearby)).toBeLessThan(0)
    expect(compareRestaurantRank(
      { availabilityRank: 0, distanceMiles: 1, menuMatchCount: 2 },
      { availabilityRank: 0, distanceMiles: 1, menuMatchCount: 1 },
    )).toBeLessThan(0)
  })
})

it('requires at least one non-zero group before producing draft quantities', () => {
  const zeroPersonGroup = { ...createMealGroup('zero'), count: 0 }
  expect(createDraftOrderLines([zeroPersonGroup], [bowl])).toEqual([])
})
