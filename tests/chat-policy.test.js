const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chatModel, lexicalHistory, settleTitle}=require('../lib/chat-policy');
test('everyday chat is fast; scholarly and deep modes retain full model across rounds',()=>{
 for(const mode of ['coach','teach','reflect']) assert.equal(chatModel({mode,deep:false,fast:'fast',full:'full'}),'fast');
 for(const mode of ['fiqh','istikhara']) assert.equal(chatModel({mode,deep:false,fast:'fast',full:'full'}),'full');
 assert.equal(chatModel({mode:'coach',deep:true,fast:'fast',full:'full'}),'full');
});
test('memory timeout retains relevant past-chat context without embeddings',()=>{
 const rows=[{content:'His brother Yusuf is getting married',title:'Family',role:'user',cid:1,created_at:'2026-11-01'},{content:'Unrelated gardening',title:'Plants',role:'user',cid:2,created_at:'2026-11-01'}];
 const hits=lexicalHistory(rows,'What about Yusuf wedding?',4);
 assert.equal(hits.length,1); assert.match(hits[0].text,/Yusuf/);
});
test('a slow title cannot hold the response open',async()=>{
 const start=Date.now(); assert.equal(await settleTitle(new Promise(()=>{}),20),''); assert.ok(Date.now()-start<300);
});
