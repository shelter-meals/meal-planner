# Shelter Meal Planner — Product Requirements

**Status:** Prototype implemented; Firebase setup and deployment validation pending
**Last updated:** 2026-10-08

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
- Host the app online for phone and desktop access from anywhere using Firebase Hosting. Require Firebase Authentication passwordless email sign-in via one-time link and use Cloud Firestore for saved plans and sharing. Keep application source in GitHub; do not put secrets in the client or repository.
- Include provider contact and ordering links where available; the volunteer reviews and completes the transaction outside the app.

## Safety, trust, and privacy

- Treat severe allergies and strict religious/medical requirements as constraints requiring direct provider confirmation; do not claim a recommendation is safe based only on listing or menu data.
- Distinguish verified data, third-party data, estimates, and unknowns in the interface.
- Never represent a business as open or deliverable without showing the basis and recency of that information.
- Disclose that the shelter address is sent to external geocoding/business-search providers when searching; do not include it in saved plans.
- Collect only the incident and meal information needed to prepare a plan. Do not request names or other identifying details for meal recipients in the initial release.
- Save plans with an explicit delete option, but never include the shelter address in the saved plan. Define access controls and review logs, backups, and provider/API handling so the address is not unintentionally retained.
- Keep saved plans private to their owner unless the owner explicitly shares a plan with another signed-in volunteer, either by entering the volunteer's email or creating a sign-in-required share link.
- Present the product as a volunteer planning aid; do not imply official Red Cross endorsement or integration unless authorized.
- Treat the first release as a personal prototype; organizational approval, approved vendors, and procurement requirements must be addressed before any official Red Cross deployment.

## Target acceptance criteria

- A signed-in volunteer can enter a shelter address, meal time, total headcount, and meal groups whose counts reconcile and whose combined dietary needs are explicit.
- The app returns nearby candidates with clear open/delivery status and visible uncertainty.
- A recommended order or shopping list itemizes quantities and serving assumptions and maps items to the needs they are intended to cover.
- If no single provider covers the group, the app explicitly identifies the unmet needs and offers an alternative where data permits.
- Allergy and strict-diet suitability is never presented as guaranteed without provider confirmation.
- Saved plans can be deleted and do not contain the shelter address; plans are private unless explicitly shared by email or a link requiring sign-in.
- The flow is usable on a phone-sized screen as well as a desktop browser.

## Prototype status and known gaps

The current app is a personal prototype of the intake, nearby-listing, and grocery-checklist workflow. It is not yet a complete implementation of the target acceptance criteria above.

- Nearby candidates come from user-triggered OpenStreetMap searches. Mapped hours and delivery tags are unverified; current menus, delivery availability, inventory, prices, and allergy safety are not available from this source.
- Nearby listings show eight options at a time, with a control to reveal more. Fuel stations and alcohol retailers are excluded from grocery results based on their map tags.
- Google Maps scraping is not a menu-data plan. Google Places provides place details and some food-related attributes, not a complete itemized menu. The next menu-data direction is a small pilot using menus authorized by participating restaurants, starting with research into Square Catalog access.
- The app does not generate restaurant menu orders, recommend a split order across restaurants, or identify in-stock grocery products. It shows nearby candidates and an editable count of complete meal units for grocery planning instead.
- Volunteers must verify menus, quantities, delivery, ingredients, stock, and allergy or strict-diet handling directly with providers.
- Without Firebase configuration, the app runs in local-preview mode and stores demo plans only in that browser. Online authentication, Firestore persistence, and sharing require a configured Firebase project.
- Firestore rules and sharing flows still need emulator or equivalent integration testing before deployment.
- The layout has been checked at a phone-sized viewport; broader device/browser and accessibility testing remains.

These gaps are deliberate for the free-data prototype and must not be represented as satisfied acceptance criteria.

## Confirmed product decisions

1. **Launch geography:** San Francisco, California.
2. **Access and stack:** Responsive web app on Firebase Hosting (`*.web.app`), with Firebase Authentication passwordless email sign-in for any verified email address and Cloud Firestore for saved plans/sharing. GitHub hosts the source repository.
3. **Ordering boundary:** Provide provider contact and ordering links where available; volunteers confirm and purchase outside the app. No automatic checkout.
4. **Meal groups:** Count people in groups with combined requirements to avoid double-counting overlapping needs. Initial diet options: vegetarian, vegan, gluten-free, dairy-free, halal, kosher, and pork-free. Initial allergy options: peanuts, tree nuts, milk, eggs, wheat, soy, sesame, fish, and shellfish. Support notes for other needs and distinguish allergies/strict requirements from preferences.
5. **Fallback:** When no single restaurant covers the group, offer both a split plan of up to two restaurants and a grocery/specialty-store fallback when data permits.
6. **Meal and budget:** Budget is optional (per person or total). Start with one complete meal per person and allow quantity adjustments, including for children or other portion needs.
7. **Persistence and sharing:** Save plans with explicit deletion, but never include the shelter address in a saved plan. Plans are private by default and may be shared by email or a link that requires sign-in.
8. **Prototype scope:** Personal prototype first, not an official Red Cross product or integration. Before organizational deployment, confirm authorization, approved vendors, procurement rules, and applicable data-handling requirements.
9. **Location privacy:** Disclose that the address is sent to external location/business-search services for live searches.
10. **Data-service budget:** Use free tiers only for the prototype; avoid paid services.
11. **Search area:** Start with a 5-mile radius from the shelter and allow volunteers to expand it.
12. **Authentication:** Use email-based passwordless sign-in via one-time link, not Google sign-in.
13. **Hosting and app data:** Use Firebase Hosting, Firebase Authentication, and Cloud Firestore, subject to confirming free-tier quotas and operational fit. Keep source code in GitHub; GitHub Pages is not the production host for this prototype.
14. **Account access:** Allow any verified email address to sign in; saved plans remain private unless explicitly shared.
15. **Free-data MVP scope:** Use user-triggered OpenStreetMap/Nominatim/Overpass lookups for nearby listings, subject to provider policies and attribution. Treat business details and hours as unverified; never claim delivery or allergy-safe menu coverage without evidence. Since free listings do not reliably include current menus, delivery availability, or stock, do not fabricate exact restaurant orders; provide editable quantities and clearly labeled grocery meal-category checklists instead.
16. **Menu-data direction:** Do not scrape Google Maps. Explore a small pilot of restaurant-authorized menu catalogs, beginning with Square Catalog API feasibility. A seller must authorize access; catalog items and prices still need serving-size and dietary/allergen review before they can support recommendations. Fees, backend hosting, restaurant onboarding, and data freshness remain to be confirmed.

## Deployment and later-phase decisions

- Configure a Firebase project, email-link sign-in, Firestore, and authorized domains. Validate security rules and sharing flows with the Firebase Emulator Suite or an equivalent integration test before deployment; verify free-tier quotas and email delivery limits.
- For the menu pilot, identify participating restaurants and confirm their POS/menu systems. Evaluate Square seller OAuth, the least-privilege catalog read scope, token handling, and a secure way to publish approved catalog snapshots to volunteers.
- Keep privileged API credentials off the client. If a better data provider needs a secret key or server-side integration, reassess the free-tier constraint before selecting it.
- Research providers and terms for current business hours, menus, delivery availability, prices, and store inventory in San Francisco before expanding recommendation claims.
- Define an evidence and freshness threshold for any future open, delivery, menu, price, or inventory status.
- Respect OpenStreetMap service policies, rate limits, and attribution; avoid retaining shelter addresses in plans or analytics.
- Before an official Red Cross deployment, obtain organizational authorization and review approved vendors, procurement rules, and applicable data-handling requirements.
