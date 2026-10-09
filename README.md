# Shelter Meal Planner

A phone-friendly meal-planning tool for shelter-response volunteers. Product scope and decisions are documented in [the PRD](./prd/PRD.md).

## Run the app locally

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```sh
cd app
npm install
npm run dev -- --host 0.0.0.0
```

Open the local URL printed by Vite on your computer. To test on a phone on the same Wi-Fi, open the network URL printed by Vite. Without Firebase settings, development mode is a local preview: plans stay in that browser and cannot be shared.

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

After a restaurant search, the menu service checks at most five of the highest-ranked listings, using only the website URL present in that OpenStreetMap listing. The service checks `robots.txt`, stays on HTTPS and the listed site's host (including its `www` equivalent), fetches at most a homepage and one same-site menu page, caps each page at 250 KB, and stops an individual fetch after four seconds. It extracts only `MenuItem` data published as Schema.org JSON-LD; it does not scrape Google Maps, read hidden app data, parse PDFs, or follow third-party ordering links.

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

## Configure Firebase

1. Create a Firebase project and register a web app.
2. Copy `app/.env.example` to `app/.env.local` and fill in the web app config values from Firebase Project settings.
3. Enable **Authentication → Email/Password → Email link (passwordless sign-in)**. Add the Firebase Hosting domain to authorized domains.
4. Create a Cloud Firestore database.
5. From `app/`, connect the Firebase CLI to your project and deploy the Hosting site and Firestore rules/indexes:

   ```sh
   npm run build
   npx firebase-tools login
   npx firebase-tools use --add
   npx firebase-tools deploy --only hosting,firestore:rules,firestore:indexes
   ```

6. In Firebase Hosting, use the project's `*.web.app` URL. Authenticated users can save plans, share them with an email address, or make sign-in-required share links. Plan owners can remove email access and revoke links.

Firebase web configuration values are visible to browsers by design; do not add privileged service-account credentials or private API keys to `.env.local` or client code. Firestore rules restrict access to a plan's owner, explicitly shared email addresses, and authenticated users with an active share-link claim. Saved plans contain no shelter address or search coordinates.

The Firebase Emulator Suite and live deployment require the Firebase CLI and a Firebase project. Check Firebase and external data-provider quotas before public use; the data budget for this prototype is free tiers only.
