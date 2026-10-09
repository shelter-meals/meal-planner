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

Searches are initiated by the volunteer and use the OpenStreetMap Nominatim geocoder and Overpass API for nearby business listings. The exact shelter address is sent to Nominatim; the selected coordinates are sent to Overpass. A session-only cache avoids repeated geocoding for the same address. The app does not save the address or search coordinates with a plan.

OpenStreetMap data may be missing or out of date. Mapped hours and delivery tags are not confirmed with a business, and listings generally do not contain current menus, ingredient/allergen details, inventory, or delivery availability. The prototype displays those gaps, never invents menu items, and generates an editable count of complete meals per dietary group for grocery planning. Volunteers must confirm food, ingredients, stock, and delivery with providers.

The app attributes OpenStreetMap contributors in the interface and uses user-triggered lookups; respect the usage terms of [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) and [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API).

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
