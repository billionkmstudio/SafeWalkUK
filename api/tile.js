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
const DLAT = 0.01, DLNG = 0.015, MAX_AGE_DAYS = 30, BUDGET_MS = 50000;
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
  // two rounds: if every mirror fails fast (busy), wait a moment and ask again while time remains
  let last;
  for (let round = 0; round < 2; round++) {
    try { return await Promise.any(SERVERS.map(ask)); } catch (e) { last = e; }
    if (signal.aborted) break;
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw last;
}

function queries(ix, iy) {
  const s = (iy * DLAT).toFixed(5), w = (ix * DLNG).toFixed(5), n = ((iy + 1) * DLAT).toFixed(5), e = ((ix + 1) * DLNG).toFixed(5);
  const bb = s + ',' + w + ',' + n + ',' + e, H = '[out:json][timeout:40];';
  return {
    b: H + 'way["building"](' + bb + ');out geom;',
    r: H + '(way["highway"](' + bb + ');way["leisure"~"park|garden|pitch|nature_reserve|recreation_ground"](' + bb + ');way["landuse"~"grass|recreation_ground|forest|meadow|village_green"](' + bb + ');way["natural"~"wood|water"](' + bb + ');way["amenity"="parking"](' + bb + '););out geom;',
    n: H + '(node["highway"="street_lamp"](' + bb + ');node["man_made"="surveillance"](' + bb + ');node["amenity"~"pub|bar|fuel|restaurant|fast_food|pharmacy"](' + bb + ');node["shop"~"convenience|supermarket"](' + bb + '););out;',
  };
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

// Each of the three parts (buildings / roads+areas / nodes) is stored on its own, so when Overpass is busy and
// only some parts succeed, the next retry only has to fetch the missing ones instead of starting over.
async function part(ix, iy, key, q, signal) {
  const path = 'osm-tiles/v2/' + ix + '_' + iy + '_' + key + '.json';
  const stored = await readStored(path);
  if (stored && Date.now() - stored.ts < MAX_AGE_DAYS * 864e5) return { els: stored.els, src: 'store' };
  try {
    const els = await overpass(q, signal);
    if (haveBlob()) { try { await blob.put(path, JSON.stringify({ ts: Date.now(), els }), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' }); } catch (e) { /* best effort */ } }
    return { els, src: 'overpass' };
  } catch (e) {
    if (stored) return { els: stored.els, src: 'stale' };
    throw e;
  }
}

module.exports = async (req, res) => {
  const ix = parseInt(req.query && req.query.x, 10), iy = parseInt(req.query && req.query.y, 10);
  // roughly the UK: lat 49.5-61, lng -8.7-2
  const lat = iy * DLAT, lng = ix * DLNG;
  if (!Number.isInteger(ix) || !Number.isInteger(iy) || lat < 49.5 || lat > 61 || lng < -8.7 || lng > 2) {
    res.status(400).json({ error: 'bad tile' });
    return;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), BUDGET_MS);
  try {
    const q = queries(ix, iy);
    const keys = ['b', 'r', 'n'];
    const out = await Promise.allSettled(keys.map((k) => part(ix, iy, k, q[k], ctl.signal)));
    if (out.some((o) => o.status !== 'fulfilled')) {
      res.setHeader('X-Tile-Source', 'partial');
      res.status(502).json({ error: 'tile unavailable', ok: out.map((o) => o.status === 'fulfilled') });
      return;
    }
    const srcs = out.map((o) => o.value.src);
    res.setHeader('X-Tile-Source', srcs.every((s) => s === 'store') ? 'store' : srcs.join('+'));
    res.setHeader('Cache-Control', srcs.every((s) => s === 'store') ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'public, s-maxage=600');
    res.status(200).json({ ts: Date.now(), ix, iy, b: out[0].value.els, r: out[1].value.els, n: out[2].value.els });
  } finally { clearTimeout(timer); }
};
