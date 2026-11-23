const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
test('scheduled prayers and gratitude retry zero-acceptance and deduplicate accepted pushes',async()=>{
  let sends=0,attempts=0;const keys=new Set(),payloads=[];const user={id:9,settings:{tz:'Asia/Colombo',reminders:{prayers:true,blessings:true,blessingTimes:['13:00'],morning:false,evening:false,journal:false,streak:false,sleep:false,friday:false,akhirah:false,quran:false,hifz:false}}};
  const q=async(sql,args)=>{
    if(sql.startsWith('SELECT DISTINCT u'))return {rows:[user]};
    if(sql.startsWith('SELECT endpoint'))return {rows:[{endpoint:'test',sub:{}}]};
    if(sql.startsWith('SELECT text'))return {rows:[{text:'A meal with my family',d:'2026-11-18'}]};
    if(sql.startsWith('INSERT INTO reminders_sent')){const k=args.join(':');if(keys.has(k))return {rows:[]};keys.add(k);return {rows:[{key:args[1]}]};}
    if(sql.startsWith('DELETE FROM reminders_sent WHERE user_id')){keys.delete(args.join(':'));return {rows:[]};}
    return {rows:[]};
  };
  const c={module:{exports:{}},__dirname:path.join(__dirname,'../lib'),console,process:{env:{VAPID_PUBLIC_KEY:'test',VAPID_PRIVATE_KEY:'test'}},setInterval:()=>0,require:n=>n==='web-push'?{setVapidDetails(){},sendNotification:async(sub,p)=>{attempts++;if(attempts<=2)throw {statusCode:503};sends++;payloads.push(JSON.parse(p));}}:require(n)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/reminders.js'),'utf8'),c);
  const ctx={app:{post(){}},q,auth(){},wrap:f=>f,dbReady:()=>true,defaultSettings:()=>({reminders:{}}),localParts:()=>({day:'2026-11-19',hh:13,mm:0,weekday:'Thu'}),todayFor:()=> '2026-11-19',computeStats:async()=>({streaks:{}}),prayerTimesFor:async()=>({dhuhr:new Date(Date.now()-1000)})};
  c.module.exports(ctx);await ctx.initPush();await ctx.reminderTick();assert.equal(sends,0);assert.equal(keys.size,0);await ctx.reminderTick();assert.equal(sends,2);assert.equal(keys.size,2);await ctx.reminderTick();assert.equal(sends,2);assert(payloads.some(p=>/Dhuhr/.test(p.title)));assert(payloads.some(p=>/family/.test(p.body)));for(const p of payloads){assert.equal(p.silent,false);assert.equal(p.audio,undefined);}assert(payloads.some(p=>p.urgency==='high'));
});
