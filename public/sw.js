// Shukr service worker — network-first for the app shell (never serves stale code when online), cache fallback offline; push reminders
const V = 'shukr-1795513268';
const SHELL = ['/', '/app.bundle.js?v=1795513268', '/app.bundle.css?v=1795513268', '/vendor/adhan.js', '/manifest.webmanifest', '/icons/icon-192.png',
  '/data/adhkar.json', '/data/names.json', '/data/ayat.json', '/data/duas.json', '/data/hadith40.json', '/data/akhirah.json', '/data/quran-meta.json', '/data/hadith-books.json', '/data/quran-translations.json', '/data/audiobooks.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Share-to-Shukr: files shared from Instagram/TikTok/Gallery land here, stashed in Cache, then opened in Create.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method === 'POST' && u.pathname === '/share-target') {
    e.respondWith((async () => { const fd = await e.request.formData(); const c = await caches.open('share-inbox'); await Promise.all((await c.keys()).map(k => c.delete(k)));
      const files = fd.getAll('media').filter(f => f && f.size); let i = 0;
      for (const f of files.slice(0, 10)) await c.put('/share-inbox/' + (i++), new Response(f, { headers: { 'Content-Type': f.type, 'X-Name': encodeURIComponent(f.name || 'shared') } }));
      const text = [fd.get('title'), fd.get('text'), fd.get('url')].filter(Boolean).join(' ').slice(0, 2000);
      return Response.redirect('/#/create?shared=' + i + '&text=' + encodeURIComponent(text), 303); })());
    return;
  }
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ugc/') || url.pathname === '/healthz' || req.headers.has('range')) return;
  const sameOrigin = url.origin === location.origin;
  const cacheable = sameOrigin || /fonts\.(googleapis|gstatic)\.com|api\.alquran\.cloud|cdn\.jsdelivr\.net|unpkg\.com/.test(url.host);
  if (!cacheable) return;
  // big static data & fonts: cache-first; everything else (HTML/JS/CSS): network-first
  const cacheFirst = /\/data\/|\/audio\/|\/icons\/|fonts\.gstatic|cdn\.jsdelivr|api\.alquran/.test(url.href);
  if (cacheFirst) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); } return r; })));
    return;
  }
  e.respondWith(fetch(req).then(r => { if (r.ok && sameOrigin) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); } return r; })
    .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('/') : Response.error()))));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch (_) { d = { title: 'Shukr', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Shukr', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag: d.tag, renotify: !!d.tag, vibrate: d.silent ? [] : (d.vibrate || [200, 100, 200]), silent: !!d.silent,
    requireInteraction: !!d.requireInteraction, data: { url: d.url || '/', adhan: d.adhan || null, prayer: d.prayer || null },
    actions: d.adhan ? [{ action: 'play', title: '▶ Play adhan' }, { action: 'stop', title: 'Dismiss' }] : (d.tag === 'jummah' ? [{ action: 'open', title: 'See mosques' }] : [])
  }).then(() => d.adhan ? self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ type: 'adhan', voice: d.adhan, prayer: d.prayer })))) : null));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'stop') { e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(c => c.postMessage({ type: 'adhan-stop' })))); return; }
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { if (c.navigate) c.navigate(url).catch(() => {}); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
