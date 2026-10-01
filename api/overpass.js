// Server-side Overpass proxy (Vercel serverless function).
// Why: browsers calling the free Overpass servers directly get rate-limited / time out.
// Here we send a proper User-Agent and ask all mirrors at once (first good answer wins), so one slow
// mirror no longer eats the whole time budget. Vercel's CDN caches each distinct query for a day.
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'SafeWalkUK/1.0 (+https://safewalkuk.app; info@billionstudio.app)';
const BUDGET_MS = 26000;

module.exports = async (req, res) => {
  const q = req.query && req.query.data;
  if (typeof q !== 'string' || q.length < 20 || q.length > 4000 || q.indexOf('[out:json]') !== 0) {
    res.status(400).json({ error: 'bad query' });
    return;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), BUDGET_MS);
  const ask = async (srv) => {
    const r = await fetch(srv, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(q),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(srv + ' ' + r.status);
    const j = await r.json();
    if (!j || !Array.isArray(j.elements)) throw new Error(srv + ' empty');
    return j;
  };
  try {
    const j = await Promise.any(SERVERS.map(ask));
    ctl.abort(); // cancel the slower mirrors
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(j);
  } catch (e) {
    res.status(502).json({ error: 'overpass unavailable' });
  } finally {
    clearTimeout(timer);
  }
};
