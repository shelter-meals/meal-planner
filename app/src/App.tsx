import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  Globe2,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBasket,
  Store,
  Trash2,
  Utensils,
  X,
} from 'lucide-react'
import { signOut } from 'firebase/auth'
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  ALLERGENS,
  createGroceryLines,
  createMealGroup,
  createScheduleDate,
  DIETARY_NEEDS,
  isValidMealPlan,
  toSanFranciscoDateTimeInput,
  totalPeople,
  type Allergen,
  type DietaryNeed,
  type FoodPlace,
  type GroceryLine,
  type MealGroup,
} from './domain'
import { AuthGate } from './auth/AuthGate'
import { useAuth } from './auth/AuthContext'
import {
  auth,
  claimMealPlanShareLink,
  createMealPlanShareLink,
  deleteMealPlan,
  listMealPlans,
  listMealPlanShareLinks,
  removeMealPlanShare,
  revokeMealPlanShareLink,
  saveMealPlan,
  shareMealPlanWithEmail,
  type StoredPlan,
} from './services/firebase'
import {
  getDeliveryStatus,
  getDietTag,
  getHoursState,
  searchFoodPlaces,
  type HoursState,
} from './services/openMap'
import type { MealPlanData } from './types'
import './App.css'

type ResultFilter = 'restaurants' | 'groceries'

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}

function formatRequestedTime(dateTime: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dateTime)
  if (!parts) return 'your selected time'
  const [, year, month, day, hour, minute] = parts
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatOsmSnapshot(timestamp: string): string {
  const normalized = timestamp.includes('Z') || /[+-]\d{2}:\d{2}$/.test(timestamp)
    ? timestamp
    : `${timestamp.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return timestamp
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)
}

function osmLink(place: FoodPlace): string {
  return `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=18/${place.lat}/${place.lon}`
}

function MapStatus({ state }: { state: HoursState }) {
  const copy = state === 'open'
    ? 'Mapped hours say open'
    : state === 'closed'
      ? 'Mapped hours say closed'
      : state === 'unknown'
        ? 'Hours need checking'
        : 'Hours not listed'
  return <span className={`status-pill hours-${state}`}><Clock3 size={14} />{copy}</span>
}

function getSortValue(place: FoodPlace, scheduledTime: Date | null): number {
  const hours = getHoursState(place.tags.opening_hours, scheduledTime)
  const delivery = getDeliveryStatus(place.tags)
  return (hours === 'open' ? 0 : hours === 'unknown' ? 1 : hours === 'unlisted' ? 2 : 3)
    + (delivery === 'listed' ? 0 : delivery === 'unknown' ? 0.25 : 1)
}

function PlaceRow({
  place,
  scheduledTime,
  groups,
}: {
  place: FoodPlace
  scheduledTime: Date | null
  groups: MealGroup[]
}) {
  const hours = getHoursState(place.tags.opening_hours, scheduledTime)
  const delivery = getDeliveryStatus(place.tags)
  const listedNeeds = DIETARY_NEEDS.filter((need) => groups.some((group) =>
    group.diets.includes(need) && getDietTag(place.tags, need),
  ))
  const hasDietaryNeeds = groups.some((group) => group.diets.length > 0)
  const phone = place.tags.phone ?? place.tags['contact:phone']
  const website = place.tags.website ?? place.tags['contact:website']
  const deliveryText = delivery === 'listed'
    ? 'Delivery is listed; confirm with the business'
    : delivery === 'pickup'
      ? 'Pickup listed; delivery not indicated'
      : 'Delivery availability unknown'

  return (
    <article className="place-row">
      <div className="place-row__main">
        <div className="place-type-icon" aria-hidden="true">
          {place.category === 'restaurant' ? <Utensils size={18} /> : <Store size={18} />}
        </div>
        <div className="place-copy">
          <div className="place-title-line">
            <h3>{place.name}</h3>
            <span className="place-distance">{place.distanceMiles.toFixed(1)} mi</span>
          </div>
          <p className="place-kind">{place.typeLabel} <span>•</span> straight-line distance</p>
          <div className="place-statuses">
            <MapStatus state={hours} />
            <span className={`status-pill delivery-${delivery}`}>
              {delivery === 'listed' ? <Check size={14} /> : <AlertTriangle size={14} />}
              {deliveryText}
            </span>
          </div>
          <div className="place-diet-note">
            {listedNeeds.length > 0 ? (
              <span><Check size={14} /> Map listing marks {listedNeeds.join(', ').toLowerCase()}.</span>
            ) : hasDietaryNeeds ? (
              <span><AlertTriangle size={14} /> Menu and dietary fit are not verified.</span>
            ) : (
              <span><AlertTriangle size={14} /> Menu details are not included in this listing.</span>
            )}
            {groups.some((group) => group.allergens.length > 0) && (
              <strong> No allergy safety information is available here.</strong>
            )}
          </div>
          {(phone || website) && (
            <div className="place-contact">
              {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}><span>Call</span> {phone}</a>}
              {website && <a href={website} rel="noreferrer" target="_blank">Business website <ExternalLink size={13} /></a>}
            </div>
          )}
          <a className="place-map-link" href={osmLink(place)} rel="noreferrer" target="_blank">
            View OpenStreetMap listing <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </article>
  )
}

function GroupEditor({
  group,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  group: MealGroup
  index: number
  canRemove: boolean
  onChange: (next: MealGroup) => void
  onRemove: () => void
}) {
  const toggleDiet = (need: DietaryNeed) => {
    onChange({
      ...group,
      diets: group.diets.includes(need)
        ? group.diets.filter((value) => value !== need)
        : [...group.diets, need],
    })
  }
  const toggleAllergen = (allergen: Allergen) => {
    onChange({
      ...group,
      allergens: group.allergens.includes(allergen)
        ? group.allergens.filter((value) => value !== allergen)
        : [...group.allergens, allergen],
    })
  }

  return (
    <section className="meal-group">
      <div className="meal-group__top">
        <div className="group-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
        <label className="group-name-label">
          <span className="sr-only">Meal group name</span>
          <input
            aria-label={`Meal group ${index + 1} name`}
            maxLength={60}
            onChange={(event) => onChange({ ...group, name: event.target.value })}
            value={group.name}
          />
        </label>
        <label className="people-count">
          <span>People</span>
          <input
            aria-label={`People in group ${index + 1}`}
            min="0"
            onChange={(event) => onChange({ ...group, count: Math.max(0, Number(event.target.value)) })}
            type="number"
            value={group.count}
          />
        </label>
        {canRemove && (
          <button className="icon-button remove-group" onClick={onRemove} type="button" aria-label={`Remove ${group.name || `group ${index + 1}`}`}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <div className="need-block">
        <p className="need-label">Dietary needs</p>
        <div className="need-chips">
          {DIETARY_NEEDS.map((need) => (
            <button
              aria-pressed={group.diets.includes(need)}
              className={`need-chip ${group.diets.includes(need) ? 'is-selected' : ''}`}
              key={need}
              onClick={() => toggleDiet(need)}
              type="button"
            >
              {group.diets.includes(need) && <Check size={13} />}
              {need}
            </button>
          ))}
        </div>
      </div>
      <details className="allergy-details">
        <summary>
          <span>{group.allergens.length ? `${group.allergens.length} allergy ${group.allergens.length === 1 ? 'selected' : 'selections'}` : 'Add allergies or another requirement'}</span>
          <ChevronDown size={15} />
        </summary>
        <div className="allergy-panel">
          <p className="allergy-explanation">Allergies need direct confirmation with the provider. A listing cannot confirm ingredient or cross-contact safety.</p>
          <div className="need-chips">
            {ALLERGENS.map((allergen) => (
              <button
                aria-pressed={group.allergens.includes(allergen)}
                className={`need-chip allergy-chip ${group.allergens.includes(allergen) ? 'is-selected' : ''}`}
                key={allergen}
                onClick={() => toggleAllergen(allergen)}
                type="button"
              >
                {group.allergens.includes(allergen) && <Check size={13} />}
                {allergen}
              </button>
            ))}
          </div>
          <label className="notes-label">
            Other strict requirements or notes
            <textarea
              maxLength={500}
              onChange={(event) => onChange({ ...group, notes: event.target.value })}
              placeholder="For example, severe sesame allergy; avoid shared equipment"
              rows={2}
              value={group.notes}
            />
          </label>
        </div>
      </details>
    </section>
  )
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section aria-labelledby="dialog-heading" aria-modal="true" className="dialog-panel" role="dialog">
        <div className="dialog-heading">
          <h2 id="dialog-heading">{title}</h2>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

function readLocalPlans(): StoredPlan[] {
  const raw = window.localStorage.getItem('shelter-meal-planner-demo-plans')
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Saved demo plans are not in the expected format.')
    return parsed as StoredPlan[]
  } catch (error) {
    console.error('Could not read locally saved demo plans.', error)
    throw new Error('Saved plans could not be read. Clear the demo plans from this browser and try again.')
  }
}

function saveLocalPlans(plans: StoredPlan[]) {
  window.localStorage.setItem('shelter-meal-planner-demo-plans', JSON.stringify(plans))
}

function Planner() {
  const { user, demoMode } = useAuth()
  const [address, setAddress] = useState('')
  const [addressDisclosure, setAddressDisclosure] = useState(false)
  const [mealTime, setMealTime] = useState(() => toSanFranciscoDateTimeInput())
  const [groups, setGroups] = useState<MealGroup[]>([{ ...createMealGroup('group-one'), name: 'Meal group 1' }])
  const [budgetText, setBudgetText] = useState('')
  const [radiusMiles, setRadiusMiles] = useState(5)
  const [busy, setBusy] = useState(false)
  const [places, setPlaces] = useState<FoodPlace[] | null>(null)
  const [searchedAt, setSearchedAt] = useState<string | null>(null)
  const [dataTimestamp, setDataTimestamp] = useState<string | null>(null)
  const [searchedFingerprint, setSearchedFingerprint] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<ResultFilter>('restaurants')
  const [groceryLines, setGroceryLines] = useState<GroceryLine[]>([])
  const [checkedLines, setCheckedLines] = useState<string[]>([])
  const [savedPlans, setSavedPlans] = useState<StoredPlan[]>([])
  const [savedBusy, setSavedBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [sharePlan, setSharePlan] = useState<StoredPlan | null>(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [shareLinks, setShareLinks] = useState<{ id: string; url: string }[]>([])
  const [shareBusy, setShareBusy] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  const people = useMemo(() => totalPeople(groups), [groups])
  const scheduledTime = useMemo(() => createScheduleDate(mealTime), [mealTime])
  const parsedBudget = budgetText.trim() ? Number(budgetText) : null
  const validBudget = parsedBudget === null || (Number.isFinite(parsedBudget) && parsedBudget >= 0)
  const searchFingerprint = JSON.stringify({ address, mealTime, radiusMiles, groups })
  const isSearchOutdated = Boolean(places && searchedFingerprint !== searchFingerprint)
  const resultPlaces = useMemo(() => {
    if (!places) return []
    const category = filter === 'restaurants' ? 'restaurant' : 'grocery'
    return places
      .filter((place) => place.category === category)
      .sort((a, b) => getSortValue(a, scheduledTime) - getSortValue(b, scheduledTime)
        || a.distanceMiles - b.distanceMiles)
  }, [filter, places, scheduledTime])
  const selectedPlaceCount = useMemo(
    () => (places ?? []).filter((place) => place.category === 'restaurant').length,
    [places],
  )
  const groceryPlaceCount = useMemo(
    () => (places ?? []).filter((place) => place.category === 'grocery').length,
    [places],
  )

  useEffect(() => {
    let active = true
    const load = demoMode
      ? Promise.resolve().then(readLocalPlans)
      : user
        ? listMealPlans(user)
        : Promise.resolve([])
    void load.then((plans) => {
      if (active) setSavedPlans(plans)
    }).catch((loadError: unknown) => {
      if (active) setError(messageFrom(loadError))
    })
    return () => { active = false }
  }, [demoMode, user])

  useEffect(() => {
    if (!sharePlan || !user || demoMode) return
    let active = true
    void listMealPlanShareLinks(sharePlan.id, user).then((links) => {
      if (active) setShareLinks(links)
    }).catch((loadError: unknown) => {
      if (active) setError(messageFrom(loadError))
    })
    return () => { active = false }
  }, [demoMode, sharePlan, user])

  useEffect(() => {
    if (!user) return
    const token = new URLSearchParams(window.location.search).get('share')
    if (!token) return
    let active = true
    void claimMealPlanShareLink(token, user).then((plan) => {
      if (!active) return
      if (!plan) {
        setError('This share link is no longer available.')
        return
      }
      setSavedPlans((current) => current.some((saved) => saved.id === plan.id) ? current : [plan, ...current])
      setNotice(`Shared plan opened: ${plan.title}`)
      window.history.replaceState({}, document.title, window.location.pathname)
    }).catch((claimError: unknown) => {
      if (active) setError(messageFrom(claimError))
    }).finally(() => {
      if (active) setSavedBusy(false)
    })
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  function updateGroup(id: string, next: MealGroup) {
    setGroups((current) => current.map((group) => group.id === id ? next : group))
  }

  async function performSearch(searchRadius = radiusMiles) {
    setError('')
    setNotice('')
    if (!addressDisclosure) {
      setError('Confirm the location-search disclosure before searching.')
      return
    }
    if (!isValidMealPlan(groups)) {
      setError('Enter at least one person and check that all meal-group counts are correct.')
      return
    }
    if (!validBudget) {
      setError('Enter a valid non-negative budget, or leave the budget blank.')
      return
    }
    setBusy(true)
    setPlaces(null)
    setSearchedAt(null)
    setDataTimestamp(null)
    const requestAddress = address
    const requestGroups = groups.map((group) => ({ ...group }))
    const requestFingerprint = JSON.stringify({
      address: requestAddress,
      mealTime,
      radiusMiles: searchRadius,
      groups: requestGroups,
    })
    try {
      const result = await searchFoodPlaces(requestAddress, searchRadius)
      setPlaces(result.matches)
      setSearchedAt(new Date().toISOString())
      setDataTimestamp(result.dataTimestamp)
      setSearchedFingerprint(requestFingerprint)
      setGroceryLines(createGroceryLines(requestGroups).map((line) => {
        const group = requestGroups.find((item) => item.id === line.groupId)
        return group ? { ...line, label: `Complete meal for ${group.name || 'meal group'}` } : line
      }))
      setCheckedLines([])
      setFilter('restaurants')
    } catch (searchError) {
      setError(messageFrom(searchError))
    } finally {
      setBusy(false)
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await performSearch()
  }

  function makePlanData(): MealPlanData {
    return {
      title: `Meal plan · ${formatRequestedTime(mealTime)}`,
      mealTime,
      groups,
      budget: parsedBudget,
      radiusMiles,
    }
  }

  async function savePlan() {
    setError('')
    setNotice('')
    if (!isValidMealPlan(groups)) {
      setError('Add at least one person before saving this plan.')
      return
    }
    setSavedBusy(true)
    try {
      const data = makePlanData()
      if (demoMode) {
        const plan: StoredPlan = {
          ...data,
          id: crypto.randomUUID(),
          ownerUid: 'local-demo',
          ownerEmail: 'This browser only',
          sharedWith: [],
        }
        const updated = [plan, ...savedPlans]
        saveLocalPlans(updated)
        setSavedPlans(updated)
      } else if (user) {
        await saveMealPlan(data, user)
        setSavedPlans(await listMealPlans(user))
      } else {
        throw new Error('Sign in to save this plan.')
      }
      setNotice('Plan saved without its shelter address.')
    } catch (saveError) {
      setError(messageFrom(saveError))
    } finally {
      setSavedBusy(false)
    }
  }

  async function removePlan(plan: StoredPlan) {
    const confirmed = window.confirm(`Delete "${plan.title}"? This cannot be undone.`)
    if (!confirmed) return
    setError('')
    try {
      if (demoMode) {
        const updated = savedPlans.filter((item) => item.id !== plan.id)
        saveLocalPlans(updated)
        setSavedPlans(updated)
      } else {
        await deleteMealPlan(plan.id)
        setSavedPlans(await listMealPlans(user!))
      }
      if (sharePlan?.id === plan.id) setSharePlan(null)
      setNotice('Plan deleted.')
    } catch (deleteError) {
      setError(messageFrom(deleteError))
    }
  }

  function reopenPlan(plan: StoredPlan) {
    setGroups(plan.groups.map((group) => ({ ...group })))
    setMealTime(plan.mealTime)
    setBudgetText(plan.budget === null ? '' : String(plan.budget))
    setRadiusMiles(plan.radiusMiles)
    setAddress('')
    setAddressDisclosure(false)
    setPlaces(null)
    setSearchedAt(null)
    setDataTimestamp(null)
    setSearchedFingerprint(null)
    setError('')
    setNotice('Plan loaded. Re-enter the shelter address to search nearby; it is not saved in this plan.')
    scrollToTop()
  }

  async function addEmailShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sharePlan || !user) return
    setShareBusy(true)
    setError('')
    try {
      await shareMealPlanWithEmail(sharePlan.id, shareEmail)
      setShareEmail('')
      const updated = await listMealPlans(user)
      setSavedPlans(updated)
      setSharePlan(updated.find((plan) => plan.id === sharePlan.id) ?? sharePlan)
      setNotice('Plan shared with that email address.')
    } catch (shareError) {
      setError(messageFrom(shareError))
    } finally {
      setShareBusy(false)
    }
  }

  async function createShareLink() {
    if (!sharePlan || !user) return
    setShareBusy(true)
    setError('')
    try {
      const link = await createMealPlanShareLink(sharePlan.id, user)
      setShareLink(link)
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
        await navigator.clipboard.writeText(link)
        setNotice('Sign-in-required share link created and copied.')
      } catch (clipboardError) {
        console.warn('The share link was created but could not be copied automatically.', clipboardError)
        setNotice('Share link created. Select and copy it below.')
      }
      setShareLinks(await listMealPlanShareLinks(sharePlan.id, user))
    } catch (linkError) {
      setError(messageFrom(linkError))
    } finally {
      setShareBusy(false)
    }
  }

  async function revokeLink(token: string) {
    if (!sharePlan) return
    setError('')
    try {
      await revokeMealPlanShareLink(token)
      setShareLinks((current) => current.filter((link) => link.id !== token))
      if (shareLink.includes(token)) setShareLink('')
      setNotice('Share link revoked.')
    } catch (revokeError) {
      setError(messageFrom(revokeError))
    }
  }

  async function deleteShareEmail(email: string) {
    if (!sharePlan || !user) return
    try {
      await removeMealPlanShare(sharePlan.id, email)
      const updated = await listMealPlans(user)
      setSavedPlans(updated)
      setSharePlan(updated.find((plan) => plan.id === sharePlan.id) ?? sharePlan)
      setNotice('Plan access removed.')
    } catch (shareError) {
      setError(messageFrom(shareError))
    }
  }

  function loadSavedPlan(plan: StoredPlan) {
    reopenPlan(plan)
  }

  async function leaveWorkspace() {
    if (!auth) return
    setSignOutError('')
    try {
      await signOut(auth)
    } catch (signOutFailure) {
      setSignOutError(messageFrom(signOutFailure))
    }
  }

  return (
    <div className="workspace">
      <aside className="side-rail">
        <a className="brand-lockup" href="/" aria-label="Shelter Meal Planner home">
          <span className="brand-mark">SM</span>
          <span className="brand-name">Shelter Meal<br />Planner</span>
        </a>
        <div className="rail-section">
          <p className="rail-heading">Workspace</p>
          <button className="rail-action is-current" type="button" onClick={() => {
            setPlaces(null)
            setError('')
            scrollToTop()
          }}>
            <Plus size={16} /> New meal plan
          </button>
          <p className="rail-heading saved-heading">Saved plans <span>{savedPlans.length}</span></p>
          <div className="saved-list">
            {savedPlans.length === 0 ? (
              <p className="saved-empty">Plans you save will appear here.</p>
            ) : savedPlans.map((plan) => (
              <div className="saved-plan" key={plan.id}>
                <button className="saved-plan__open" onClick={() => loadSavedPlan(plan)} type="button">
                  <span>{plan.title}</span>
                  <small>{totalPeople(plan.groups)} people</small>
                </button>
                {!demoMode && plan.ownerUid === user?.uid && (
                  <button
                    aria-label={`Share ${plan.title}`}
                    className="saved-plan__share"
                    onClick={() => {
                      setSharePlan(plan)
                      setShareLink('')
                      setShareLinks([])
                    }}
                    type="button"
                  ><Share2 size={15} /></button>
                )}
                {(demoMode || plan.ownerUid === user?.uid) && (
                  <button
                    aria-label={`Delete ${plan.title}`}
                    className="saved-plan__delete"
                    onClick={() => void removePlan(plan)}
                    type="button"
                  ><Trash2 size={15} /></button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="rail-footer">
          <div className="rail-privacy"><LockKeyhole size={15} /><span>Addresses stay out of saved plans.</span></div>
          <div className="rail-user">
            <div className="user-avatar">{demoMode ? 'D' : user?.email?.slice(0, 1).toUpperCase()}</div>
            <div><strong>{demoMode ? 'Local preview' : user?.email}</strong><small>{demoMode ? 'Data stays in this browser' : 'Signed in'}</small></div>
            {!demoMode && <button aria-label="Sign out" className="signout-button" onClick={() => void leaveWorkspace()} type="button">Sign out</button>}
          </div>
          {signOutError && <p className="signout-error" role="alert">{signOutError}</p>}
        </div>
      </aside>

      <main className="main-panel">
        <header className="mobile-header">
          <a className="brand-lockup" href="/" aria-label="Shelter Meal Planner home">
            <span className="brand-mark">SM</span><span className="brand-name">Shelter Meal Planner</span>
          </a>
          <div className="mobile-header-actions">
            <span className="pilot-badge">San Francisco</span>
            <details className="mobile-saved">
              <summary>Saved <span>{savedPlans.length}</span></summary>
              <div className="mobile-saved-panel">
                {savedPlans.length === 0 ? <p className="saved-empty">Saved plans will appear here.</p> : savedPlans.map((plan) => (
                  <div className="mobile-saved-item" key={plan.id}>
                    <button className="mobile-saved-open" onClick={() => loadSavedPlan(plan)} type="button">
                      <strong>{plan.title}</strong><small>{totalPeople(plan.groups)} people</small>
                    </button>
                    {!demoMode && plan.ownerUid === user?.uid && <button aria-label={`Share ${plan.title}`} className="mobile-saved-action" onClick={() => {
                      setSharePlan(plan)
                      setShareLink('')
                      setShareLinks([])
                    }} type="button"><Share2 size={15} /></button>}
                    {(demoMode || plan.ownerUid === user?.uid) && <button aria-label={`Delete ${plan.title}`} className="mobile-saved-action" onClick={() => void removePlan(plan)} type="button"><Trash2 size={15} /></button>}
                  </div>
                ))}
                {!demoMode && <button className="mobile-signout" onClick={() => void leaveWorkspace()} type="button">Sign out</button>}
              </div>
            </details>
          </div>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <p className="location-line"><MapPin size={15} /> SAN FRANCISCO, CALIFORNIA</p>
              <h1>Plan the next meal.</h1>
              <p className="page-subtitle">One address, a few needs, and a clear plan for the people waiting.</p>
            </div>
            <div className={`connection-state ${demoMode ? 'connection-demo' : ''}`}>
              <span className="connection-dot" />
              {demoMode ? 'Local preview' : 'Private workspace'}
            </div>
          </div>

          {demoMode && (
            <div className="demo-banner" role="status">
              <ShieldCheck size={16} />
              <span>Local preview. Add Firebase settings to enable secure online sign-in and shared plans.</span>
            </div>
          )}

          {notice && <div className="notice-banner" role="status"><Check size={17} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')} type="button"><X size={15} /></button></div>}
          {error && <div className="error-banner" role="alert"><AlertTriangle size={17} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')} type="button"><X size={15} /></button></div>}

          <form className="planning-form" onSubmit={(event) => void search(event)}>
            <section className="location-section" aria-labelledby="location-heading">
              <div className="section-heading">
                <span className="section-icon"><MapPin size={17} /></span>
                <div><h2 id="location-heading">Where should food go?</h2><p>Enter the shelter address. We only use it to search nearby.</p></div>
              </div>
              <label className="address-label" htmlFor="shelter-address">Shelter delivery address</label>
              <div className="address-control">
                <MapPin aria-hidden="true" size={19} />
                <input
                  autoComplete="street-address"
                  id="shelter-address"
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Street address, San Francisco, CA"
                  required
                  value={address}
                />
                {address && <button aria-label="Clear address" className="address-clear" onClick={() => setAddress('')} type="button"><X size={17} /></button>}
              </div>
              <label className="disclosure-check">
                <input checked={addressDisclosure} onChange={(event) => setAddressDisclosure(event.target.checked)} type="checkbox" />
                <span>Send this address to OpenStreetMap to find nearby businesses. We do not save it with the plan.</span>
              </label>
            </section>

            <div className="settings-row">
              <label className="setting-field" htmlFor="meal-time">
                <span><Clock3 size={16} /> Meal time <small>San Francisco time</small></span>
                <input id="meal-time" onChange={(event) => setMealTime(event.target.value)} required type="datetime-local" value={mealTime} />
              </label>
              <fieldset className="setting-field radius-field">
                <legend><MapPin size={16} /> Search radius</legend>
                <div className="segmented-control">
                  {[5, 10, 15].map((radius) => (
                    <button aria-pressed={radiusMiles === radius} className={radiusMiles === radius ? 'is-selected' : ''} key={radius} onClick={() => setRadiusMiles(radius)} type="button">
                      {radius} mi
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="setting-field budget-field" htmlFor="budget">
                <span><span className="dollar-icon">$</span> Optional budget</span>
                <div className="budget-input"><span>$</span><input id="budget" min="0" onChange={(event) => setBudgetText(event.target.value)} placeholder="No limit" step="0.01" type="number" value={budgetText} /><small>total</small></div>
                <small className="budget-note">Price data is not available in this preview.</small>
              </label>
            </div>

            <section className="groups-section" aria-labelledby="groups-heading">
              <div className="groups-header">
                <div className="section-heading">
                  <span className="section-icon"><UsersIcon /></span>
                  <div><h2 id="groups-heading">Who needs a meal?</h2><p>Group people with the same combination of needs.</p></div>
                </div>
                <div className="people-total"><strong>{people}</strong><span>{people === 1 ? 'person' : 'people'}</span></div>
              </div>
              <div className="meal-groups">
                {groups.map((group, index) => (
                  <GroupEditor
                    canRemove={groups.length > 1}
                    group={group}
                    index={index}
                    key={group.id}
                    onChange={(next) => updateGroup(group.id, next)}
                    onRemove={() => setGroups((current) => current.filter((item) => item.id !== group.id))}
                  />
                ))}
              </div>
              <button className="add-group" onClick={() => setGroups((current) => [...current, { ...createMealGroup(), name: `Meal group ${current.length + 1}` }])} type="button">
                <Plus size={16} /> Add another meal group
              </button>
            </section>

            <div className="form-footer">
              <div className="privacy-inline"><ShieldCheck size={16} /><span>Names and shelter addresses are never part of a saved plan.</span></div>
              <div className="form-actions">
                {places && <button className="button-secondary" disabled={savedBusy || isSearchOutdated} onClick={() => void savePlan()} type="button"><ListChecks size={16} />{savedBusy ? 'Saving…' : 'Save plan'}</button>}
                <button className="button-primary search-button" disabled={busy || !address.trim()} type="submit">
                  {busy ? <LoaderCircle className="spinner" size={17} /> : <Search size={17} />}
                  {busy ? 'Searching nearby…' : 'Find nearby food'}
                </button>
              </div>
            </div>
          </form>

          {places && (
            <section className="results-section" aria-labelledby="results-heading">
              <div className="results-top">
                <div>
                  <p className="result-kicker"><span className="result-pulse" /> Search complete</p>
                  <h2 id="results-heading">Nearby options</h2>
                  <p className="results-caption">Within {radiusMiles} miles of the address you searched. Hours refer to {formatRequestedTime(mealTime)}; confirm timing, delivery, menu, and requirements with each business.</p>
                </div>
                <button className="text-button" onClick={() => {
                  setPlaces(null)
                  document.getElementById('shelter-address')?.focus()
                }} type="button">Change search</button>
              </div>

              {isSearchOutdated ? (
                <div className="stale-results-banner" role="status">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Meal needs or search details changed.</strong>
                    <span>Run the search again before using these business listings or the grocery checklist.</span>
                  </div>
                  <button className="button-primary" disabled={busy} onClick={() => void performSearch()} type="button">
                    <Search size={15} />Update search
                  </button>
                </div>
              ) : (
                <>
              <div className="results-meta">
                <span>OpenStreetMap community data</span>
                <span>
                  {dataTimestamp
                    ? `OpenStreetMap snapshot ${formatOsmSnapshot(dataTimestamp)} UTC`
                    : 'OpenStreetMap snapshot time unavailable'}
                  {searchedAt && ` · Searched ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).format(new Date(searchedAt))} San Francisco time`}
                </span>
              </div>

              <div className="result-tabs" role="tablist" aria-label="Business type">
                <button aria-selected={filter === 'restaurants'} className={filter === 'restaurants' ? 'is-active' : ''} onClick={() => setFilter('restaurants')} role="tab" type="button">
                  <Utensils size={16} /> Restaurants <span>{selectedPlaceCount}</span>
                </button>
                <button aria-selected={filter === 'groceries'} className={filter === 'groceries' ? 'is-active' : ''} onClick={() => setFilter('groceries')} role="tab" type="button">
                  <ShoppingBasket size={16} /> Grocery stores <span>{groceryPlaceCount}</span>
                </button>
              </div>

              {resultPlaces.length > 0 ? (
                <div className="place-list">
                  {resultPlaces.map((place) => <PlaceRow groups={groups} key={place.id} place={place} scheduledTime={scheduledTime} />)}
                </div>
              ) : (
                <div className="empty-results">
                  <div className="empty-results__icon">{filter === 'restaurants' ? <Utensils size={22} /> : <Store size={22} />}</div>
                  <h3>No {filter === 'restaurants' ? 'restaurant' : 'grocery store'} listings found in this radius.</h3>
                  <p>Try expanding the search area. OpenStreetMap coverage varies by neighborhood.</p>
                  {radiusMiles < 15 ? <button className="button-secondary" onClick={() => {
                    const nextRadius = Math.min(15, radiusMiles + 5)
                    setRadiusMiles(nextRadius)
                    void performSearch(nextRadius)
                  }} type="button">Expand to {Math.min(15, radiusMiles + 5)} miles and search</button> : <p className="radius-limit">The maximum 15-mile search radius is in use.</p>}
                </div>
              )}
              <p className="attribution">Map data © <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">OpenStreetMap contributors</a>. Listed hours and delivery details may be incomplete or out of date.</p>

              <section className="shopping-section" aria-labelledby="shopping-heading">
                <div className="shopping-heading">
                  <div className="section-icon"><ShoppingBasket size={17} /></div>
                  <div><h2 id="shopping-heading">Grocery fallback checklist</h2><p>Use this if restaurant options cannot cover the group.</p></div>
                </div>
                <div className="grocery-warning"><AlertTriangle size={16} /><span>Stores and inventory are not verified. This checklist counts meal units by group; confirm product labels, stock, and allergy/cross-contact information in person.</span></div>
                <div className="grocery-lines">
                  {groceryLines.map((line) => (
                    <div className={`grocery-line ${checkedLines.includes(line.id) ? 'is-checked' : ''}`} key={line.id}>
                      <label className="grocery-check">
                        <input checked={checkedLines.includes(line.id)} onChange={(event) => setCheckedLines((current) => event.target.checked ? [...current, line.id] : current.filter((id) => id !== line.id))} type="checkbox" />
                        <span className="checkmark"><Check size={13} /></span>
                      </label>
                      <div className="grocery-copy"><strong>{line.label}</strong><span>{line.detail}</span></div>
                      <label className="quantity-input"><span className="sr-only">Number of meals for {line.label}</span><input min="0" onChange={(event) => setGroceryLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: Math.max(0, Number(event.target.value)) } : item))} type="number" value={line.quantity} /><small>meals</small></label>
                    </div>
                  ))}
                  {groceryLines.length === 0 && <p className="saved-empty">Add people to meal groups to create a grocery checklist.</p>}
                </div>
                <p className="grocery-total">Total meal units to confirm <strong>{groceryLines.reduce((sum, line) => sum + line.quantity, 0)}</strong></p>
              </section>
                </>
              )}
            </section>
          )}

          <footer className="main-footer">
            <span><Globe2 size={14} /> San Francisco pilot</span>
            <span>Planning aid only. Confirm every order with the provider.</span>
            <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">Open data details <ArrowUpRight size={13} /></a>
          </footer>
        </div>
      </main>

      {sharePlan && user && (
        <Dialog onClose={() => setSharePlan(null)} title="Share this meal plan">
          <p className="dialog-intro">The plan stays private unless you add a volunteer. The shelter address is not included.</p>
          <form className="share-form" onSubmit={(event) => void addEmailShare(event)}>
            <label htmlFor="share-email">Share with an email address</label>
            <div className="share-email-row"><input id="share-email" onChange={(event) => setShareEmail(event.target.value)} placeholder="volunteer@example.org" required type="email" value={shareEmail} /><button className="button-primary" disabled={shareBusy} type="submit"><Mail size={15} />Share</button></div>
          </form>
          {sharePlan.sharedWith.length > 0 && (
            <div className="shared-list"><h3>Has access</h3>{sharePlan.sharedWith.map((email) => <div className="shared-person" key={email}><span>{email}</span><button className="text-button danger-text" onClick={() => void deleteShareEmail(email)} type="button">Remove</button></div>)}</div>
          )}
          <div className="share-link-area">
            <h3>Sign-in-required link</h3>
            <p>Anyone with the link must sign in with a verified email. You can revoke active links here.</p>
            <button className="button-secondary" disabled={shareBusy} onClick={() => void createShareLink()} type="button"><Share2 size={16} />Create and copy link</button>
            {shareLink && <div className="share-link-copy"><input aria-label="Share link" readOnly value={shareLink} /><span><Check size={14} />Copied</span></div>}
            {shareLinks.map((link) => (
              <div className="share-link-copy" key={link.id}>
                <input aria-label="Active share link" readOnly value={link.url} />
                <button className="text-button danger-text" onClick={() => void revokeLink(link.id)} type="button">Revoke</button>
              </div>
            ))}
          </div>
          <p className="dialog-footnote"><LockKeyhole size={14} /> Only share with people who need this plan.</p>
        </Dialog>
      )}
    </div>
  )
}

function UsersIcon() {
  return <span className="users-icon-glyph">2+</span>
}

function App() {
  return (
    <AuthGate>
      <Planner />
    </AuthGate>
  )
}

export default App
