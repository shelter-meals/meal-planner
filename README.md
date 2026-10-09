# Shelter Meal Planner

A phone-friendly meal-planning tool for shelter-response volunteers. Product scope and decisions are documented in [the PRD](./prd/PRD.md).

## Run the app locally

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```sh
cd app
npm install
npm run dev -- --host 0.0.0.0
```

Open the local URL printed by Vite on your computer. To test on a phone on the same Wi-Fi, open the network URL printed by Vite. No sign-in or Firebase app configuration is required. Plans are saved in the browser's local storage and stay in that browser profile; they do not sync to another device or browser.

Run checks:

```sh
cd app
npm test
npm run lint
npm run build
```

## Live business search

Searches are initiated by the volunteer and use the OpenStreetMap Nominatim geocoder and Overpass API for nearby business listings. The exact shelter address is sent to Nominatim. The selected coordinates and search radius are sent to the Cloudflare Worker, which forwards the bounded query to Overpass; the street address is not sent to that Worker. A session-only cache avoids repeated geocoding for the same address. The app does not save the address or search coordinates with a plan.

OpenStreetMap data may be missing or out of date. Mapped hours and delivery tags are not confirmed with a business, and listings generally do not contain current menus, ingredient/allergen details, inventory, or delivery availability. The app displays those gaps and generates an editable count of complete meals per dietary group for grocery planning. Volunteers must confirm food, ingredients, stock, and delivery with providers.

The app attributes OpenStreetMap contributors in the interface and uses user-triggered lookups; respect the usage terms of [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) and [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API).

## Published menu checks

After a restaurant search, the menu service checks at most five of the highest-ranked listings, using only the website URL present in that OpenStreetMap listing. The service checks `robots.txt`, stays on HTTPS and the listed site's host (including its `www` equivalent), fetches a homepage and up to three same-site menu pages, caps each page at 1 MB, and stops an individual fetch after four seconds. It extracts Schema.org `MenuItem` data and looks for likely item names, descriptions, and prices in visible text on the business site. Visible-text matches are heuristic and may be incomplete; volunteers should confirm current availability, prices, portions, and dietary details. The scanner does not scrape Google Maps, read hidden app data, parse PDFs, or follow third-party ordering links. If the site disallows automated access or no menu can be read, the app links volunteers to the business website or phone contact.

Extracted items are shown with their source and retrieval time, held only in the current page session, and are not saved with meal plans or sent to Firebase. The Worker receives only OpenStreetMap listing IDs and mapped website URLs, not business names, the shelter address, group counts, or dietary needs. The app can draft one likely main-course item per person only when a matching item is explicitly labeled for every selected dietary need. If evidence is missing, volunteers can review the listed items and choose only after contacting the provider. Suggestions follow the menu's listed order, not popularity or availability. Allergens and cross-contact are never inferred safe. Draft quantities assume one menu item per person and remain editable; prices and serving sizes must be confirmed.

Nearby business search and published-menu checks use the same Cloudflare Worker. For local development, start these in separate terminals from `app/`:

```sh
npm run menu:dev
npm run dev -- --host 0.0.0.0
```

For deployment, keep the Cloudflare account on the **Workers Free** plan and do not enable billing or upgrade. Deploy the Worker from `app/`, allowing only the Firebase Hosting origin:

```sh
npm run menu:deploy -- --var ALLOWED_ORIGINS:https://YOUR_FIREBASE_PROJECT.web.app
```

Set `VITE_NEARBY_API_URL` in `app/.env.local` to the deployed Worker URL ending in `/api/nearby-food` and `VITE_MENU_API_URL` to the same Worker URL ending in `/api/menu-discovery`, then rebuild and deploy Firebase Hosting. The Worker has no database binding, does not persist search or menu results, and does not inherit app `.env.local` credentials. If a free quota is reached, nearby search or menu checks stop.

The Worker is a public prototype endpoint, not an authenticated API; its exact-origin CORS check is not authentication. Keep it on the Free plan (so limits stop work rather than create charges), and add real request authentication or rate limiting before broader operational use.

## Saved plans and privacy

The app does not require sign-in. Saved plans are stored in the current browser profile's local storage. They remain available in that browser after closing and reopening it, but are not uploaded, synchronized, or shared with other devices. Anyone using the same browser profile can see them. Plans previously saved to Firestore are not imported. Clearing this site's browser storage removes locally saved plans.

Saved plans include meal groups, meal time, budget, and search radius, but never the shelter address, search coordinates, business listings, or menu results. Enter the address again when reopening a saved plan to run a new search.

Firebase is used to host the website only. Firebase Authentication and Cloud Firestore are not needed for planner use. The Cloudflare Worker still handles nearby searches and published-menu checks as described above.
