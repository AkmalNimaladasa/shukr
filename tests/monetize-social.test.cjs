const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const express=require('express');const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
let db,server,base,dir,ctx;
const JPG=Buffer.concat([Buffer.from([0xFF,0xD8,0xFF,0xE0]),Buffer.alloc(200,7)]);
const MP4=Buffer.concat([Buffer.from([0,0,0,0x18]),Buffer.from('ftypisom'),Buffer.alloc(4000,1)]);
const USERS={1:{id:1,name:'Dev',email:'akmal.yasaz@gmail.com'},2:{id:2,name:'Creator Cat',email:'cat@x.io'},3:{id:3,name:'Viewer Vee',email:'vee@x.io'}};
before(async()=>{
 delete process.env.PAYHERE_MERCHANT_ID;process.env.CREATOR_MIN_FOLLOWERS='1';process.env.CREATOR_MIN_VIEWS_28D='0';process.env.CREATOR_MIN_POSTS='1';process.env.AD_EVERY='2';
 db=new PGlite();await db.exec("CREATE TABLE users(id INT PRIMARY KEY,name TEXT,email TEXT,pass TEXT,created_at TIMESTAMPTZ DEFAULT now());INSERT INTO users(id,name,email,pass) VALUES(1,'Dev','akmal.yasaz@gmail.com','x'),(2,'Creator Cat','cat@x.io','x'),(3,'Viewer Vee','vee@x.io','x');CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INT);CREATE TABLE profiles(user_id INT PRIMARY KEY,username TEXT UNIQUE,display_name TEXT,bio TEXT,avatar TEXT,is_admin BOOLEAN DEFAULT false,banned BOOLEAN DEFAULT false);CREATE TABLE follows(follower INT,followee INT,created_at TIMESTAMPTZ DEFAULT now(),PRIMARY KEY(follower,followee));");
 for(const s of ['schema-fyp','schema-fyp-social','schema-social-hub'])await db.exec(require('../lib/'+s));
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'shukr-mon-'));
 const app=express();app.use((req,res,next)=>req.path==='/api/social/media'?next():express.json()(req,res,next));
 ctx={app,todayFor:()=>'2026-11-20',q:(s,p)=>db.query(s,p),uploadDir:dir,dbReady:()=>true,hashPass:p=>'h:'+p,newSession:async()=>{},auth:(req,res,next)=>{const u=USERS[+req.headers['x-user']];if(!u)return res.status(401).json({error:'auth'});req.user=u;next();},wrap:f=>(req,res,next)=>Promise.resolve(f(req,res,next)).catch(next)};
 require('../lib/fyp')(ctx);require('../lib/social-hub')(ctx);require('../lib/social-uploads')(ctx);require('../lib/social-graph')(ctx);require('../lib/monetize')(ctx);require('../lib/password-reset')(ctx);
 app.use((e,req,res,next)=>{console.error(e);res.status(500).json({error:e.message});});server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.close();if(dir)fs.rmSync(dir,{recursive:true,force:true});});
const up=(buf,type,user)=>fetch(base+'/api/social/media',{method:'POST',headers:{'x-user':String(user),'content-type':type},body:buf}).then(r=>r.json());
const api=(p,{user=1,method,body}={})=>fetch(base+p,{method:method||(body?'POST':'GET'),headers:{'x-user':String(user),'content-type':'application/json'},body:body&&JSON.stringify(body)}).then(async r=>({status:r.status,data:await r.json().catch(()=>({}))}));
let postId;
test('profiles: follow, follower and like counts, Following feed, reposts with privacy',async()=>{
 const m=await up(MP4,'video/mp4',2);const p=await api('/api/social/posts',{user:2,body:{mediaIds:[m.media.id],caption:'Sunrise',rightsConfirmed:true}});assert.equal(p.status,201);postId=p.data.publication.id;
 const cat=(await api('/api/social/profile',{user:2})).data.profile;assert.ok(cat.username);
 assert.equal((await api('/api/social/follow/'+cat.username,{user:3,body:{}})).data.following,true);
 assert.equal((await api(`/api/fyp/${postId}/action`,{user:3,body:{action:'like',value:true}})).status,200);
 assert.equal((await api(`/api/fyp/${postId}/action`,{user:3,body:{action:'repost',value:true}})).status,200);
 const view=(await api('/api/social/profile/'+cat.username,{user:3})).data;assert.equal(view.profile.followers,1);assert.equal(view.profile.likes,1);assert.equal(view.profile.isFollowing,true);assert.equal(view.posts.length,1);
 const following=(await api('/api/fyp?tab=following',{user:3})).data;assert.deepEqual(following.items.map(x=>x.id),[postId]);assert.equal(following.items[0].author.isFollowing,true);
 const vee=(await api('/api/social/profile',{user:3})).data;assert.equal(vee.reposts.length,1);
 assert.equal((await api('/api/social/privacy',{user:3,method:'PUT',body:{show_reposts:false}})).data.privacy.show_reposts,false);
 assert.equal((await api('/api/social/profile/'+vee.profile.username,{user:2})).data.reposts,null);
 assert.equal((await api('/api/social/profile/'+vee.profile.username,{user:3})).data.reposts.length,1);
});
test('tapping a creator name works: posting creates a real profile matching the post handle',async()=>{
 await db.query("INSERT INTO users(id,name,email,pass) VALUES(4,'Yusuf Creator','y@x.io','x')");USERS[4]={id:4,name:'Yusuf Creator',email:'y@x.io'};
 const m=await up(JPG,'image/jpeg',4);const p=await api('/api/social/posts',{user:4,body:{mediaIds:[m.media.id],caption:'Hi',rightsConfirmed:true}});
 const handle=p.data.publication.author.username;assert.ok(handle);
 const r=await api('/api/social/profile/'+handle,{user:3});assert.equal(r.status,200);assert.equal(r.data.profile.name,'Yusuf Creator');assert.equal(r.data.posts.length,1);
 // legacy post with a guessed handle and no profile is repaired on first visit
 await db.query("INSERT INTO users(id,name,email,pass) VALUES(5,'Old Poster','o@x.io','x')");
 await db.query(`INSERT INTO fyp_publications(id,user_id,content) VALUES('post-legacy',5,$1)`,[JSON.stringify({id:'post-legacy',ugc:true,format:'image',media:{src:'/ugc/x.jpg'},topic:'wellbeing',title:'t',hook:'h',body:'b',author:{userId:5,name:'Old Poster',username:'oldposter'}})]);
 const old=await api('/api/social/profile/oldposter',{user:3});assert.equal(old.status,200);assert.equal(old.data.profile.userId,5);
});
test('subscriptions: memory/no-ads checkouts are demo-only for non-admins; developer can complete them',async()=>{
 const s=await api('/api/pay/subscribe',{user:3,body:{plan:'memory'}});assert.equal(s.status,200);assert.equal(s.data.demo,true);assert.equal(s.data.canComplete,false);
 assert.equal((await api('/api/pay/demo/complete',{user:3,body:{orderId:s.data.orderId}})).status,403);
 assert.equal(await ctx.hasPlan(USERS[3],'memory'),false);
 assert.equal(await ctx.hasPlan(USERS[1],'memory'),false); // premium only for payers (developer too)
 const ds=await api('/api/pay/subscribe',{user:1,body:{plan:'noads'}});assert.equal(ds.data.canComplete,true);assert.equal((await api('/api/pay/demo/complete',{user:1,body:{orderId:ds.data.orderId}})).status,200);assert.equal(await ctx.hasPlan(USERS[1],'noads'),true);
 await db.query("UPDATE payments SET user_id=1 WHERE order_id=$1",[s.data.orderId]);
 assert.equal((await api('/api/pay/demo/complete',{user:1,body:{orderId:s.data.orderId}})).status,200);
 assert.equal((await db.query("SELECT count(*)::int n FROM subscriptions WHERE user_id=1 AND plan='memory'")).rows[0].n,1);
});
test('ads: advertiser campaign → paid → approved → served in feed → impression pays creator; no-ads plan hides ads',async()=>{
 const m=await up(JPG,'image/jpeg',3);
 const c=await api('/api/ads/campaigns',{user:3,body:{brand:'Halal Eats',headline:'Fresh halal meals delivered',link:'https://example.com',budgetUsd:20,mediaId:m.media.id}});assert.equal(c.status,201);assert.equal(c.data.impressions,4000);
 assert.equal((await api('/api/ads/campaigns/'+c.data.campaignId+'/checkout',{user:3,body:{}})).status,200);
 await db.query("UPDATE ad_campaigns SET status='review' WHERE id=$1",[c.data.campaignId]);
 assert.equal((await api('/api/admin/campaigns/'+c.data.campaignId,{user:3,body:{action:'approve'}})).status,403);
 assert.equal((await api('/api/admin/campaigns/'+c.data.campaignId,{user:1,body:{action:'approve'}})).data.status,'active');
 const m2=await up(JPG,'image/jpeg',2);await api('/api/social/posts',{user:2,body:{mediaIds:[m2.media.id],caption:'Second',rightsConfirmed:true}});
 assert.equal((await api('/api/creator/join',{user:2,body:{}})).status,200);
 const feed=(await api('/api/fyp?limit=10',{user:3})).data.items;const ad=feed.find(x=>x.sponsored);assert.ok(ad,'ad served');assert.equal(ad.ad.brand,'Halal Eats');
 assert.equal((await api('/api/ads/'+ad.id+'/impression',{user:3,body:{nextTo:postId}})).status,200);
 assert.equal((await api('/api/ads/'+ad.id+'/impression',{user:3,body:{nextTo:postId}})).status,200);
 const cr=(await api('/api/creator',{user:2})).data;assert.equal(cr.adImpressions,1);assert.ok(cr.adUsd>=0);
 const camp=(await api('/api/ads/campaigns',{user:3})).data.campaigns[0];assert.equal(camp.impressions,1);
 await db.query("INSERT INTO subscriptions(user_id,plan,active_until) VALUES(3,'noads',now()+interval '1 month')");
 await db.query('DELETE FROM ad_impressions');await db.query('DELETE FROM fyp_feed_orders');
 assert.equal((await api('/api/fyp?limit=10',{user:3})).data.items.some(x=>x.sponsored),false);
});
test('gifts need coins; developer dashboard is restricted and reports totals',async()=>{
 assert.equal((await api('/api/gifts',{user:3,body:{gift:'rose',postId}})).status,402);
 await db.query('INSERT INTO coin_wallets(user_id,coins) VALUES(3,10)');
 const g=await api('/api/gifts',{user:3,body:{gift:'dates',postId}});assert.equal(g.status,200);assert.equal(g.data.coins,5);
 assert.equal((await api('/api/admin/dashboard',{user:2})).status,403);
 const d=(await api('/api/admin/dashboard?demo=1',{user:1})).data;assert.equal(d.users.total,5);assert.ok(d.subs.some(s=>s.plan==='noads'));assert.ok(d.revenue.subs>=8);assert.ok(Array.isArray(d.series)&&d.series.length===30);
});
test('password reset: refuses without email config, verifies hashed code, limits attempts',async()=>{
 delete process.env.SMTP_USER;
 assert.equal((await api('/api/password/forgot',{user:0,body:{email:'vee@x.io'}})).status,503);
 await db.query("CREATE TABLE IF NOT EXISTS password_resets(email TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,attempts INT NOT NULL DEFAULT 0,sent_count INT NOT NULL DEFAULT 1,window_start TIMESTAMPTZ NOT NULL DEFAULT now())");
 const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
 await db.query("INSERT INTO password_resets(email,code_hash,expires_at) VALUES('vee@x.io',$1,now()+interval '10 minutes')",[sha('vee@x.io:123456')]);
 assert.equal((await api('/api/password/reset',{user:0,body:{email:'vee@x.io',code:'000000',password:'newpass1'}})).status,400);
 assert.equal((await api('/api/password/reset',{user:0,body:{email:'vee@x.io',code:'123456',password:'newpass1'}})).status,200);
 assert.equal((await db.query("SELECT pass FROM users WHERE id=3")).rows[0].pass,'h:newpass1');
 assert.equal((await api('/api/password/reset',{user:0,body:{email:'vee@x.io',code:'123456',password:'again12'}})).status,400);
});
