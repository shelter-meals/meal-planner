import { describe, expect, it } from 'vitest'
import {
  createGroceryLines,
  createMealGroup,
  createScheduleDate,
  isValidMealPlan,
  toSanFranciscoDateTimeInput,
  totalPeople,
  type MealGroup,
} from './domain'
import { getHoursState, isGroceryStore } from './services/openMap'

describe('meal group calculations', () => {
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

  it('builds one editable grocery meal unit per person in each group', () => {
    const groups: MealGroup[] = [
      { ...createMealGroup('vegan'), name: 'Vegan and gluten-free', count: 3, diets: ['Vegan', 'Gluten-free'] },
      { ...createMealGroup('allergy'), name: 'Nut allergy', count: 2, allergens: ['Peanuts'] },
    ]

    expect(createGroceryLines(groups).map(({ label, quantity }) => ({ label, quantity }))).toEqual([
      { label: 'Individually packaged complete meal for Vegan and gluten-free', quantity: 3 },
      { label: 'Individually packaged complete meal for Nut allergy', quantity: 2 },
    ])
  })
})

describe('San Francisco meal times', () => {
  it('formats a time in the San Francisco timezone', () => {
    expect(toSanFranciscoDateTimeInput(new Date('2026-10-09T05:00:00.000Z'))).toBe('2026-10-08T22:00')
  })

  describe('nearby grocery listings', () => {
    it('accepts food retailers and excludes fuel and alcohol retailers', () => {
      expect(isGroceryStore({ shop: 'supermarket' })).toBe(true)
      expect(isGroceryStore({ shop: 'convenience' })).toBe(true)
      expect(isGroceryStore({ shop: 'convenience', amenity: 'fuel' })).toBe(false)
      expect(isGroceryStore({ shop: 'convenience', 'fuel:diesel': 'yes' })).toBe(false)
      expect(isGroceryStore({ shop: 'alcohol' })).toBe(false)
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
})
