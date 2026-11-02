# 🛡 SafeWalk UK — 夜歸安全透視

**Find a lower-risk walking route at night, using real UK crime data, street lighting, CCTV and safe spaces.**
搵出夜晚步行風險較低嘅路線 —— 結合英國真實罪案數據、街燈、CCTV 同安全地點。

🌐 Live: **https://www.safewalkuk.app** · Current version: **v1.9.3**
Built by [Billion Studio](https://www.billionstudio.co.uk/) · Contact: info@billionstudio.app

> ⚠️ SafeWalk UK gives an **experimental risk indicator** based on public data. It does not guarantee safety and is not a substitute for your own judgement. In an emergency, call **999**.
> 本工具只提供基於公開數據嘅實驗性風險參考，並不保證人身安全。緊急情況請致電 **999**。

---

## What it does 功能

| Tab | What you get |
|-----|--------------|
| 🗺 **Map** | Up to several walking route options, ranked by Safety Score (0–100), with crime, CCTV, street-lamp and safe-space markers along the selected route |
| 📊 **Details** | Score breakdown by factor: violent / property / anti-social crime, lighting, CCTV, safe spaces, A-road exposure |
| 🌙 **After Dark** | Same route compared across different hours — see how risk changes after dark |
| 🚶 **Walk** | Step-by-step walk-through preview with mini-maps, nearby-crime alerts and one-tap street reports |

**Other features**

- **Time-of-night scoring** — pick *Now / 18:00 / 21:00 / 23:00 / 01:00 / 03:00*; risk is scaled by an hourly multiplier
- **Multi-signal convergence** — crime + poor lighting + no CCTV together are penalised more heavily than any single factor (and an unlit, unmonitored route can't score high just because little crime is recorded there)
- **Live Companion** — share a private link so a friend can watch your live location and ETA while you walk (location updates via Firestore; stops when you end the trip)
- **Community quick reports** — "No issues / Poorly lit / Unsafe" on a street; shown for 30 days, **display-only (does not change the score)**
- **Saved routes** — pin & name routes (e.g. "Work commute"), set a 🏠 default route, remembers the usual hour; recents capped at 5. Stored in `localStorage` only (no account)
- **Share** — copy link, WhatsApp, or native share sheet
- **Bilingual UI** — English / 中文 toggle (disclaimer is bilingual)
- **Light / dark theme**
- **PWA** — installable on iOS/Android; app shell opens offline; "new version available" toast
- **First-launch disclaimer gate** and in-app *Disclaimer & Terms*

## How it works 運作流程

1. User enters start and destination (UK only; postcodes supported) — autocomplete + geocoding via **Nominatim**
2. Walking routes (with alternatives) come from the **OSM foot router** (`routing.openstreetmap.de`); if unavailable it falls back to **OSRM**, and walking time is recalculated at 5 km/h
3. **data.police.uk** street-level crime is fetched for the route area (3 months, offset for the data publication lag)
4. **Overpass API** (two mirror servers, with retry) supplies CCTV, street lamps and safe spaces (open late-night shops, petrol stations, pubs/bars, restaurants, pharmacies, hospitals, police). Results are cached in Firestore by 0.01° grid cell for 14 days to reduce Overpass load
5. Each route is scored and ranked; the map, details, After Dark and Walk views are rendered from the same result

## Safety Score 評分方法

```
risk       = Σ crime_weight × (1 − distance/200m) × time_multiplier      (crimes within 200 m of the route)
rawScore   = 100 × exp(−risk / 190)
score      = rawScore × (1 − distancePenalty) × convergenceMultiplier    (min 2, capped if isolated)
```

- **Crime weight** by category: violent crime / robbery / weapons = 10 · theft from person = 7 · burglary = 6 · criminal damage = 5 · anti-social behaviour / public order = 4 · vehicle crime / drugs / other theft = 3 · bicycle theft / other = 2 · shoplifting = 1
- **Time multiplier** (hourly, ~0.5× in the morning → 2.2× at midnight), based on Home Office crime statistics patterns
- **Distance penalty**: up to 15% for longer routes (more exposure time)
- **Lighting score** = 65% OSM street-lamp density (≈25 lamps/km ≈ well-lit main road) + 35% road-type estimate (A-roads/streets lit, paths/alleys unlit)
- **Convergence**: crime score <60, lighting <40 and zero nearby CCTV are the three "bad" signals; 2+ signals together reduce the score (×0.82 for two, ×0.60 for three when crime is among them), and an unlit + unmonitored route is capped
- **A-road warning** shown when a route follows A-roads

## Data sources & limits 數據來源

| Source | Used for | Notes |
|--------|----------|-------|
| [data.police.uk](https://data.police.uk/docs/) | Street-level crime | Not available for Scotland; data is monthly and delayed; locations are anonymised to nearby points |
| [Nominatim](https://nominatim.org/) | Geocoding / reverse geocoding | Public usage policy applies |
| [OSM foot router](https://routing.openstreetmap.de/) / [OSRM](http://project-osrm.org/) | Walking routes | Public servers, no SLA |
| [Overpass API](https://overpass-api.de/) | CCTV, lamps, safe spaces | OSM coverage varies by area — sparse mapping ≠ no lighting/CCTV |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Map tiles | Standard tile usage policy |
| Firebase Firestore | POI cache, community reports, Live Companion trips | Client-side SDK; secured by Firestore Rules |
| Google Analytics 4 | Anonymous usage events | e.g. share, time change, route pinned |

Live data (crime, routing, POI, Firestore, analytics) is **never cached by the service worker**, to avoid showing stale safety information.

## Project structure 檔案結構

```
UK Safe Walk/
├── index.html            # Entire app (HTML + CSS + JS, single file, no build step)
├── sw.js                 # Service worker v1.9.3 (shell / library / tile caching)
├── manifest.json         # PWA manifest
├── icon-192(.maskable).png, icon-512(.maskable).png
├── og-image.png          # Social share image
├── safewalk-uk-README.md # This file
├── Google Analytics Code.txt   # Private notes (GA ID, Firebase config, feedback form)
└── Old Index/            # Archived earlier versions of index.html (not deployed)
```

## Run locally 本機執行

No build step. Serve the folder over HTTP (the service worker and geolocation need `http://localhost` or HTTPS, not `file://`):

```bash
python3 -m http.server 8000      # then open http://localhost:8000
# or
npx serve .
```

## Deploy & version bump 部署及更新

- Source of truth: GitHub `billionkmstudio/SafeWalkUK` (`main`)
- When changing `index.html`, **bump the version in two places** so users get the "new version" toast: `SW_VERSION` in `sw.js` and the `vX.Y.Z` label in the `index.html` footer
- Keep `Old Index/` out of the deployed repo if not needed

## Tech stack 技術

Vanilla JS (single file, zero build) · Leaflet 1.9.4 · OpenStreetMap tiles · Firebase (Firestore) · Service Worker + Web App Manifest · Inter / JetBrains Mono fonts

## Ideas / not yet done 待辦

- [ ] Official street-lighting data (e.g. Ordnance Survey NGD / council data) to replace OSM lamp estimate
- [ ] Council CCTV open data
- [ ] "Ask for Angela" and other verified safe-space venues
- [ ] Scotland coverage (needs a non-police.uk crime source)
- [ ] Optional user accounts with synced saved routes
- [ ] Framework migration only if the single-file app outgrows itself

## License & credits

© 2026 Billion Studio. All rights reserved. Map data © OpenStreetMap contributors; crime data © Crown copyright, contains public sector information licensed under the Open Government Licence v3.0.
