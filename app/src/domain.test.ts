import { describe, expect, it } from 'vitest'
import {
  createGroceryLines,
  createMealGroup,
  createScheduleDate,
  createUniqueId,
  defaultMealTime,
  isValidMealPlan,
  toSanFranciscoDateTimeInput,
  totalPeople,
  type MealGroup,
} from './domain'
import { getAvailabilityRank, getHoursState, isGroceryStore } from './services/openMap'

describe('meal group calculations', () => {
  it('generates distinct IDs for meal groups and local demo plans', () => {
    const first = createUniqueId()
    const second = createMealGroup().id
    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThan(0)
    expect(second.length).toBeGreaterThan(0)
  })

  it('counts people once across meal groups with combined needs', () => {
    const groups: MealGroup[] = [
      { ...createMealGroup('first'), count: 4, diets: ['Vegetarian', 'Gluten-free'] },
      { ...createMealGroup('second'), count: 2, diets: ['Halal'] },
    ]

    expect(totalPeople(groups)).toBe(6)
    expect(isValidMealPlan(groups)).toBe(true)
  })

  it('rejects an empty or invalid headcount', () => {
    expect(isValidMealPlan([createMealGroup('empty')])).toBe(false)
    expect(isValidMealPlan([{ ...createMealGroup('negative'), count: -1 }])).toBe(false)
    expect(isValidMealPlan([{ ...createMealGroup('fraction'), count: 1.5 }])).toBe(false)
  })

  it('builds a ready-to-eat shopping list with quantities for each diet group', () => {
    const groups: MealGroup[] = [
      { ...createMealGroup('vegan'), name: 'Vegan and gluten-free', count: 3, diets: ['Vegan', 'Gluten-free'] },
      { ...createMealGroup('allergy'), name: 'Nut allergy', count: 2, allergens: ['Peanuts'] },
    ]

    expect(createGroceryLines(groups).map(({ label, quantity, unit }) => ({ label, quantity, unit }))).toEqual([
      { label: 'Vegan vegetable sandwiches', quantity: 3, unit: 'sandwiches' },
      { label: 'Turkey-and-vegetable sandwiches', quantity: 2, unit: 'sandwiches' },
      { label: 'Whole apples', quantity: 5, unit: 'apples' },
      { label: 'Single-serve bags of plain potato chips', quantity: 5, unit: 'bags' },
      { label: 'Bottled water', quantity: 5, unit: 'bottles' },
    ])
    expect(createGroceryLines(groups)[0].detail).toContain('gluten-free')
    expect(createGroceryLines(groups)[1].detail).toContain('Peanuts')
  })

  it('scales ready-to-eat items for 20 people plus 2 vegetarians', () => {
    const groups: MealGroup[] = [
      { ...createMealGroup('regular'), name: 'Meal group 1', count: 20 },
      { ...createMealGroup('vegetarian'), name: 'Vegetarian', count: 2, diets: ['Vegetarian'] },
    ]

    expect(createGroceryLines(groups).map(({ label, quantity, unit }) => ({ label, quantity, unit }))).toEqual([
      { label: 'Turkey-and-vegetable sandwiches', quantity: 20, unit: 'sandwiches' },
      { label: 'Cheese-and-vegetable sandwiches', quantity: 2, unit: 'sandwiches' },
      { label: 'Whole apples', quantity: 22, unit: 'apples' },
      { label: 'Single-serve bags of plain potato chips', quantity: 22, unit: 'bags' },
      { label: 'Bottled water', quantity: 22, unit: 'bottles' },
    ])
  })

  it('does not include cheese for vegetarian groups avoiding dairy', () => {
    const lines = createGroceryLines([{
      ...createMealGroup('vegan-dairy-free'),
      count: 1,
      diets: ['Vegetarian', 'Dairy-free'],
    }])

    expect(lines[0].label).toBe('Dairy-free vegetable sandwiches')
  })
})

describe('San Francisco meal times', () => {
  it('formats a time in the San Francisco timezone', () => {
    expect(toSanFranciscoDateTimeInput(new Date('2026-10-09T05:00:00.000Z'))).toBe('2026-10-08T22:00')
  })

  it('defaults meal time to two hours after now in San Francisco time', () => {
    expect(defaultMealTime(new Date('2026-10-09T05:00:00.000Z'))).toBe('2026-10-09T00:00')
  })

  describe('nearby grocery listings', () => {
    it('accepts supermarkets and convenience stores but excludes specialty and non-food shops', () => {
      expect(isGroceryStore({ shop: 'supermarket' })).toBe(true)
      expect(isGroceryStore({ shop: 'convenience' })).toBe(true)
      expect(isGroceryStore({ shop: 'convenience', amenity: 'fuel' })).toBe(false)
      expect(isGroceryStore({ shop: 'supermarket', amenity: 'car_wash' })).toBe(false)
      expect(isGroceryStore({ shop: 'convenience', 'fuel:diesel': 'yes' })).toBe(false)
      expect(isGroceryStore({ shop: 'supermarket', name: 'Neighborhood Liquor' })).toBe(false)
      expect(isGroceryStore({ shop: 'supermarket', name: 'Neighborhood Butchers' })).toBe(false)
      expect(isGroceryStore({ shop: 'supermarket', name: 'Neighborhood Car Wash' })).toBe(false)
      expect(isGroceryStore({ shop: 'convenience', name: 'New York Tobacco' })).toBe(false)
      expect(isGroceryStore({ shop: 'convenience', name: 'Shell' })).toBe(false)
      expect(isGroceryStore({ shop: 'convenience', name: 'Gift and Snack Shop' })).toBe(false)
      expect(isGroceryStore({ shop: 'alcohol' })).toBe(false)
      expect(isGroceryStore({ shop: 'liquor' })).toBe(false)
      expect(isGroceryStore({ shop: 'butcher' })).toBe(false)
      expect(isGroceryStore({ shop: 'deli' })).toBe(false)
      expect(isGroceryStore({ shop: 'health_food' })).toBe(false)
      expect(isGroceryStore({ shop: 'greengrocer' })).toBe(false)
      expect(isGroceryStore({ shop: 'beverages' })).toBe(false)
    })
  })

  it('parses the selected wall-clock time', () => {
    const scheduled = createScheduleDate('2026-10-08T22:15')
    expect(scheduled?.getFullYear()).toBe(2026)
    expect(scheduled?.getHours()).toBe(22)
    expect(scheduled?.getMinutes()).toBe(15)
    expect(createScheduleDate('not a date')).toBeNull()
  })

  it('labels mapped business hours as unknown when they are missing or invalid', () => {
    expect(getHoursState(undefined, new Date())).toBe('unlisted')
    expect(getHoursState('not a valid opening-hours value', new Date())).toBe('unknown')
  })

  it('ranks mapped open status before delivery evidence', () => {
    const midday = new Date('2026-10-09T12:00:00')
    expect(getAvailabilityRank({ opening_hours: 'Mo-Su 00:00-23:59', delivery: 'yes' }, midday)).toBe(0)
    expect(getAvailabilityRank({ opening_hours: 'Mo-Su 00:00-23:59', delivery: 'no' }, midday)).toBe(2)
    expect(getAvailabilityRank({ delivery: 'yes' }, midday)).toBe(10)
    expect(getAvailabilityRank({ opening_hours: 'Mo-Su 00:00-00:01', delivery: 'yes' }, midday)).toBe(20)
  })
})
