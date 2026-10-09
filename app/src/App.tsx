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
  MapPin,
  Plus,
  Search,
  ShoppingBasket,
  Store,
  Trash2,
  Utensils,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  ALLERGENS,
  createGroceryLines,
  createMealGroup,
  createScheduleDate,
  defaultMealTime,
  DIETARY_NEEDS,
  isValidMealPlan,
  totalPeople,
  type Allergen,
  type DietaryNeed,
  type FoodPlace,
  type GroceryLine,
  type MealGroup,
} from './domain'
import { createFallbackOrderLines } from './menuData'
import { getRestaurantLinks } from './restaurantLinks'
import {
  getAvailabilityRank,
  getDeliveryStatus,
  getHoursState,
  searchFoodPlaces,
  type HoursState,
} from './services/openMap'
import './App.css'

type ResultFilter = 'restaurants' | 'groceries'
const PLACE_PAGE_SIZE = 8

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
  const phone = place.tags.phone ?? place.tags['contact:phone']
  const restaurantLinks = getRestaurantLinks(place)
  const suggestedOrderLines = createFallbackOrderLines(groups, place)

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
          {(hours === 'open' || delivery === 'listed') && (
            <div className="place-statuses">
              {hours === 'open' && <MapStatus state={hours} />}
              {delivery === 'listed' && (
                <span className="status-pill delivery-listed">
                  <Check size={14} /> Delivery listed
                </span>
              )}
            </div>
          )}
          {(phone || restaurantLinks.length > 0) && (
            <div className="place-contact">
              {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}><span>Call</span> {phone}</a>}
              {restaurantLinks.map((link) => (
                <a href={link.href} key={link.href} rel="noreferrer" target="_blank">
                  {link.label} <ExternalLink size={13} />
                </a>
              ))}
            </div>
          )}
          {place.category === 'restaurant' && (
            <section aria-label={`Suggested order for ${place.name}`} className="menu-evidence">
              <div className="menu-evidence__heading">
                <ListChecks aria-hidden="true" size={16} />
                <strong>Suggested order</strong>
              </div>
              <div className="suggested-order-lines">
                <ul>
                  {suggestedOrderLines.map((line) => (
                    <li key={line.id}>
                      <span>{line.label}</span>
                      <strong>{line.quantity} {line.unit}</strong>
                      <small>{line.detail}</small>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          <a className="place-map-link" href={osmLink(place)} rel="noreferrer" target="_blank">
            View OpenStreetMap listing <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </article>
  )
}

function rankFoodPlaces(places: FoodPlace[], scheduledTime: Date | null): FoodPlace[] {
  return [...places].sort((a, b) =>
    getAvailabilityRank(a.tags, scheduledTime) - getAvailabilityRank(b.tags, scheduledTime)
      || a.distanceMiles - b.distanceMiles,
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
  const [countFocused, setCountFocused] = useState(false)
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
            onFocus={() => setCountFocused(true)}
            onBlur={() => setCountFocused(false)}
            type="number"
            value={group.count === 0 && countFocused ? '' : group.count}
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

function Planner() {
  const [address, setAddress] = useState('')
  const [mealTime, setMealTime] = useState(() => defaultMealTime())
  const [groups, setGroups] = useState<MealGroup[]>([{ ...createMealGroup('group-one'), name: 'Meal group 1' }])
  const [budgetText, setBudgetText] = useState('')
  const [radiusMiles, setRadiusMiles] = useState(5)
  const [busy, setBusy] = useState(false)
  const [places, setPlaces] = useState<FoodPlace[] | null>(null)
  const [searchedAt, setSearchedAt] = useState<string | null>(null)
  const [dataTimestamp, setDataTimestamp] = useState<string | null>(null)
  const [nearbyDataSource, setNearbyDataSource] = useState<'overpass' | 'photon' | null>(null)
  const [searchedFingerprint, setSearchedFingerprint] = useState<string | null>(null)
  const [nearbySearchError, setNearbySearchError] = useState('')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<ResultFilter>('restaurants')
  const [visiblePlaceCount, setVisiblePlaceCount] = useState(PLACE_PAGE_SIZE)
  const [groceryLines, setGroceryLines] = useState<GroceryLine[]>([])
  const resultsRef = useRef<HTMLElement | null>(null)

  const people = useMemo(() => totalPeople(groups), [groups])
  const scheduledTime = useMemo(() => createScheduleDate(mealTime), [mealTime])
  const parsedBudget = budgetText.trim() ? Number(budgetText) : null
  const validBudget = parsedBudget === null || (Number.isFinite(parsedBudget) && parsedBudget >= 0)
  const searchFingerprint = JSON.stringify({ address, mealTime, radiusMiles, groups })
  const isSearchOutdated = Boolean(places && searchedFingerprint !== searchFingerprint)
  const resultPlaces = useMemo(() => {
    if (!places) return []
    const category = filter === 'restaurants' ? 'restaurant' : 'grocery'
    return rankFoodPlaces(places.filter((place) => place.category === category), scheduledTime)
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
    if (!places) return
    resultsRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [places])

  function updateGroup(id: string, next: MealGroup) {
    setGroups((current) => current.map((group) => group.id === id ? next : group))
  }

  async function performSearch(searchRadius = radiusMiles) {
    setError('')
    setVisiblePlaceCount(PLACE_PAGE_SIZE)
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
    setNearbyDataSource(null)
    setNearbySearchError('')
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
      setNearbyDataSource(result.dataSource)
      setNearbySearchError(result.nearbyError ?? '')
      setSearchedFingerprint(requestFingerprint)
      setGroceryLines(createGroceryLines(requestGroups))
      setFilter('restaurants')
    } catch (searchError) {
      setNearbySearchError('')
      setError(messageFrom(searchError))
    } finally {
      setBusy(false)
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await performSearch()
  }

  return (
    <div className="workspace">
      <aside className="side-rail">
        <a className="brand-lockup" href="/" aria-label="Shelter Meal Planner home">
          <span className="brand-mark">SM</span>
          <span className="brand-name">Shelter Meal<br />Planner</span>
        </a>
        <div className="rail-section">
          <p className="rail-heading">Meal planning</p>
          <button className="rail-action is-current" type="button" onClick={() => {
            setPlaces(null)
            setError('')
            scrollToTop()
          }}>
            <Plus size={16} /> Start a new search
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="mobile-header">
          <a className="brand-lockup" href="/" aria-label="Shelter Meal Planner home">
            <span className="brand-mark">SM</span><span className="brand-name">Shelter Meal Planner</span>
          </a>
          <span className="pilot-badge">San Francisco</span>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <p className="location-line"><MapPin size={15} /> SAN FRANCISCO, CALIFORNIA</p>
              <h1>Plan the next meal.</h1>
              <p className="page-subtitle">One address, a few needs, and a clear plan for the people waiting.</p>
            </div>
            <div className="connection-state">
              <span className="connection-dot" />
              Ready to plan
            </div>
          </div>

          {error && <div className="error-banner" role="alert"><AlertTriangle size={17} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')} type="button"><X size={15} /></button></div>}

          <form className="planning-form" onSubmit={(event) => void search(event)}>
            <section className="location-section" aria-labelledby="location-heading">
              <div className="section-heading">
                <span className="section-icon"><MapPin size={17} /></span>
                <div><h2 id="location-heading">Where should food go?</h2><p>We send the address to OpenStreetMap to find nearby businesses; the planner does not store it.</p></div>
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
                <small className="budget-note">Price data is unavailable.</small>
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
              <div className="form-actions">
                <button className="button-primary search-button" disabled={busy || !address.trim()} type="submit">
                  {busy ? <LoaderCircle className="spinner" size={17} /> : <Search size={17} />}
                  {busy ? 'Searching nearby…' : 'Find nearby food'}
                </button>
              </div>
            </div>
          </form>

          {places && (
            <section className="results-section" aria-labelledby="results-heading" ref={resultsRef}>
              <div className="results-top">
                <div>
                  <p className={`result-kicker ${nearbySearchError ? 'result-kicker--warning' : ''}`}><span className="result-pulse" /> {nearbySearchError ? 'Business listings unavailable' : 'Search complete'}</p>
                  <h2 id="results-heading">Nearby options</h2>
                  <p className="results-caption">{nearbySearchError ? filter === 'groceries' ? 'Use the shopping list below at any grocery store. Store locations and stock could not be checked.' : 'Select Grocery stores for a ready-to-eat shopping list. Store locations and stock could not be checked.' : `Within ${radiusMiles} miles of the address you searched. Hours refer to ${formatRequestedTime(mealTime)}; confirm timing, delivery, menu, and requirements with each business.`}</p>
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
                    <span>Run the search again before using these business listings or the grocery list.</span>
                  </div>
                  <button className="button-primary" disabled={busy} onClick={() => void performSearch()} type="button">
                    <Search size={15} />Update search
                  </button>
                </div>
              ) : (
                <>
              {nearbySearchError && (
                <div className="nearby-error-banner" role="status">
                  <AlertTriangle size={17} />
                  <span>{nearbySearchError}</span>
                  <a href="#shopping-heading" onClick={() => setFilter('groceries')}>Go to grocery list</a>
                </div>
              )}
              <div className="results-meta">
                <span>{nearbyDataSource === 'photon' ? 'OpenStreetMap data via Photon' : 'OpenStreetMap community data'}</span>
                <span>
                  {nearbySearchError
                    ? 'Live business locations are unavailable'
                  : nearbyDataSource === 'photon'
                    ? 'OpenStreetMap data via Photon; snapshot time unavailable'
                    : dataTimestamp
                      ? `OpenStreetMap snapshot ${formatOsmSnapshot(dataTimestamp)} UTC`
                      : 'OpenStreetMap snapshot time unavailable'}
                  {!nearbySearchError && searchedAt && ` · Searched ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).format(new Date(searchedAt))} San Francisco time`}
                </span>
              </div>

              <div className="result-tabs" role="tablist" aria-label="Business type">
                <button aria-selected={filter === 'restaurants'} className={filter === 'restaurants' ? 'is-active' : ''} onClick={() => {
                  setFilter('restaurants')
                  setVisiblePlaceCount(PLACE_PAGE_SIZE)
                }} role="tab" type="button">
                  <Utensils size={16} /> Restaurants <span>{selectedPlaceCount}</span>
                </button>
                <button aria-selected={filter === 'groceries'} className={filter === 'groceries' ? 'is-active' : ''} onClick={() => {
                  setFilter('groceries')
                  setVisiblePlaceCount(PLACE_PAGE_SIZE)
                }} role="tab" type="button">
                  <ShoppingBasket size={16} /> Grocery stores <span>{nearbySearchError ? '—' : groceryPlaceCount}</span>
                </button>
              </div>

              {filter === 'groceries' && (
                <section className="shopping-section" aria-labelledby="shopping-heading">
                  <div className="shopping-heading">
                    <div className="section-icon"><ShoppingBasket size={17} /></div>
                    <div><h2 id="shopping-heading">Grocery shopping list</h2><p>Ready-to-eat items for {people} {people === 1 ? 'person' : 'people'}; no kitchen needed.</p></div>
                  </div>
                  <p className="grocery-warning">Store locations and stock are not verified. Check ingredient labels and ask about cross-contact for dietary needs.</p>
                  <div className="suggested-order-lines">
                    {groceryLines.length > 0 ? (
                      <ul>
                        {groceryLines.map((line) => (
                          <li key={line.id}>
                            <span>{line.label}</span>
                            <strong>{line.quantity} {line.unit}</strong>
                            <small>{line.detail}</small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty-grocery-list">Add people to meal groups to create a grocery list.</p>
                    )}
                  </div>
                </section>
              )}

              {resultPlaces.length > 0 ? (
                <>
                  <div aria-live="polite" className="place-list">
                    {resultPlaces.slice(0, visiblePlaceCount).map((place) => (
                      <PlaceRow
                        groups={groups}
                        key={place.id}
                        place={place}
                        scheduledTime={scheduledTime}
                      />
                    ))}
                  </div>
                  {visiblePlaceCount < resultPlaces.length && (
                    <button className="button-secondary show-more-places" onClick={() => setVisiblePlaceCount((count) => count + PLACE_PAGE_SIZE)} type="button">
                      Show {Math.min(PLACE_PAGE_SIZE, resultPlaces.length - visiblePlaceCount)} more
                      <span>{resultPlaces.length - visiblePlaceCount} remaining</span>
                    </button>
                  )}
                </>
              ) : (
                <div className="empty-results">
                  <div className="empty-results__icon">{filter === 'restaurants' ? <Utensils size={22} /> : <Store size={22} />}</div>
                  <h3>{nearbySearchError ? 'Business locations could not be loaded.' : `No ${filter === 'restaurants' ? 'restaurant' : 'grocery store'} listings found in this radius.`}</h3>
                  <p>{nearbySearchError ? 'You can still buy the ready-to-eat items in the Grocery stores tab at any grocery store.' : 'Try expanding the search area. OpenStreetMap coverage varies by neighborhood.'}</p>
                  {nearbySearchError
                    ? <a className="button-secondary" href="#shopping-heading" onClick={() => setFilter('groceries')}>Use the grocery list</a>
                    : radiusMiles < 15 ? <button className="button-secondary" onClick={() => {
                    const nextRadius = Math.min(15, radiusMiles + 5)
                    setRadiusMiles(nextRadius)
                    void performSearch(nextRadius)
                  }} type="button">Expand to {Math.min(15, radiusMiles + 5)} miles and search</button> : <p className="radius-limit">The maximum 15-mile search radius is in use.</p>}
                </div>
              )}
              {!nearbySearchError && <p className="attribution">Map data © <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">OpenStreetMap contributors</a>. Listed hours and delivery details may be incomplete or out of date.</p>}
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

    </div>
  )
}

function UsersIcon() {
  return <span className="users-icon-glyph">2+</span>
}

function App() {
  return <Planner />
}

export default App
