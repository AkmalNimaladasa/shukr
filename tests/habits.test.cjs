const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
let db,server,base;
async function api(route='',{user=1,method='GET',body}={}) {
  const r=await fetch(base+'/api/habits'+route,{method,headers:{'x-user':String(user),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};
}
before(async()=>{
  assert.ok(fs.existsSync(require('node:path').join(__dirname,'../lib/habits.js')),'habit routes implemented');
  db=new PGlite({initialMemory:128*1024*1024});
  await db.exec('CREATE TABLE users(id INT PRIMARY KEY); INSERT INTO users VALUES(1),(2);');
  await db.exec(require('../lib/schema-habits'));
  await db.exec(require('../lib/schema-habits'));
  const app=express(); app.use(express.json({strict:false}));
  require('../lib/habits')({app,q:(sql,p)=>db.query(sql,p),
    auth:(req,res,next)=>{const id=Number(req.headers['x-user']);if(![1,2].includes(id))return res.status(401).json({error:'Sign in'});req.user={id};next();},
    wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),todayFor:user=>user.id===2?'2026-11-20':'2026-11-19'});
  app.use((e,req,res,next)=>res.status(500).json({error:e.message}));
  server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();});
test('create custom habits validates bounded text and isolates owners',async()=>{
  assert.equal((await api('',{method:'POST',user:0,body:{name:'Private'}})).status,401);
  for(const body of [{},{name:''},{name:'   '},{name:'x'.repeat(81)},{name:1},{name:'Read',category:''},{name:'Read',category:'x'.repeat(33)},{name:'Read',icon:'not-an-icon'},{name:'Read',unknown:1},[],null]) {
    assert.equal((await api('',{method:'POST',body})).status,400,JSON.stringify(body));
  }
  const r=await api('',{method:'POST',body:{name:'  Read Quran  ',category:'faith',icon:'quran'}});
  assert.equal(r.status,201);assert.equal(r.data.habit.name,'Read Quran');assert.equal(r.data.habit.category,'faith');assert.equal(r.data.habit.icon,'quran');assert.equal(r.data.habit.active,true);
  const mine=(await api()).data;assert.equal(mine.habits.length,1);assert.equal(mine.habits[0].streak,0);assert.equal(mine.habits[0].completed,false);assert.deepEqual(mine.habits[0].history,mine.days.map(day=>({day,completed:false})));
  assert.equal((await api('',{user:2})).data.habits.length,0);
  await db.query('DELETE FROM habits WHERE user_id=$1',[1]);
});
test('logs are idempotent, binary, owner-isolated and preserve archived history',async()=>{
  const id=(await api('',{method:'POST',body:{name:'Walk'}})).data.habit.id;
  for(const method of ['PATCH','PUT']) {
    const route='/'+id+(method==='PUT'?'/log':'');
    const body=method==='PUT'?{day:'2026-11-19',completed:true}:{name:'Stolen'};
    assert.equal((await api(route,{method,user:2,body})).status,404);
    assert.equal((await api(route,{method,user:0,body})).status,401);
  }
  for(let i=0;i<2;i++) assert.equal((await api('/'+id+'/log',{method:'PUT',body:{day:'2026-11-19',completed:true}})).status,200);
  assert.equal((await db.query('SELECT * FROM habit_logs WHERE habit_id=$1',[id])).rows.length,1);
  for(const day of ['2026-11-18','2026-11-17','2026-11-11']) await api('/'+id+'/log',{method:'PUT',body:{day,completed:true}});
  let data=(await api('?day=2026-11-18')).data,h=data.habits.find(h=>h.id===id);
  assert.equal(data.day,'2026-11-18');assert.equal(h.completed,true);assert.equal(h.streak,3);assert.equal(h.weekCompleted,3);
  assert.deepEqual(data.summary,{active:1,completed:1,todayCompleted:1});
  assert.equal(h.history.filter(x=>x.completed).length,3);
  assert.equal((await api('/'+id+'/log',{method:'PUT',body:{day:'2026-11-19',completed:false}})).status,200);
  h=(await api()).data.habits.find(h=>h.id===id);assert.equal(h.completed,false);assert.equal(h.streak,2);
  assert.equal((await api('/'+id,{method:'PATCH',body:{name:' Daily walk ',active:false}})).status,200);
  data=(await api()).data;h=data.habits.find(h=>h.id===id);assert.equal(h.name,'Daily walk');assert.equal(h.active,false);assert.equal(h.weekCompleted,2);assert.equal(data.summary.active,0);
  assert.equal((await api('/'+id+'/log',{method:'PUT',body:{day:'2026-11-19',completed:true}})).status,409);
  assert.equal((await api('/'+id,{method:'PATCH',body:{active:true}})).status,200);
  assert.equal((await api('',{user:2})).data.habits.length,0);
  await db.query('DELETE FROM habits WHERE id=$1',[id]);
});
test('dates and patches are validated without coercion or future writes',async()=>{
  const id=(await api('',{method:'POST',body:{name:'Read'}})).data.habit.id;
  for(const day of ['2026-11-20','2026-02-30','2026-2-01','nope','0000-01-01','',null,123]) {
    assert.equal((await api('?day='+encodeURIComponent(day))).status,400,String(day));
    assert.equal((await api('/'+id+'/log',{method:'PUT',body:{day,completed:true}})).status,400,String(day));
  }
  for(const body of [{day:'2026-11-19',completed:1},{day:'2026-11-19',completed:'true'},{day:'2026-11-19'},{completed:true},{day:'2026-11-19',completed:true,count:2},null,[]]) assert.equal((await api('/'+id+'/log',{method:'PUT',body})).status,400);
  for(const body of [{},{name:''},{active:1},{active:'false'},{user_id:2},{name:'x'.repeat(81)},null,[]]) assert.equal((await api('/'+id,{method:'PATCH',body})).status,400);
  for(const bad of ['abc','0','-1','1.5','99999999999999999999999']) assert.equal((await api('/'+bad,{method:'PATCH',body:{active:false}})).status,404);
  const other=(await api('',{user:2,method:'POST',body:{name:'Timezone'}})).data.habit.id;
  assert.equal((await api('/'+other+'/log',{user:2,method:'PUT',body:{day:'2026-11-20',completed:true}})).status,200);
  await db.query('DELETE FROM habits WHERE id IN ($1,$2)',[id,other]);
});
test('habits view renders accessible checklist, date picker, suggestions and archive controls',async()=>{
  const source=fs.readFileSync(require('node:path').join(__dirname,'../public/js/views-habits.js'),'utf8');
  const root={innerHTML:'',isConnected:true,querySelectorAll:()=>[],querySelector:()=>null};
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const data={day:'2026-11-19',days:['2026-11-13','2026-11-14','2026-11-15','2026-11-16','2026-11-17','2026-11-18','2026-11-19'],summary:{active:1,completed:0,todayCompleted:0},habits:[{id:1,name:'<script>bad</script>',category:'personal',active:true,completed:false,streak:2,weekCompleted:3,history:[]}]};
  const run=new Function('$','$$','esc','escAttr','I','api','toast','shell','loadingHTML','onCleanup',source.replace(/^import[\s\S]*?from '\.\/core.js';/,'').replace('export async function viewHabits','async function viewHabits')+';return viewHabits();');
  await run(()=>null,()=>[],escape,escape,{check:'',more:'',leaf:'',plus:''},async()=>data,()=>{},()=>root,()=>'',()=>{});
  assert.match(root.innerHTML,/&lt;script&gt;bad/);
  assert.match(root.innerHTML,/type="checkbox"/);assert.match(root.innerHTML,/aria-pressed/);
  assert.match(root.innerHTML,/Archive/);assert.match(root.innerHTML,/Add habit/);assert.match(root.innerHTML,/Read Quran/);
});
test('empty account has a real seven-day window and zero progress, with account-relative today',async()=>{
  assert.equal((await api('',{user:0})).status,401);
  const r=await api();assert.equal(r.status,200);assert.deepEqual(r.data.habits,[]);
  assert.deepEqual(r.data.days,['2026-11-13','2026-11-14','2026-11-15','2026-11-16','2026-11-17','2026-11-18','2026-11-19']);
  assert.equal(r.data.day,'2026-11-19');
  assert.deepEqual(r.data.summary,{active:0,completed:0,todayCompleted:0});
  assert.equal((await api('',{user:2})).data.day,'2026-11-20');
});
