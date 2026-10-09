import { initializeApp, getApps } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type User,
} from 'firebase/auth'
import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore'
import { ALLERGENS, DIETARY_NEEDS, type Allergen, type DietaryNeed, type MealGroup } from '../domain'
import type { MealPlanData } from '../types'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Object.values(config).every(Boolean)

const app = firebaseConfigured
  ? getApps()[0] ?? initializeApp(config)
  : null

export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null

export async function initializeAuthPersistence(): Promise<void> {
  if (auth) await setPersistence(auth, browserLocalPersistence)
}

function requireDatabase() {
  if (!db) throw new Error('Firebase is not configured. Add the required VITE_FIREBASE values first.')
  return db
}

function cleanPlanData(plan: MealPlanData, user: User): DocumentData {
  return {
    ownerUid: user.uid,
    ownerEmail: user.email ?? '',
    title: plan.title.slice(0, 100),
    mealTime: plan.mealTime,
    groups: plan.groups.map(({ id, name, count, diets, allergens, notes }) => ({
      id,
      name: name.slice(0, 60),
      count,
      diets,
      allergens,
      notes: notes.slice(0, 500),
    })),
    budget: plan.budget,
    radiusMiles: plan.radiusMiles,
    sharedWith: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isChoice<T extends string>(choices: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && choices.some((choice) => choice === value)
}

function parseMealGroups(value: unknown): MealGroup[] {
  if (!Array.isArray(value)) throw new Error('Saved plan has invalid meal-group data.')
  return value.map((group, index) => {
    if (!isRecord(group)
      || typeof group.id !== 'string'
      || typeof group.name !== 'string'
      || typeof group.count !== 'number'
      || !Number.isInteger(group.count)
      || group.count < 0
      || typeof group.notes !== 'string'
      || !Array.isArray(group.diets)
      || !group.diets.every((need) => isChoice(DIETARY_NEEDS, need))
      || !Array.isArray(group.allergens)
      || !group.allergens.every((allergen) => isChoice(ALLERGENS, allergen))) {
      throw new Error(`Saved plan has invalid data in meal group ${index + 1}.`)
    }
    return {
      id: group.id,
      name: group.name,
      count: group.count,
      diets: group.diets as DietaryNeed[],
      allergens: group.allergens as Allergen[],
      notes: group.notes,
    }
  })
}

export async function saveMealPlan(plan: MealPlanData, user: User): Promise<string> {
  const plans = collection(requireDatabase(), 'plans')
  const planRef = doc(plans)
  await setDoc(planRef, cleanPlanData(plan, user))
  return planRef.id
}

export interface StoredPlan extends MealPlanData {
  id: string
  ownerUid: string
  ownerEmail: string
  sharedWith: string[]
}

function toStoredPlan(id: string, data: DocumentData): StoredPlan {
  if (typeof data.ownerUid !== 'string'
    || typeof data.ownerEmail !== 'string'
    || typeof data.title !== 'string'
    || typeof data.mealTime !== 'string'
    || typeof data.radiusMiles !== 'number'
    || ![5, 10, 15].includes(data.radiusMiles)
    || !(data.budget === null || (typeof data.budget === 'number' && Number.isFinite(data.budget) && data.budget >= 0))
    || !Array.isArray(data.sharedWith)
    || !data.sharedWith.every((email: unknown) => typeof email === 'string')) {
    throw new Error('Saved plan has invalid data. It could not be opened.')
  }
  return {
    id,
    ownerUid: data.ownerUid,
    ownerEmail: data.ownerEmail,
    title: data.title,
    mealTime: data.mealTime,
    groups: parseMealGroups(data.groups),
    budget: data.budget,
    radiusMiles: data.radiusMiles,
    sharedWith: data.sharedWith,
  }
}

export async function listMealPlans(user: User): Promise<StoredPlan[]> {
  const database = requireDatabase()
  const plans = collection(database, 'plans')
  const owned = await getDocs(query(plans, where('ownerUid', '==', user.uid)))
  const shared = user.email
    ? await getDocs(query(plans, where('sharedWith', 'array-contains', user.email.toLowerCase())))
    : null
  const claims = await getDocs(query(collectionGroup(database, 'claims'), where('uid', '==', user.uid)))
  const claimedPlans = await Promise.all(claims.docs
    .map((claim) => claim.ref.parent.parent)
    .filter((planRef) => planRef !== null)
    .map((planRef) => getDoc(planRef)))
  const unique = new Map<string, StoredPlan>()
  for (const item of [...owned.docs, ...(shared?.docs ?? []), ...claimedPlans]) {
    if (!item.exists()) continue
    unique.set(item.id, toStoredPlan(item.id, item.data()))
  }
  return [...unique.values()].sort((a, b) => b.mealTime.localeCompare(a.mealTime))
}

export async function deleteMealPlan(planId: string): Promise<void> {
  const database = requireDatabase()
  const planSnapshot = await getDoc(doc(database, 'plans', planId))
  if (!planSnapshot.exists()) return
  const claims = await getDocs(collection(database, 'plans', planId, 'claims'))
  const links = await getDocs(query(
    collection(database, 'shareLinks'),
    where('ownerUid', '==', planSnapshot.data().ownerUid),
    where('planId', '==', planId),
  ))
  await Promise.all([
    ...claims.docs.map((claim) => deleteDoc(claim.ref)),
    ...links.docs.map((link) => deleteDoc(link.ref)),
  ])
  await deleteDoc(doc(database, 'plans', planId))
}

export async function shareMealPlanWithEmail(planId: string, email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Enter a valid email address.')
  }
  await updateDoc(doc(requireDatabase(), 'plans', planId), {
    sharedWith: arrayUnion(normalizedEmail),
    updatedAt: serverTimestamp(),
  })
}

export async function removeMealPlanShare(planId: string, email: string): Promise<void> {
  await updateDoc(doc(requireDatabase(), 'plans', planId), {
    sharedWith: arrayRemove(email.toLowerCase()),
    updatedAt: serverTimestamp(),
  })
}

export async function createMealPlanShareLink(planId: string, user: User): Promise<string> {
  const token = crypto.randomUUID().replaceAll('-', '')
  const linkRef = doc(requireDatabase(), 'shareLinks', token)
  await setDoc(linkRef, {
    planId,
    ownerUid: user.uid,
    active: true,
    createdAt: serverTimestamp(),
  })
  return `${window.location.origin}${window.location.pathname}?share=${token}`
}

export interface MealPlanShareLink {
  id: string
  url: string
}

export async function listMealPlanShareLinks(planId: string, user: User): Promise<MealPlanShareLink[]> {
  const links = await getDocs(query(
    collection(requireDatabase(), 'shareLinks'),
    where('ownerUid', '==', user.uid),
    where('planId', '==', planId),
  ))
  return links.docs
    .filter((link) => link.data().active === true)
    .map((link) => ({
      id: link.id,
      url: `${window.location.origin}${window.location.pathname}?share=${link.id}`,
    }))
}

export async function revokeMealPlanShareLink(token: string): Promise<void> {
  const database = requireDatabase()
  const linkRef = doc(database, 'shareLinks', token)
  const link = await getDoc(linkRef)
  if (!link.exists()) return
  const planId = String(link.data().planId ?? '')
  if (planId) {
    const claims = await getDocs(collection(database, 'plans', planId, 'claims'))
    await Promise.all(claims.docs
      .filter((claim) => claim.data().tokenId === token)
      .map((claim) => deleteDoc(claim.ref)))
  }
  await updateDoc(linkRef, { active: false })
}

export async function claimMealPlanShareLink(token: string, user: User): Promise<StoredPlan | null> {
  const database = requireDatabase()
  const linkSnapshot = await getDoc(doc(database, 'shareLinks', token))
  if (!linkSnapshot.exists() || linkSnapshot.data().active !== true) return null
  const planId = String(linkSnapshot.data().planId ?? '')
  if (!planId) return null

  await setDoc(doc(database, 'plans', planId, 'claims', user.uid), {
    uid: user.uid,
    tokenId: token,
    createdAt: serverTimestamp(),
  })
  const planSnapshot = await getDoc(doc(database, 'plans', planId))
  return planSnapshot.exists() ? toStoredPlan(planSnapshot.id, planSnapshot.data()) : null
}
