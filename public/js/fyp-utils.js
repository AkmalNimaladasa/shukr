export function deckIndex(index, length) { return Math.max(0, Math.min(Number.isFinite(index) ? Math.round(index) : 0, length)); }
export function sessionProgress(items) { return new Set(items.filter(x => x.completed).map(x => x.id)).size; }
export function safeSource(url) { return typeof url === 'string' && /^https:\/\/[^\s<>"']+$/i.test(url) ? url : ''; }
