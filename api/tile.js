// Tile cache for OSM data. The UK is cut into fixed tiles (0.01° lat x 0.015° lng, about 1.1 x 1.0 km).
// First request for a tile asks Overpass (3 queries in parallel, 3 mirrors raced) and stores the result in
// Vercel Blob; every later request, from any user, is served from our own storage. Tiles older than
// MAX_AGE_DAYS are refreshed, and if Overpass is down the stale copy is served instead of failing.
// Without a BLOB_READ_WRITE_TOKEN the function still works, it just has nothing to cache into.
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'SafeWalkUK/1.0 (+https://safewalkuk.app; info@billionstudio.app)';
const DLAT = 0.01, DLNG = 0.015, MAX_AGE_DAYS = 30, BUDGET_MS = 26000;
let blob = null;
try { blob = require('@vercel/blob'); } catch (e) { blob = null; }
const haveBlob = () => !!(blob && process.env.BLOB_READ_WRITE_TOKEN);

async function overpass(q, signal) {
  const ask = async (srv) => {
    const r = await fetch(srv, {
      method: 'POST', body: 'data=' + encodeURIComponent(q),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, signal,
    });
    if (!r.ok) throw new Error(srv + ' ' + r.status);
    const j = await r.json();
    if (!j || !Array.isArray(j.elements)) throw new Error('empty');
    return j.elements;
  };
  return Promise.any(SERVERS.map(ask));
}

async function build(ix, iy) {
  const s = (iy * DLAT).toFixed(5), w = (ix * DLNG).toFixed(5), n = ((iy + 1) * DLAT).toFixed(5), e = ((ix + 1) * DLNG).toFixed(5);
  const bb = s + ',' + w + ',' + n + ',' + e, H = '[out:json][timeout:25];';
  const qB = H + 'way["building"](' + bb + ');out geom;';
  const qR = H + '(way["highway"](' + bb + ');way["leisure"~"park|garden|pitch|nature_reserve|recreation_ground"](' + bb + ');way["landuse"~"grass|recreation_ground|forest|meadow|village_green"](' + bb + ');way["natural"~"wood|water"](' + bb + ');way["amenity"="parking"](' + bb + '););out geom;';
  const qN = H + '(node["highway"="street_lamp"](' + bb + ');node["man_made"="surveillance"](' + bb + ');node["amenity"~"pub|bar|fuel|restaurant|fast_food|pharmacy"](' + bb + ');node["shop"~"convenience|supermarket"](' + bb + '););out;';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), BUDGET_MS);
  try {
    const [b, r, nn] = await Promise.all([overpass(qB, ctl.signal), overpass(qR, ctl.signal), overpass(qN, ctl.signal)]);
    return { ts: Date.now(), ix, iy, b, r, n: nn };
  } finally { clearTimeout(timer); }
}

async function readStored(path) {
  if (!haveBlob()) return null;
  try {
    const h = await blob.head(path);
    const r = await fetch(h.url);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  const ix = parseInt(req.query && req.query.x, 10), iy = parseInt(req.query && req.query.y, 10);
  // roughly the UK: lat 49.5-61, lng -8.7-2
  const lat = iy * DLAT, lng = ix * DLNG;
  if (!Number.isInteger(ix) || !Number.isInteger(iy) || lat < 49.5 || lat > 61 || lng < -8.7 || lng > 2) {
    res.status(400).json({ error: 'bad tile' });
    return;
  }
  const path = 'osm-tiles/v1/' + ix + '_' + iy + '.json';
  const stored = await readStored(path);
  const fresh = stored && Date.now() - stored.ts < MAX_AGE_DAYS * 864e5;
  if (fresh) {
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Tile-Source', 'store');
    res.status(200).json(stored);
    return;
  }
  try {
    const t = await build(ix, iy);
    if (haveBlob()) {
      try { await blob.put(path, JSON.stringify(t), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' }); } catch (e) { /* caching is best effort */ }
    }
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    res.setHeader('X-Tile-Source', 'overpass');
    res.status(200).json(t);
  } catch (e) {
    if (stored) { res.setHeader('X-Tile-Source', 'stale'); res.status(200).json(stored); return; }
    res.status(502).json({ error: 'tile unavailable' });
  }
};
