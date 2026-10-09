# Shelter Meal Planner

A phone-friendly meal-planning tool for shelter-response volunteers. Product scope and decisions are documented in [the PRD](./prd/PRD.md).

## Run the app locally

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```sh
cd app
npm install
npm run dev -- --host 0.0.0.0
```

Open the local URL printed by Vite on your computer. To test on a phone on the same Wi-Fi, open the network URL printed by Vite. No sign-in or Firebase app configuration is required. Plans are held only in the current page session; refresh or close the page to start over.

Run checks:

```sh
cd app
npm test
npm run lint
npm run build
```

## Live business search

Searches are initiated by the volunteer and use the OpenStreetMap Nominatim geocoder and Overpass API for nearby business listings. The exact shelter address is sent to Nominatim. The selected coordinates and search radius are sent to the Cloudflare Worker, which forwards the bounded query to Overpass and, if needed, Photon; the street address is not sent to that Worker. A session-only cache avoids repeated geocoding for the same address. The app does not save the address or search coordinates with a plan.

OpenStreetMap data may be missing or out of date. Mapped hours and delivery tags are not confirmed with a business, and listings generally do not contain current menus, ingredient/allergen details, inventory, or delivery availability. The Worker tries multiple public Overpass instances in sequence and requests only named businesses the app can display. If those are unavailable, it falls back to Photon’s radius-based OpenStreetMap search. Photon results include fewer business details and no snapshot time; its public service may also be throttled and does not guarantee availability. If nearby business data still fails, the app keeps the plan usable and shows the Grocery stores option with a location-independent shopping list: one sandwich per person (split by dietary group), plus one apple, small bag of plain chips, and bottle of water per person. The list assumes ready-to-eat food and does not identify a store or verify its stock. Volunteers must check every product label and confirm preparation cross-contact before serving anyone with dietary needs or allergies.

The app attributes OpenStreetMap contributors in the interface and uses user-triggered lookups; respect the usage terms of [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) and [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API).

## Suggested restaurant orders

Restaurant recommendations are suggested order ideas based on the OpenStreetMap business name, cuisine, and description when available. Restaurant cards link to a mapped DoorDash order page, restaurant order page, or menu page when one is listed; otherwise they offer a web search restricted to DoorDash store listings and the mapped restaurant website when available. Search results and OpenStreetMap links are not verified as current or location-matched. Confirm the restaurant, ordering availability, items, portions, dietary needs, allergens, and cross-contact directly before ordering.

Nearby business search uses a Cloudflare Worker. For local development, start these in separate terminals from `app/`:

```sh
npm run worker:dev
npm run dev -- --host 0.0.0.0
```

For deployment, keep the Cloudflare account on the **Workers Free** plan and do not enable billing or upgrade. Deploy the Worker from `app/`, allowing only the Firebase Hosting origin:

```sh
npm run worker:deploy -- --var ALLOWED_ORIGINS:https://YOUR_FIREBASE_PROJECT.web.app
```

Set `VITE_NEARBY_API_URL` in `app/.env.local` to the deployed Worker URL ending in `/api/nearby-food`, then rebuild and deploy Firebase Hosting. The Worker has no database binding, does not persist search results, and does not inherit app `.env.local` credentials. If a free quota is reached, nearby search stops.

The Worker is a public prototype endpoint, not an authenticated API; its exact-origin CORS check is not authentication. Keep it on the Free plan (so limits stop work rather than create charges), and add real request authentication or rate limiting before broader operational use.

## Privacy

The app does not require sign-in and does not save plans. Meal details remain in memory for the current page session and are lost when the page is refreshed or closed. The planner does not store the shelter address; the address is sent to Nominatim for geocoding. Firebase is used to host the website only. The Cloudflare Worker handles nearby searches; restaurant suggestions are generated in the app from mapped business details.
