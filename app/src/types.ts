import type { MealGroup } from './domain'

export interface MealPlanData {
  title: string
  mealTime: string
  groups: MealGroup[]
  budget: number | null
  radiusMiles: number
}
