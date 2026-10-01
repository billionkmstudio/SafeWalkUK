// Server-side Overpass proxy (Vercel serverless function).
// Why: browsers calling the free Overpass servers directly get rate-limited / time out.
// From here we send a proper User-Agent, try several mirrors, and let Vercel's CDN cache each
// distinct query for a day, so repeat views of the same area are instant and cost nothing.
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'SafeWalkUK/1.0 (+https://safewalkuk.app; info@billionstudio.app)';

module.exports = async (req, res) => {
  const q = req.query && req.query.data;
  if (typeof q !== 'string' || q.length < 20 || q.length > 4000 || q.indexOf('[out:json]') !== 0) {
    res.status(400).json({ error: 'bad query' });
    return;
  }
  for (const srv of SERVERS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 22000);
    try {
      const r = await fetch(srv, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) continue;
      const j = await r.json();
      if (!j || !Array.isArray(j.elements)) continue;
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      res.status(200).json(j);
      return;
    } catch (e) {
      clearTimeout(timer);
    }
  }
  res.status(502).json({ error: 'overpass unavailable' });
};
