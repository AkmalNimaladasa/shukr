// Live gold/silver prices per gram in any currency (cached). Sources: gold-api.com (USD/oz), open.er-api.com (FX).
const OZ = 31.1034768;
module.exports = function metalPrices({ app, auth, wrap }) {
  let cache = null, at = 0, inflight = null;
  async function load() {
    if (cache && Date.now() - at < 6 * 3600e3) return cache;
    if (inflight) return inflight;
    inflight = (async () => {
      const get = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error('upstream ' + r.status); return r.json(); };
      const [g, s, fx] = await Promise.all([get('https://api.gold-api.com/price/XAU'), get('https://api.gold-api.com/price/XAG'), get('https://open.er-api.com/v6/latest/USD')]);
      if (!(g.price > 0 && s.price > 0 && fx.rates)) throw new Error('bad upstream data');
      cache = { goldUsdGram: g.price / OZ, silverUsdGram: s.price / OZ, rates: fx.rates, updated: g.updatedAt || new Date().toISOString() }; at = Date.now(); return cache;
    })().finally(() => { inflight = null; });
    return inflight;
  }
  app.get('/api/metal-prices', auth, wrap(async (req, res) => {
    const cur = String(req.query.currency || 'USD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) return res.status(400).json({ error: 'Unknown currency' });
    let d; try { d = await load(); } catch { return res.status(503).json({ error: 'Live prices are unavailable right now. Enter them manually.' }); }
    const rate = d.rates[cur]; if (!rate) return res.status(404).json({ error: `No live rate for ${cur}. Enter prices manually.` });
    res.json({ currency: cur, gold: +(d.goldUsdGram * rate).toFixed(4), silver: +(d.silverUsdGram * rate).toFixed(4), updated: d.updated, currencies: Object.keys(d.rates).sort() });
  }));
};
