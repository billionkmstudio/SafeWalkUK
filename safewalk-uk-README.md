# SafeWalk UK — 夜歸安全透視

A safety-focused walking route planner for the UK, using real crime data from the Police API.

## Quick Start

```bash
# No build step needed. Just serve the HTML file:
npx serve .
# or
python3 -m http.server 8000
```

Then open `http://localhost:8000` (or `http://localhost:3000` for npx serve).

## How It Works

1. Enter a start and end location (anywhere in the UK)
2. The app geocodes via Nominatim (OpenStreetMap)
3. Finds walking routes via OSRM (open routing)
4. Fetches real street-level crime data from data.police.uk (last 3 months)
5. Scores each route by crime proximity and severity
6. Displays safest vs fastest routes on an interactive map
7. Walk-through mode: step-by-step preview with mini-maps and crime alerts

## APIs Used (all free, no keys required)

| API | Purpose | Rate Limit |
|-----|---------|------------|
| [data.police.uk](https://data.police.uk/docs/) | Street-level crime data (England & Wales) | Reasonable use |
| [Nominatim](https://nominatim.org/) | Geocoding (place → coordinates) | 1 req/sec |
| [OSRM](http://project-osrm.org/) | Walking route calculation | Public demo server |
| [OpenStreetMap](https://www.openstreetmap.org/) | Map tiles | Standard tile usage |

## Safety Scoring Algorithm

Each route is scored 0–100 based on:
- **Crime proximity**: crimes within 200m of the route, weighted by distance
- **Crime severity**: violent crime (10x) → shoplifting (1x)
- **Route length**: longer routes get a slight penalty (more exposure time)

## Future Enhancements

- [ ] Street lighting data (Ordnance Survey NGD)
- [ ] CCTV locations (council open data)
- [ ] Safe spaces / Ask for Angela venues
- [ ] Time-of-day crime weighting (night vs day)
- [ ] Bilingual Chinese/English toggle
- [ ] User accounts + saved routes
- [ ] PWA / mobile app wrapper
- [ ] Next.js migration for production deployment

## Tech Stack

- Vanilla JS (zero build step for MVP)
- Leaflet.js (mapping)
- OpenStreetMap tiles
- data.police.uk REST API
- OSRM routing engine

## License

MIT — Built by Billion Studio (billionstudio.co.uk)
