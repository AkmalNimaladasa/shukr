const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const helpers = require('../public/js/prayer-location.js');
function routes() {
  const handlers = {};
  const app = new Proxy({}, { get: (_, method) => (path, ...fns) => { handlers[path] = fns.at(-1); } });
  require('../lib/features')({ app, auth() {}, wrap: f => f });
  return handlers;
}
async function request(handler, query) {
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
  await handler({ query }, res); return res;
}
test('reverse GPS resolves timezone even when all city services fail, including zero coordinates', async () => {
  const h = routes()['/api/reverse-city']; const old = global.fetch;
  global.fetch = async () => { throw Error('offline'); };
  try {
    for (const [lat, lng, tz] of [[40.7128, -74.006, 'America/New_York'], [-33.8688,151.2093,'Australia/Sydney'], [0,0,'Etc/GMT'], [51.5,0,'Europe/London']]) {
      const r = await request(h, { lat: String(lat), lng: String(lng) });
      assert.equal(r.body.result?.tz, tz); assert.equal(r.body.result.lat, lat); assert.equal(r.body.result.lng, lng);
    }
    for (const query of [{}, {lat:'',lng:0}, {lat:91,lng:0}]) assert.equal((await request(h, query)).statusCode,400);
  } finally { global.fetch = old; }
});
test('city search supplies country code and coordinate-derived timezone', async () => {
  const h = routes()['/api/geocode']; const old = global.fetch;
  global.fetch = async () => ({ ok:true, json:async()=>({results:[{id:1,name:'New York',country:'United States',country_code:'US',latitude:40.7128,longitude:-74.006}]}) });
  try { const r=await request(h,{q:'New York'}); assert.equal(r.body.results[0].tz,'America/New_York'); assert.equal(r.body.results[0].countryCode,'US'); }
  finally { global.fetch=old; }
});
test('wall-clock conversion uses destination DST on both sides of transition', () => {
  assert.equal(typeof helpers.zonedTime,'function');
  for (const [day,time,tz,expected] of [['2026-03-08','06:00','America/New_York','2026-03-08T10:00:00.000Z'],['2026-11-01','06:00','America/New_York','2026-11-01T11:00:00.000Z'],['2026-10-04','05:00','Australia/Sydney','2026-10-03T18:00:00.000Z'],['2026-01-02','05:00','Asia/Kathmandu','2026-01-01T23:15:00.000Z']]) assert.equal(helpers.zonedTime(day,time,tz).toISOString(),expected);
});
test('explicit methods bypass published city schedule on browser and server', () => {
  // Exercise the actual function bodies without starting the application's DB/server.
  const server = fs.readFileSync(require.resolve('../server.js'),'utf8');
  const body=server.slice(server.indexOf('async function prayerTimesFor('),server.indexOf('// ---------- AI helpers'));
  let calls=0;
  const ctx={validCoordinates:helpers.validCoordinates,s:{lat:0,lng:0,tz:'Etc/GMT',methodChosen:true,mpCityId:1},day:'2026-01-01',ctx:{muslimPro:()=>{calls++;return {days:{}};}},prayerTimes:()=>({fajr:'calculated'})};
  vm.createContext(ctx); vm.runInContext(body,ctx);
  return ctx.prayerTimesFor(ctx.s,ctx.day).then(t=>{assert.equal(t.source,'calculated');assert.equal(calls,0);});
});
test('calculation date uses requested destination calendar day on UTC+14 devices', () => {
  const old=process.env.TZ; process.env.TZ='Pacific/Kiritimati';
  const src=fs.readFileSync(require.resolve('../public/js/core.js'),'utf8');
  const body=src.slice(src.indexOf('export function calcTimes('),src.indexOf('// Prayer times are always calculated on-device')).replace('export ','');
  const adhan=require('adhan'); let received;
  const fake={...adhan,PrayerTimes:function(coords,date,p){received=[date.getFullYear(),date.getMonth()+1,date.getDate()];return new adhan.PrayerTimes(coords,date,p);}};
  const ctx={Date,globalThis:{ShukrMethods:require('../public/js/prayer-methods.js')},state:{user:{settings:{lat:0,lng:32,method:'MuslimWorldLeague'}}},adhan:fake,validCoordinates:helpers.validCoordinates,localDay:()=> '2026-01-02'};
  try {vm.createContext(ctx);vm.runInContext(body,ctx);ctx.calcTimes();assert.deepEqual(received,[2026,1,2]);}
  finally {if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
test('prayer page offers city search directly when location is missing', async () => {
  const src=fs.readFileSync(require.resolve('../public/js/views-worship.js'),'utf8');
  const body=src.slice(src.indexOf('export async function viewPrayer('),src.indexOf('// ================= QIBLA')).replace('export ','');
  const elements={}; const p={innerHTML:''};
  const ctx={esc:s=>s,state:{user:{settings:{lat:null,lng:null}}},shell:()=>p,empty:(_,text,extra)=>text+extra,$:s=>(elements[s]||={}),validCoordinates:helpers.validCoordinates,bindPrayerLocation:()=>{}};
  vm.createContext(ctx);vm.runInContext(body,ctx);await ctx.viewPrayer();
  assert.match(p.innerHTML,/id="prayerCityQ"/);assert.match(p.innerHTML,/id="prayerCityR"/);
});

