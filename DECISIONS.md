# Decisions

One line per meaningful choice, with the reason.

- **Stack: React 19 + TS + Vite + vite-plugin-pwa, no PixiJS/Zustand/TanStack/Dexie/Supabase.** Static GitHub Pages hosting; Canvas 2D is plenty for 32×32 sprites; a 40-line store with useSyncExternalStore + idb-keyval keeps the shell at ~137 KB gz.
- **No backend.** GitHub Pages is static; accounts, sync, RLS, push notifications and community challenges are out. ONB-8 "Save your journal?" became a backup-file prompt; the offline "N waiting to sync" chip became "saved on this phone".
- **Palette slot mapping by nearest default colour, not luminance sort (PIX-5).** Luminance sort paints robins grey; pulling each species slot toward its nearest photo cluster plus a global light shift keeps anatomy readable while the photo still decides the colours.
- **Sprites stored as 17 palette indices, frames regenerated deterministically.** Tiny storage, byte-identical on every device; `spriteHash` of frame 0 is kept for audits.
- **Ink reserved for outlines; big black areas render as Plum.** Black birds otherwise vanish on dark pages.
- **Window Mode species are filed as verified without a confirm sheet.** The game spawned the bird, so it is not a silent guess; keeps first catch at 6 taps.
- **Window Mode palette comes from a clean plate (bird + scene average colour), the photo is the real scene crop.** Painted backgrounds would otherwise bleed into sprite colours.
- **Craft badges count Field Mode photos only.** Window-mode Fieldcraft is partly synthetic (focus/patience), so it can't farm photo badges.
- **"Not sure — identify later" instead of "you tell me".** There is no ID model; the honest copy says what happens.
- **Hotspot/county badges re-expressed as patch/habitat badges.** No coordinates are stored, so hotspots and counties cannot be known.
- **Call player links to Xeno-canto instead of embedding audio.** Recordings need per-file licences and an API key.
- **Reference photos from iNaturalist (user request).** Only CC-licensed default photos, always attributed; cached by the service worker for offline.
- **Owner-supplied layered backgrounds replace procedural scenes (user request).** 14 sets mapped to habitat × day phase; procedural pixel props (branches, wire, feeder, post) give birds perches in every scene. The art is outside FIELD 32 by owner choice; sprites and props stay in FIELD 32.
- **UI theme: near-black neutrals with a neon yellow-green primary (#C6FF1A) (user request).** Sprite palette unchanged; "gold" badge tier and Legendary rarity keep FIELD 32 Sun.
- **Mobile-only layout.** The app is a 480 px column; desktop shows a note to open it on a phone.
- **Sun times from region centroid (NOAA approx.) placed relative to solar noon.** Fixes sunsets that wrap past UTC midnight; tested across longitudes.
- **No decorations (user request).** Feathers are spent on feeder food only; extra Aviary scenes open at 10 species.
- **One job per tab (user request).** Explore = find birds (full-screen map + pull-up drawer), BirdDex = collection, Snap = camera, Aviary = care (Birds · Feeder · Decor), Trainer = progress (Quests · Badges · Life list). Quests live only in Trainer; alerts surface where action is needed.
- **Discovery language (user request).** Birds are found and discovered, never caught: "Discovered!", the Snap Lens records a bird's likeness while the real bird flies on.
- **Owner-supplied sound clips** for purchases, new BirdDex entries, level-ups/badges and the Snap Lens throw; long jingles duck the music.
- **Professor Merlin and Rowan the druid (owner art).** Merlin (a real small falcon) guides onboarding; Rowan runs the Feed Store and the quest board and casts on purchases and claims.
- **Main theme is a streamed song.** Kept out of the install precache (2 MB) and cached on first play; it pauses/resumes across screens and ducks under jingles.
- **Plain-language bird groups.** Songbird, Crow family, Bird of prey… replace invented type names; BirdDex filters are All/Found/Missing + group + where.
- **Live data needs no login.** iNaturalist read endpoints are public with CORS `*`; Explore shows a live status, refreshes every 5 minutes, lists the latest nearby reports, and Settings has a live-data check.
- **Sound only while the app is on screen.** All audio pauses on visibilitychange/pagehide and resumes on return.
