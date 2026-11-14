# BirdlyQuest

*Catch real birds with your camera.*

A mobile-only, offline-capable PWA collecting game. Go outside, photograph a **real** bird, and it is caught: a monster-collector-style encounter plays, your photo is turned on-device into a 32×32 pixel sprite, and the bird joins your BirdDex and Aviary as a pet that needs feeding.

- **Anywhere on Earth**: pick any country and state/province (or use your location). The local BirdDex comes live from iNaturalist research-grade records for that place; a curated list works offline.
- **Explore map**: real map with recent nearby bird sightings as pixel pins (sensitive species are never pinned).
- **Encounter & capture**: wild-bird encounter, identify from a likely-species menu, throw a Snap Capsule, wobble, Caught! Dex numbers, bird types, levels.
- **Pets & the feeder**: birds living in your Aviary (up to 12) slowly get hungry and fly to the bird feeder to eat. Buy food bags with Feathers (earned by catching real birds, quests and badges) and pour them into the feeder; when it runs empty, birds go hungry. Extra birds rest in the Bird Box and don't need food. Birds never die; hungry birds are just weak.
- **Trainer**: partner bird, trainer card, 24 badges, daily/weekly/seasonal quests, original chiptune music and SFX.

## Run it on GitHub Pages

1. Push this folder to a GitHub repository (default branch `main`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs tests, builds, and deploys via `.github/workflows/deploy.yml`.
4. Open `https://<you>.github.io/<repo>/` on your phone and use **Add to Home Screen**.

The build uses a relative base (`./`), so any repository name works. Camera access requires HTTPS, which GitHub Pages provides.

## Develop

```bash
npm install
npm run dev          # local dev server (phone on same Wi-Fi: use the printed network URL)
npm test             # core unit tests (XP, rarity, determinism, sprite gates, sun phases)
npm run build        # production build to dist/
npm run icons        # regenerate PWA icons from the sprite pipeline
```

A sprite lab (every species, every animation frame, silhouette test) lives at `#/lab` or Settings → Sprite lab. Five taps on the version line in Settings opens the debug panel (pipeline timings, storage, event log).

## What's in v1

- **Onboarding** — guest-first, region picker (9 seed regions, optional "use my location" that discards coordinates), patch picker, guaranteed starter bird. First sprite in ~10 s / 6 taps.
- **Window Mode & Sit Spot** — layered parallax scenes chosen by habitat and the region's real sun position; Poisson arrivals weighted by Likely Now Score; tap-to-focus, shutter, reveal.
- **Field Mode** — live camera, 1:1 framing, thirds grid, tap-to-focus, exposure, zoom, top-5 shortlist with real reference photos, distance cue, gallery import (EXIF ≤24 h, 50% XP), Sketch mode when the camera is unavailable.
- **Photo → pixel pipeline** (Web Worker) — subject isolation, CIELAB k-means, ΔE2000 snapping to FIELD 32, 12 archetypes × 14 animation frames (idle breathing, blink, tail flick, peck, hop, 6-frame flight), pattern masks, selective outline, rare natural variants seeded from the photo hash.
- **Fieldcraft score** — sharpness, exposure, subject size, framing, separation, with two lines of coaching.
- **Journal** — silhouettes with habitat hints, filters/sorts, 3 progress meters, species cards with real CC-licensed reference photos (iNaturalist), plumage records, journal spread with notes, shareable card.
- **Progression** — XP and 9 ranks, streaks with freeze tokens, 24 badges, daily/weekly/seasonal challenges, Feathers and habitat decor, Year in Birds.
- **Map** (region atlas, no pins), **Habitat** diorama, **You** tab, settings, backups.

## Custom art

- `public/bg/`: layered parallax backgrounds (owner-supplied).
- `public/badges/`: badge icons and capture effect (owner-supplied).
- `public/prof/druid.png`: **add the professor sprite sheet here.** Frames are detected automatically (rows and frames separated by empty space; a solid background colour is keyed out) and the first row plays as the idle animation. Until the file exists an owl stands in.

## Data, privacy and licensing

- No account, no server. Everything is stored in IndexedDB on the device; Settings offers backup/restore.
- Photos are re-encoded on capture, which strips EXIF/GPS. Only region codes are stored — never coordinates.
- Network calls (optional, cached for offline): **Open-Meteo** weather for the region centroid (free tier is non-commercial) and **iNaturalist** taxon photos (each photo is shown with its photographer and Creative Commons licence; only CC-licensed images are used). Call recordings link out to **Xeno-canto**.
- The species seed (`src/data/species.ts`) is hand-curated. Frequencies are coarse seed estimates for spawn weighting, not survey data. If you monetise, independently license your data and review the iNaturalist/Open-Meteo terms first. The eBird API is non-commercial only and is **not** used.
- Background art, badge icons and professor sprite were supplied by the project owner; confirm their licences before distributing.
- Country/state list: countries-states-cities-database (ODbL 1.0); attribution required, derived data stays under ODbL.
- Map tiles © OpenStreetMap contributors © CARTO (free for non-commercial use). Reverse geocoding by BigDataCloud's free client API.
- Fonts: Silkscreen, Inter, Atkinson Hyperlegible (SIL OFL).
