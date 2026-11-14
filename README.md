# PIXEL BIRDER

*Every bird you see becomes a sprite.*

A mobile-only, offline-first PWA birdwatching game. Photograph a real bird (or catch one from your window), and the photo is turned on-device into a deterministic 32×32 pixel sprite: **anatomy from the species, colour from the photo, pattern from the trait.** Sprites land in a field journal that grows into a record of where you've been and what you've seen.

## Run it on GitHub Pages

A ready-to-serve build is committed in `docs/`, so no build step is needed.

1. Upload these files to the repository's `main` branch.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder: `/docs` → Save.**
3. After a minute, open `https://<you>.github.io/<repo>/` on your phone and choose **Add to Home Screen**.

After changing the code, run `npm run build`; it refreshes `docs/`. Commit that folder too.

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

## Data, privacy and licensing

- No account, no server. Everything is stored in IndexedDB on the device; Settings offers backup/restore.
- Photos are re-encoded on capture, which strips EXIF/GPS. Only region codes are stored — never coordinates.
- Network calls (optional, cached for offline): **Open-Meteo** weather for the region centroid (free tier is non-commercial) and **iNaturalist** taxon photos (each photo is shown with its photographer and Creative Commons licence; only CC-licensed images are used). Call recordings link out to **Xeno-canto**.
- The species seed (`src/data/species.ts`) is hand-curated. Frequencies are coarse seed estimates for spawn weighting, not survey data. If you monetise, independently license your data and review the iNaturalist/Open-Meteo terms first. The eBird API is non-commercial only and is **not** used.
- Background art in `public/bg/` was supplied by the project owner; confirm its licence before distributing.
- Fonts: Silkscreen, Inter, Atkinson Hyperlegible (SIL OFL).
