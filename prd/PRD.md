# Shelter Meal Planner — Product Requirements

**Status:** Prototype deployed; plans are saved locally in each browser profile
**Last updated:** 2026-10-09

## Product summary

Shelter Meal Planner helps Red Cross volunteers quickly plan food for households displaced by a large, multi-family fire. A volunteer enters the shelter address, the number of people to feed, and each person's dietary needs. The app finds nearby food options that appear open and able to deliver, recommends a practical order with quantities, and offers a grocery-store fallback when a restaurant cannot cover the group.

The app is a planning aid, not an ordering service or a guarantee that a business is open, has inventory, can deliver, or can safely accommodate an allergy or other dietary requirement. Volunteers must confirm critical details directly with the provider before purchasing.

## Problem

After a fire, volunteers may need to arrange meals at unusual hours, including overnight. They have limited time to identify open, deliverable businesses, account for varied diets, and translate headcounts into a complete order. If one provider cannot cover everyone, volunteers need a clear alternative rather than an incomplete recommendation.

## Users and context

- **Primary user:** A Red Cross volunteer coordinating meals for people at a temporary shelter.
- **Operating context:** Time-sensitive, potentially overnight, on a phone or web browser; users may have limited time and incomplete information.
- **Beneficiaries:** Individuals and families with different meal preferences, religious practices, medical diets, or allergies.

## Goals

1. Turn a shelter location and headcount into actionable nearby food options.
2. Prefer one deliverable restaurant that can cover the whole group and the stated needs.
3. When that is not feasible, clearly explain the gap and offer a workable split order or nearby grocery-store plan.
4. Show item and serving quantities that a volunteer can review and use when calling or placing an order.
5. Make uncertainty visible, especially around current hours, delivery, stock, ingredients, and cross-contact.

## Non-goals for the initial release

- Placing or paying for orders automatically.
- Guaranteeing an establishment's real-time hours, delivery radius, inventory, ingredients, or allergy safety.
- Replacing Red Cross shelter, procurement, reimbursement, or incident-management procedures.
- Treating a dietary label (for example, "vegetarian" or "halal") as proof that a specific item meets a person's needs.

## Proposed volunteer workflow

1. Start a meal search and enter the shelter delivery address.
2. Enter the number of people and meal timing (for example, now or a scheduled time).
3. Group people into meal profiles with a count for each profile and its combined dietary needs (for example, four vegetarian + gluten-free meals); identify allergies and any strict requirements separately from preferences.
4. Review nearby candidate restaurants, including how current their open/delivery information is and which needs they may or may not meet.
5. Review a proposed itemized order with quantities, serving assumptions, estimated cost when available, and uncovered needs.
6. If no restaurant can cover the group, review a split-restaurant option and/or grocery fallback with a shopping list and quantities.
7. Confirm availability, ingredients, delivery, and any allergy or strict-diet accommodations directly with the provider; then use the order plan outside the app.

## Functional requirements

### Incident and meal needs

- Accept a street address and resolve it to a location before searching.
- Accept a meal time and a total headcount.
- Let the volunteer create meal groups, each with a headcount and any combination of relevant dietary needs; meal-group counts must reconcile with the total headcount or show an explicit review warning. Initial categories: vegetarian, vegan, gluten-free, dairy-free, halal, kosher, and pork-free. Volunteers can add notes for other needs.
- Capture allergies separately from dietary preferences, with initial options for peanuts, tree nuts, milk, eggs, wheat, soy, sesame, fish, and shellfish, plus notes for other allergies. Let volunteers distinguish strict requirements from preferences. Do not infer that an item is safe from a cuisine, menu label, or third-party listing alone.
- Allow the volunteer to edit the plan and rerun the search as headcounts or circumstances change.

### Nearby options

- Find nearby restaurants and, when useful, grocery stores or specialty food stores from live OpenStreetMap data.
- Prefer candidates with mapped opening hours that indicate they are open at the requested time. Treat mapped hours as unverified and do not claim delivery unless explicitly supported by listing data.
- Display the source and freshness of business, hours, distance, menu, and delivery information when available. Mark unknown or unverified details instead of presenting them as facts.
- Explain which needs a candidate appears to cover, which remain uncertain, and which it cannot cover.
- Rank a single-provider option above multiple providers only when it can cover the group's needs without hiding dietary gaps or material uncertainty.

### Order and shopping recommendations

- Provide an itemized recommendation with item name, quantity, intended servings, and which group needs it covers when verified menu/catalog information exists. Do not invent restaurant menu items.
- Assume one complete meal per person; make serving-size assumptions and any substitutions visible, and let volunteers adjust quantities (including for children or other portion needs).
- Show uncovered meals and dietary needs prominently; do not silently count an unverified meal as suitable.
- If no one restaurant is suitable, offer a clearly labeled split-provider plan of up to two restaurants and a grocery fallback when data permits; show the tradeoffs so the volunteer can choose.
- A grocery fallback should identify a nearby store and produce a practical, editable meal-category shopping checklist with quantities when exact inventory/catalog information is unavailable; do not imply that a store has a particular item in stock.
- Show price or total estimates only when supported by available data, and label estimates as estimates.
- Let volunteers optionally set a total or per-person budget and prioritize recommendations within it when price data is available.
- Provide a concise provider-confirmation checklist for delivery, timing, ingredients, and strict requirements.

### Device access

- Provide a usable experience in a desktop browser and on a phone.
- Host the app online for phone and desktop access from anywhere using Firebase Hosting. Do not require sign-in. Save plans in browser-local storage so they persist within the current browser profile without syncing or sharing across devices. Keep application source in GitHub; do not put secrets in the client or repository.
- Include provider contact and ordering links where available; the volunteer reviews and completes the transaction outside the app.

## Safety, trust, and privacy

- Treat severe allergies and strict religious/medical requirements as constraints requiring direct provider confirmation; do not claim a recommendation is safe based only on listing or menu data.
- Distinguish verified data, third-party data, estimates, and unknowns in the interface.
- Never represent a business as open or deliverable without showing the basis and recency of that information.
- Disclose that the shelter address is sent to the OpenStreetMap geocoder when searching, and that the resulting coordinates and radius pass through the Cloudflare Worker to the OpenStreetMap business-search service; do not include the address or coordinates in saved plans.
- Collect only the incident and meal information needed to prepare a plan. Do not request names or other identifying details for meal recipients in the initial release.
- Save plans with an explicit delete option in the current browser's local storage, but never include the shelter address in the saved plan. Explain that plans are accessible to anyone using that browser profile and are not backed up or synced.
- Make clear that anyone using the current browser profile can access its saved plans; do not upload or sync those plans to a cloud service.
- Present the product as a volunteer planning aid; do not imply official Red Cross endorsement or integration unless authorized.
- Treat the first release as a personal prototype; organizational approval, approved vendors, and procurement requirements must be addressed before any official Red Cross deployment.

## Target acceptance criteria

- A volunteer can enter a shelter address, meal time, total headcount, and meal groups whose counts reconcile and whose combined dietary needs are explicit without signing in.
- The app returns nearby candidates with clear open/delivery status and visible uncertainty.
- A recommended order or shopping list itemizes quantities and serving assumptions and maps items to the needs they are intended to cover.
- If no single provider covers the group, the app explicitly identifies the unmet needs and offers an alternative where data permits.
- Allergy and strict-diet suitability is never presented as guaranteed without provider confirmation.
- Saved plans persist in the current browser profile, can be deleted, and do not contain the shelter address. They do not sync or share across devices.
- The flow is usable on a phone-sized screen as well as a desktop browser.

## Prototype status and known gaps

The current app is a personal prototype of the intake, nearby-listing, and grocery-checklist workflow. It is not yet a complete implementation of the target acceptance criteria above.

- Nearby candidates come from user-triggered OpenStreetMap searches. Mapped hours and delivery tags are unverified; current menus, delivery availability, inventory, prices, and allergy safety are not available from this source.
- Nearby listings show eight options at a time, with a control to reveal more. Fuel stations and alcohol retailers are excluded from grocery results based on their map tags.
- Google Maps scraping is not a menu-data plan. Google Places provides place details and some food-related attributes, not a complete itemized menu. Spoonacular was tested as a possible chain-menu source; authorized restaurant catalogs remain the more trustworthy pilot direction, with Square Catalog access to be explored.
- A live Spoonacular free-plan smoke test (2026-10-08) found some chain menu-item coverage, but not dependable location-specific order data: Panera soup, Taco Bell Crunchwrap, Subway turkey sandwich, and In-N-Out Double-Double searches returned chain-labeled items; a Big Mac query returned unrelated "Big Mac and Cheese" results, and a Chipotle burrito-bowl query returned unrelated restaurants. Supplying a `restaurantChain` parameter did not filter the chicken search results.
- The tested Spoonacular menu search records expose item title, chain label, serving number/unit, image, and ID; the tested Panera item-detail response included nutrition but a null price and no ingredient list. It does not establish current local menu availability, allergen safety, or location matching. Observed test calls used about 1.0–1.1 free quota points each; one response showed 36.5 of 50 daily points remaining before the final two detail checks.
- Spoonacular's terms limit caching user-requested data to at most one hour with prior written permission and prohibit storing most returned data. Treat results as transient; do not save them into plans without confirming written permission and an allowed data-use pattern.
- Google Places may provide business identity, location, business status, hours, and website/Maps links, but its documented place fields are not a full itemized menu. Combining Places results with OpenStreetMap or third-party menu records requires careful matching, Google's attribution/display rules, and a terms review. Do not treat a name-only match as confirmation that a menu belongs to a specific nearby location.
- The app does not generate restaurant menu orders, recommend a split order across restaurants, or identify in-stock grocery products. It shows nearby candidates and an editable count of complete meal units for grocery planning instead.
- Volunteers must verify menus, quantities, delivery, ingredients, stock, and allergy or strict-diet handling directly with providers.
- Saved plans are stored in browser-local storage and are available to anyone using the same browser profile. They are not backed up or synchronized.
- Plans saved to the former signed-in Firestore workflow are not automatically copied into browser-local storage.
- The layout has been checked at a phone-sized viewport; broader device/browser and accessibility testing remains.

These gaps are deliberate for the free-data prototype and must not be represented as satisfied acceptance criteria.

## Confirmed product decisions

1. **Launch geography:** San Francisco, California.
2. **Access and stack:** Responsive web app on Firebase Hosting (`*.web.app`) with no sign-in. Saved plans stay in local browser storage and are not shared or synced. GitHub hosts the source repository.
3. **Ordering boundary:** Provide provider contact and ordering links where available; volunteers confirm and purchase outside the app. No automatic checkout.
4. **Meal groups:** Count people in groups with combined requirements to avoid double-counting overlapping needs. Initial diet options: vegetarian, vegan, gluten-free, dairy-free, halal, kosher, and pork-free. Initial allergy options: peanuts, tree nuts, milk, eggs, wheat, soy, sesame, fish, and shellfish. Support notes for other needs and distinguish allergies/strict requirements from preferences.
5. **Fallback:** When no single restaurant covers the group, offer both a split plan of up to two restaurants and a grocery/specialty-store fallback when data permits.
6. **Meal and budget:** Budget is optional (per person or total). Start with one complete meal per person and allow quantity adjustments, including for children or other portion needs.
7. **Persistence:** Save plans in the current browser's local storage with explicit deletion, but never include the shelter address in a saved plan. Plans persist across browser restarts in that browser profile and do not sync or share.
8. **Prototype scope:** Personal prototype first, not an official Red Cross product or integration. Before organizational deployment, confirm authorization, approved vendors, procurement rules, and applicable data-handling requirements.
9. **Location privacy:** Disclose that the address is sent to external location/business-search services for live searches.
10. **Data-service budget:** Use free tiers only for the prototype; avoid paid services.
11. **Search area:** Start with a 5-mile radius from the shelter and allow volunteers to expand it.
12. **Authentication:** Do not require an account or sign-in for the prototype.
13. **Hosting and app data:** Use Firebase Hosting for the website. Keep saved plans in local browser storage rather than Firebase Authentication or Cloud Firestore. Keep source code in GitHub; GitHub Pages is not the production host for this prototype.
14. **Local access:** Plans are available to anyone using the same browser profile and are not shared across devices.
15. **Free-data MVP scope:** Use user-triggered OpenStreetMap/Nominatim/Overpass lookups for nearby listings, subject to provider policies and attribution. Treat business details and hours as unverified; never claim delivery or allergy-safe menu coverage without evidence. Since free listings do not reliably include current menus, delivery availability, or stock, do not fabricate exact restaurant orders; provide editable quantities and clearly labeled grocery meal-category checklists instead.
16. **Menu-data direction:** Do not scrape Google Maps. Spoonacular has some chain menu-item coverage, but its search can return unrelated items/restaurants, lacks dependable location matching, and the tested details lacked prices and ingredient lists. Google Places can supplement business details but is not a full menu feed. The prototype checks up to five top-ranked OpenStreetMap listings' mapped website URLs with a separately deployed Cloudflare Worker. It respects the listed site's `robots.txt`, stays on HTTPS and the same host (including its `www` equivalent), and reads a homepage plus up to three bounded same-site menu pages. It extracts published Schema.org `MenuItem` data and heuristically identifies likely item names, descriptions, and prices in visible HTML text; it does not read hidden app data, parse PDFs, or follow third-party ordering links. Visible-text matches are unverified and may be incomplete, so the interface identifies them and links to the source for confirmation. Menu results are transient and are not saved. Draft one-item-per-person quantities are offered only for likely main-course items; dietary suitability requires an explicit published label for every selected diet. Missing data is never treated as a match, and allergy/cross-contact safety always requires direct provider confirmation. Quantity and item selection remain editable, with assumptions shown. The Worker receives only OpenStreetMap listing IDs and mapped website URLs, not business names, shelter addresses, or group needs. Keep it on Cloudflare Workers Free with billing disabled; quota exhaustion must stop menu checks without enabling paid usage. This constrained public-menu scan is a discovery aid, not a replacement for confirming vendor authorization, menu currency, serving size, ingredients, procurement requirements, or delivery with the provider.

## Deployment and later-phase decisions

- Deploy the menu Worker separately from Firebase Hosting. Configure its exact allowed app origin and `VITE_MENU_API_URL`; do not enable Cloudflare billing, upgrade from Workers Free, or add a storage binding. The Worker has strict per-request site/page/size/time limits and returns `Cache-Control: no-store`. It is currently an unauthenticated public prototype endpoint; CORS is not authentication, so add authentication or effective rate limiting before broader operational use.
- The Worker fetches only mapped website URLs, but OpenStreetMap does not guarantee those URLs are official or current. Before production use, review the target sites' terms as well as `robots.txt`; the app does not claim that robots permission alone grants reuse rights.
- Firebase is used for static hosting only. Authentication and Firestore are not required by the app's local-only plan workflow.
- For the menu pilot, identify participating restaurants and confirm their POS/menu systems. Evaluate Square seller OAuth, the least-privilege catalog read scope, token handling, and a secure way to publish approved catalog snapshots to volunteers.
- Before any Spoonacular integration, get written clarification on whether its one-hour caching allowance applies to this user-facing menu-planning use case; prevent menu API results from being saved with plans.
- Before using Places API results alongside other map or menu sources, review current Google Maps Platform terms, required Google branding/attribution, permitted display context, and non-Google map restrictions; set strict usage caps that cannot incur charges.
- Keep privileged API credentials off the client. If a better data provider needs a secret key or server-side integration, reassess the free-tier constraint before selecting it.
- Research providers and terms for current business hours, menus, delivery availability, prices, and store inventory in San Francisco before expanding recommendation claims.
- Define an evidence and freshness threshold for any future open, delivery, menu, price, or inventory status.
- Respect OpenStreetMap service policies, rate limits, and attribution; avoid retaining shelter addresses in plans or analytics.
- Before an official Red Cross deployment, obtain organizational authorization and review approved vendors, procurement rules, and applicable data-handling requirements.
