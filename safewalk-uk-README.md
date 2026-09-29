# SafeWalk UK — 夜歸安全透視

**Live:** https://www.safewalkuk.app · **Status:** Public Beta (v1.9.2)

A free, bilingual (English / 中文) night-walking safety tool for the UK. Enter a start and destination and SafeWalk UK compares walking routes using real police crime data, street lighting, CCTV and safe spaces, and shows how the risk changes as the night goes on.

> SafeWalk UK is an **experimental route-risk indicator**. It does not guarantee safety. In an emergency, call **999**.

## Features

### Route planning
- Search any UK start/destination (place name or postcode) with autocomplete
- Compares walking routes and highlights the **safest** vs **fastest**
- Safety score (0–100) with a breakdown: violent / property / anti-social / other crime, lighting, CCTV, safe spaces, distance
- "Why this route?" explanation on each route card
- Interactive map (Leaflet + OpenStreetMap) with crime, CCTV, lamp, safe-space and community-report markers

### Time of night
- **When?** selector: Now / 18:00 / 21:00 / 23:00 / 01:00 / 03:00
- **After Dark** tab compares the same route across the day and night

### Walk-through
- **Walk** tab: step-by-step preview with mini-maps and crime alerts per segment
- One-tap **quick reports** per step: 👍 no issues, ⚠️ poorly lit, 🚨 unsafe

### Safety tools
- **Live Companion**: start a journey and share your live location with a private link; the viewer sees your position and ETA update automatically
- **Community reports**: reports from the last 30 days are shown near your route
- **Ask for Angela** venues, pubs, shops and other open places shown as safe spaces
- Emergency reminder (999) and a legal / disclaimer gate on first use

### Convenience
- Save and pin routes, plus recent routes and a default route for daily commutes
- Share via copy link, WhatsApp or the native share sheet
- Bilingual toggle (English / 中文) and light / dark theme
- **PWA**: installable to the home screen; the app shell works offline (live data always needs a connection)
- In-app update toast when a new version is available

## How It Works

1. Geocode the start and end via **Nominatim** (OpenStreetMap)
2. Get walking routes via **OSRM**
3. Fetch street-level crime from **data.police.uk** (3 months of data, centred on the route)
4. Fetch CCTV, street lamps and safe spaces from **Overpass API** (with a Firestore cache to reduce load)
5. Load recent **community reports** from Firestore
6. Score each route and display the results

## Safety Scoring

Each route is scored 0–100 (higher = safer).

- **Crime proximity and severity**: crimes within 200 m of the route, weighted by distance and category (violent crime, robbery and weapons = 10 down to shoplifting = 1)
- **Time-of-night multiplier**: risk is scaled by hour, based on Home Office crime statistics (lowest in the morning, peaking around midnight)
- **Distance penalty**: longer routes get a small penalty, capped at 15%
- **Street lighting**: real OSM lamp density along the route (about 25 lamps/km counts as well lit), blended with a road-type estimate as a floor, since OSM lamp tagging is incomplete
- **CCTV and safe-space coverage**: counted within 300 m of the route
- **Multi-signal convergence**: when several independent signals are bad at once (high crime, poor lighting, no CCTV), the score is reduced further. Very dark, unmonitored routes with little recorded crime are capped at 55, because low recorded crime there may only mean few people walk it

## Data Sources & Services

| Service | Purpose | Notes |
|---------|---------|-------|
| [data.police.uk](https://data.police.uk/docs/) | Street-level crime | England, Wales and Northern Ireland only (Police Scotland is not covered) |
| [Nominatim](https://nominatim.org/) | Geocoding | Public server, 1 req/sec limit |
| [OSRM](http://project-osrm.org/) | Walking routes | Public demo server, no SLA |
| [Overpass API](https://overpass-api.de/) | CCTV, lamps, safe spaces | Two public servers with retry, plus Firestore cache |
| [OpenStreetMap](https://www.openstreetmap.org/) | Map tiles | Standard tile usage policy |
| Firebase Firestore | Live Companion, community reports, Overpass cache | Requires correct security rules |
| Google Analytics | Anonymous usage events | Route search, share, companion, tab and modal events |

Crime data is published by the police under the [Open Government Licence](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Map data © OpenStreetMap contributors (ODbL).

## Project Structure

```
index.html                 Entire app (HTML, CSS, JS)
sw.js                      Service worker (offline app shell; never caches live data)
manifest.json              PWA manifest
icon-*.png                 App icons (any + maskable)
og-image.png               Social share image
safewalk-uk-README.md      This file
```

The service worker deliberately never caches crime, routing, POI or Firestore responses, so stale safety data is never shown. Only the shell and static libraries are cached. Bump `SW_VERSION` in `sw.js` on every release so users get the update toast.

## Run Locally

No build step:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`. Use a local server rather than `file://`, because the service worker needs HTTP.

## Known Limitations

- Crime data is 2–4 months old and only covers reported crime
- Areas with sparse OSM tagging may under-report lighting and CCTV
- Public OSRM, Nominatim and Overpass servers may rate-limit at high traffic
- No coverage for Scotland crime data
- Community reports are anonymous and unmoderated

## Roadmap

- [x] Time-of-day crime weighting
- [x] Street lighting layer (OSM lamps)
- [x] CCTV locations
- [x] Safe spaces / Ask for Angela venues
- [x] Bilingual Chinese / English toggle
- [x] Saved routes
- [x] PWA (installable, offline shell)
- [x] Live Companion (shared live location)
- [x] Community reports
- [ ] Firestore security rules review and report rate-limiting / moderation
- [ ] Self-hosted or paid routing / geocoding fallback
- [ ] Shareable route score image cards (for social media)
- [ ] SEO landing pages per city, plus Chinese pages
- [ ] One-tap emergency call and "arrived safely" notification
- [ ] Scotland data source
- [ ] User accounts and cloud-synced routes

## License

MIT — Built by [Billion Studio](https://www.billionstudio.co.uk/)
