export const DIETARY_NEEDS = [
  'Vegetarian',
  'Vegan',
  'Gluten-free',
  'Dairy-free',
  'Halal',
  'Kosher',
  'Pork-free',
] as const

export const ALLERGENS = [
  'Peanuts',
  'Tree nuts',
  'Milk',
  'Eggs',
  'Wheat',
  'Soy',
  'Sesame',
  'Fish',
  'Shellfish',
] as const

export type DietaryNeed = (typeof DIETARY_NEEDS)[number]
export type Allergen = (typeof ALLERGENS)[number]

export interface MealGroup {
  id: string
  name: string
  count: number
  diets: DietaryNeed[]
  allergens: Allergen[]
  notes: string
}

export interface SearchPlan {
  title: string
  mealTime: string
  groups: MealGroup[]
  budget: number | null
  radiusMiles: number
}

export interface FoodPlace {
  id: string
  name: string
  category: 'restaurant' | 'grocery'
  typeLabel: string
  lat: number
  lon: number
  distanceMiles: number
  tags: Record<string, string>
}

export interface GroceryLine {
  id: string
  groupId: string
  label: string
  detail: string
  quantity: number
}

export function totalPeople(groups: MealGroup[]): number {
  return groups.reduce((total, group) => total + Math.max(0, group.count), 0)
}

export function formatNeeds(group: MealGroup): string {
  const needs = [...group.diets, ...group.allergens.map((allergen) => `${allergen} allergy`)]
  if (group.notes.trim()) needs.push('Other needs')
  return needs.length ? needs.join(', ') : 'No listed dietary restrictions'
}

export function createGroceryLines(groups: MealGroup[]): GroceryLine[] {
  return groups
    .filter((group) => group.count > 0)
    .map((group) => ({
      id: group.id,
      groupId: group.id,
      label: `Individually packaged complete meal for ${group.name}`,
      detail: `${formatNeeds(group)}. Check the package label and contact the manufacturer or store about ingredients and cross-contact.`,
      quantity: group.count,
    }))
}

let fallbackIdCounter = 0

export function createUniqueId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  fallbackIdCounter += 1
  return `local-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function createMealGroup(id: string = createUniqueId()): MealGroup {
  return {
    id,
    name: 'Meal group',
    count: 0,
    diets: [],
    allergens: [],
    notes: '',
  }
}

export function toSanFranciscoDateTimeInput(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`
}

export function defaultMealTime(date = new Date()): string {
  return toSanFranciscoDateTimeInput(new Date(date.getTime() + 2 * 60 * 60 * 1000))
}

export function createScheduleDate(dateTime: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dateTime)
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
}

export function isValidMealPlan(groups: MealGroup[]): boolean {
  return groups.length > 0 && groups.every((group) => group.count >= 0 && Number.isInteger(group.count))
    && totalPeople(groups) > 0
}
