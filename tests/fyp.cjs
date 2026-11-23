const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
let db, server, base, dir, contentPath;
const topics = ['quran','sunnah','character','wellbeing','learning','world'];
const lessons = Array.from({length:24}, (_,i) => ({id:`lesson-${i}`,topic:topics[i%6],title:`Title ${i}`,hook:'Hook',body:'Body',takeaway:'Takeaway',durationSeconds:30,sources:[{title:'Source',url:'https://example.org'}],quiz:{question:'Question?',options:['Yes','No'],answer:0,explanation:'Because'}}));
async function api(route, {user=1, method='GET', body}={}) {
  const r = await fetch(base+route,{method,headers:{...(user?{'authorization':`Bearer ${user}`} : {}),...(body!==undefined?{'content-type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text(); let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};
}
before(async()=>{
  db = new PGlite();
  await db.exec('CREATE TABLE users(id INT PRIMARY KEY); INSERT INTO users VALUES(1),(2);');
  // An absent feature is a readable failing assertion, not a module-loader error.
  assert.ok(require('node:fs').existsSync(path.join(__dirname,'../lib/schema-fyp.js')), 'FYP migration exists');
  await db.exec(require('../lib/schema-fyp'));
  await db.exec(require('../lib/schema-fyp-social'));
  await db.exec(require('../lib/schema-fyp'));
  await db.exec(require('../lib/schema-fyp-social'));
  dir = await fs.mkdtemp(path.join(process.env.TMPDIR || os.tmpdir(),'shukr-fyp-'));
  contentPath = path.join(dir,'lessons.json'); await fs.writeFile(contentPath,JSON.stringify(lessons));
  const app=express(); app.use(express.json());
  require('../lib/fyp')({app,q:(sql,p)=>db.query(sql,p),fypContentPath:contentPath,
    auth:(req,res,next)=>{const id=Number(req.headers.authorization?.replace('Bearer ','')); if(![1,2].includes(id)) return res.status(401).json({error:'auth'});req.user={id,settings:{tz:'UTC'}};next();},
    wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),todayFor:()=> '2026-11-19'});
  app.use((e,req,res,next)=>res.status(e.status || 500).json({error:e.message}));
  server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r)); base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{if(server) await new Promise(r=>server.close(r)); if(db) await db.close();if(dir) await fs.rm(dir,{recursive:true,force:true});});
test('private profile validates fields and stays isolated per account',async()=>{
  const profile={bio:'Private bio',interests:['world','quran'],level:'building',dailyGoal:5,intention:'Learn daily'};
  assert.equal((await api('/api/learning/profile',{user:null})).status,401);
  const saved=await api('/api/learning/profile',{method:'PUT',body:profile});assert.equal(saved.status,200);assert.deepEqual(saved.data.profile,profile);
  assert.deepEqual((await api('/api/learning/profile')).data.profile,profile);
  assert.equal((await api('/api/learning/profile',{user:2})).data.profile.bio,'');
  for(const body of [{dailyGoal:0},{dailyGoal:21},{dailyGoal:'3'},{interests:['invalid']},{level:'expert'},{bio:7},{intention:'x'.repeat(1001)},null,[],{unknown:1}]) assert.equal((await api('/api/learning/profile',{method:'PUT',body})).status,400,JSON.stringify(body));
  assert.deepEqual((await api('/api/learning/profile')).data.stats,{completed:0,saved:0,likes:0,correct:0,streak:0,todayCompleted:0});
});
test('actions persist per account with idempotent completion and immutable quiz results',async()=>{
  const action=(id,action,value=true,user=1)=>api(`/api/fyp/${id}/action`,{method:'POST',user,body:{action,value}});
  assert.equal((await action('lesson-0','like',true,null)).status,401);
  assert.equal((await action('missing','like')).status,404);
  for(const body of [{action:'swipe',value:true},{action:'like',value:1},{action:'save'},{}]) assert.equal((await api('/api/fyp/lesson-0/action',{method:'POST',body})).status,400);
  for(const type of ['like','save','complete']) assert.equal((await action('lesson-0',type)).status,200);
  await action('lesson-0','complete');
  let stats=(await api('/api/learning/profile')).data.stats;assert.equal(stats.completed,1);assert.equal(stats.todayCompleted,1);assert.equal(stats.streak,1);assert.equal(stats.likes,1);assert.equal(stats.saved,1);
  assert.equal((await api('/api/learning/profile',{user:2})).data.stats.completed,0);
  for(const answer of [-1,2,'0',null,0.5]) assert.equal((await api('/api/fyp/lesson-0/quiz',{method:'POST',body:{answer}})).status,400);
  const wrong=await api('/api/fyp/lesson-0/quiz',{method:'POST',body:{answer:1}});assert.deepEqual(wrong.data,{selected:1,correct:false,explanation:'Because'});
  const retry=await api('/api/fyp/lesson-0/quiz',{method:'POST',body:{answer:0}});assert.deepEqual(retry.data,wrong.data);
  assert.equal((await api('/api/learning/profile')).data.stats.correct,0);
  const answers=await Promise.all([0,1,0,1].map(answer=>api('/api/fyp/lesson-1/quiz',{method:'POST',body:{answer}})));answers.forEach(r=>assert.deepEqual(r.data,answers[0].data));
  const feed=(await api('/api/fyp?limit=30')).data.items;const item=feed.find(x=>x.id==='lesson-0');assert.equal(item.saved,true);assert.deepEqual(item.quizResult,wrong.data);assert.equal(item.quiz.answer,undefined);
  await action('lesson-0','save',false);assert.equal((await api('/api/learning/profile')).data.stats.saved,0);
});
test('feed requires authentication and returns sanitized paginated lessons',async()=>{
  assert.equal((await api('/api/fyp',{user:null})).status,401);
  const r=await api('/api/fyp?limit=10',{user:2}); assert.equal(r.status,200);
  assert.equal(r.data.items.length,10);assert.equal(r.data.total,24);assert.equal(r.data.nextOffset,10); assert.equal(r.data.hasMore,true);
  assert.deepEqual(r.data.topics.map(x=>x.id),topics);
  for(const item of r.data.items){assert.equal(item.quiz.answer,undefined);assert.equal(item.quiz.explanation,undefined);assert.equal(item.quizResult,null);assert.equal(item.completed,false);}
});
test('feed pagination, filtering, saved shelf and hidden lessons are real',async()=>{
  const first=(await api('/api/fyp?limit=10',{user:2})).data;
  const second=(await api('/api/fyp?limit=10&offset=10',{user:2})).data;
  assert.equal(second.nextOffset,20);assert.equal(second.items.length,10);assert.ok(second.items.every(x=>!first.items.some(y=>y.id===x.id)));
  const end=(await api('/api/fyp?limit=10&offset=20',{user:2})).data;assert.equal(end.items.length,4);assert.equal(end.hasMore,false);
  const topic=(await api('/api/fyp?topic=world&limit=30',{user:2})).data;assert.equal(topic.items.length,4);assert.ok(topic.items.every(x=>x.topic==='world'));
  await api('/api/fyp/lesson-5/action',{user:2,method:'POST',body:{action:'save',value:true}});
  let saved=(await api('/api/fyp?tab=saved',{user:2})).data;assert.deepEqual(saved.items.map(x=>x.id),['lesson-5']);
  await api('/api/fyp/lesson-5/action',{user:2,method:'POST',body:{action:'hide',value:true}});
  assert.ok(!(await api('/api/fyp?limit=30',{user:2})).data.items.some(x=>x.id==='lesson-5'));
  assert.equal((await api('/api/fyp?tab=saved',{user:2})).data.items[0].id,'lesson-5');
  for(const query of ['limit=-2','offset=-1','offset=1.2','limit=potato','topic=invalid','tab=bad'])assert.equal((await api('/api/fyp?'+query)).status,400,query);
});
