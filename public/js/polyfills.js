// Polyfills for older iOS Safari (pre-15.4) and in-app browsers
if (!Array.prototype.at) Object.defineProperty(Array.prototype, 'at', { value: function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return this[n]; }, configurable: true, writable: true });
if (!String.prototype.at) Object.defineProperty(String.prototype, 'at', { value: function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return this[n]; }, configurable: true, writable: true });
if (!String.prototype.replaceAll) String.prototype.replaceAll = function (a, b) { return this.split(a).join(b); };
if (!Object.hasOwn) Object.hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) AbortSignal.timeout = ms => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
