const fs = require('node:fs/promises');
const path = require('node:path');
const TOPICS = [
  ['quran','Quran'], ['sunnah','Sunnah'], ['character','Character'],
  ['wellbeing','Wellbeing'], ['learning','Learning'], ['world','World']
].map(([id,label]) => ({id,label}));
module.exports = function registerFyp(ctx) {
  const {app,q,auth,wrap} = ctx;
  const contentPath = ctx.fypContentPath || path.join(__dirname,'../public/data/fyp-lessons.json');
  async function content() {
    try { const library=JSON.parse(await fs.readFile(contentPath,'utf8')),suppressed=ctx.fypSuppressed?await ctx.fypSuppressed():new Set();return library.concat(ctx.publishedFyp ? await ctx.publishedFyp() : []).filter(x=>!suppressed.has(x.id)); }
    catch(e) { if(e.code === 'ENOENT') return []; throw e; }
  }
  ctx.fypContent = content;
  const social = require('./fyp-social'); social.register(ctx,content);
  const defaults = () => ({bio:'',interests:[],level:'beginner',dailyGoal:3,intention:''});
  const validTopic = id => TOPICS.some(t=>t.id===id);
  const object = value => value && typeof value==='object' && !Array.isArray(value);
  async function profileFor(userId) {
    const row=(await q('SELECT * FROM learning_profiles WHERE user_id=$1',[userId])).rows[0];
    return row ? {bio:row.bio,interests:row.interests,level:row.level,dailyGoal:row.daily_goal,intention:row.intention} : defaults();
  }
  const dayString = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10);
  async function profileResponse(req) {
    const rows=(await q('SELECT * FROM fyp_progress WHERE user_id=$1',[req.user.id])).rows;
    const today=ctx.todayFor(req.user), days=new Set(rows.filter(r=>r.completed && r.completed_day).map(r=>dayString(r.completed_day)));
    let day=today,streak=0;
    const previous = d => {const date=new Date(d+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);};
    if(!days.has(day)) day=previous(day);
    while(days.has(day)){streak++;day=previous(day);}
    return {profile:await profileFor(req.user.id),stats:{completed:rows.filter(r=>r.completed).length,saved:rows.filter(r=>r.saved).length,likes:rows.filter(r=>r.liked).length,correct:rows.filter(r=>r.quiz_result?.correct).length,streak,todayCompleted:rows.filter(r=>r.completed && dayString(r.completed_day)===today).length},topics:TOPICS};
  }
  app.get('/api/learning/profile',auth,wrap(async(req,res)=>res.json(await profileResponse(req))));
  app.put('/api/learning/profile',auth,wrap(async(req,res)=>{
    const b=req.body;
    if(!object(b) || Object.keys(b).some(k=>!['bio','interests','level','dailyGoal','intention'].includes(k)) ||
      ('bio' in b && (typeof b.bio!=='string'||b.bio.length>500)) ||
      ('intention' in b && (typeof b.intention!=='string'||b.intention.length>1000)) ||
      ('interests' in b && (!Array.isArray(b.interests)||b.interests.length>6||!b.interests.every(validTopic))) ||
      ('level' in b && !['beginner','building','confident'].includes(b.level)) ||
      ('dailyGoal' in b && (!Number.isInteger(b.dailyGoal)||b.dailyGoal<1||b.dailyGoal>20))) return res.status(400).json({error:'Invalid learning profile'});
    const p={...await profileFor(req.user.id),...b};p.interests=[...new Set(p.interests)];
    await q(`INSERT INTO learning_profiles(user_id,bio,interests,level,daily_goal,intention) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(user_id) DO UPDATE SET bio=EXCLUDED.bio,interests=EXCLUDED.interests,level=EXCLUDED.level,daily_goal=EXCLUDED.daily_goal,intention=EXCLUDED.intention`,[req.user.id,p.bio,JSON.stringify(p.interests),p.level,p.dailyGoal,p.intention]);
    res.json(await profileResponse(req));
  }));
  // Who liked a post — only the post's author can see the list (TikTok/Instagram style). Avatars served as small cached URLs.
  app.get('/api/fyp/:id/likers',auth,wrap(async(req,res)=>{
    const item=(await content()).find(x=>x.id===req.params.id);if(!item)return res.status(404).json({error:'Post not found'});
    const owner=item.author?.userId||item.authorId;if(!owner||owner!==req.user.id)return res.status(403).json({error:'Only the creator can see who liked this post'});
    const rows=(await q(`SELECT u.id,p.username,COALESCE(p.display_name,u.name) AS name,(p.avatar IS NOT NULL) AS has_av,md5(COALESCE(right(p.avatar,64),'')) AS avh,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower=$2 AND f.followee=u.id) AS following
      FROM fyp_progress g JOIN users u ON u.id=g.user_id LEFT JOIN profiles p ON p.user_id=u.id
      WHERE g.lesson_id=$1 AND g.liked AND u.id<>$2 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker=$2 AND b.blocked=u.id) OR (b.blocker=u.id AND b.blocked=$2))
      ORDER BY g.liked_at DESC NULLS LAST, u.id DESC LIMIT 500`,[req.params.id,req.user.id])).rows;
    res.json({likers:rows.map(r=>({id:r.id,username:r.username,name:r.name,following:r.following,avatar:r.has_av?`/api/avatar/${r.id}?v=${String(r.avh).slice(0,8)}`:null}))});
  }));
  app.post('/api/fyp/:id/action',auth,wrap(async(req,res)=>{
    if(!(await content()).some(x=>x.id===req.params.id)) return res.status(404).json({error:'Lesson not found'});
    const b=req.body,columns={like:'liked',save:'saved',complete:'completed',hide:'hidden',repost:'reposted',share:'liked'};if(ctx.socialGraphReady)await ctx.socialGraphReady().catch(()=>{});
    if(!object(b)||!Object.hasOwn(columns,b.action)||typeof b.value!=='boolean'||Object.keys(b).some(k=>!['action','value'].includes(k))) return res.status(400).json({error:'Invalid action'});
    if(b.action==='share'){ if(!b.value)return res.status(400).json({error:'Invalid share'});await q('INSERT INTO fyp_shares(user_id,lesson_id,day) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[req.user.id,req.params.id,ctx.todayFor(req.user)]);const row=(await q('SELECT liked,saved,completed,hidden,reposted FROM fyp_progress WHERE user_id=$1 AND lesson_id=$2',[req.user.id,req.params.id])).rows[0] || {liked:false,saved:false,completed:false,hidden:false,reposted:false};return res.json({...row,counts:(await social.metrics(q,[req.params.id])).get(req.params.id)});}
    const column=columns[b.action];
    const row=(await q(`INSERT INTO fyp_progress(user_id,lesson_id,${column},completed_day${column==='liked'?',liked_at':''}${column==='reposted'?',reposted_at':''}) VALUES($1,$2,$3,$4${column==='liked'||column==='reposted'?',CASE WHEN $3 THEN now() END':''})
      ON CONFLICT(user_id,lesson_id) DO UPDATE SET ${column}=EXCLUDED.${column}${column==='liked'?',liked_at=CASE WHEN EXCLUDED.liked THEN now() ELSE NULL END':''}${column==='reposted'?',reposted_at=CASE WHEN EXCLUDED.reposted THEN now() ELSE NULL END':''}${column==='completed' ? ',completed_day=CASE WHEN EXCLUDED.completed THEN COALESCE(fyp_progress.completed_day,EXCLUDED.completed_day) ELSE NULL END' : ''}
      RETURNING liked,saved,completed,hidden,reposted`,[req.user.id,req.params.id,b.value,column==='completed'&&b.value?ctx.todayFor(req.user):null])).rows[0];
    res.json({...row,counts:(await social.metrics(q,[req.params.id])).get(req.params.id)});
  }));
  app.post('/api/fyp/:id/quiz',auth,wrap(async(req,res)=>{
    const item=(await content()).find(x=>x.id===req.params.id);
    if(!item) return res.status(404).json({error:'Lesson not found'});
    if(!item.quiz) return res.status(400).json({error:'This post has no quiz'});
    const b=req.body;
    if(!object(b)||Object.keys(b).some(k=>k!=='answer')||!Number.isInteger(b.answer)||b.answer<0||b.answer>=item.quiz.options.length) return res.status(400).json({error:'Invalid quiz answer'});
    const result={selected:b.answer,correct:b.answer===item.quiz.answer,explanation:item.quiz.explanation};
    // One atomic upsert: concurrent retries cannot overwrite or multiply a score.
    const row=(await q(`INSERT INTO fyp_progress(user_id,lesson_id,quiz_result) VALUES($1,$2,$3)
      ON CONFLICT(user_id,lesson_id) DO UPDATE SET quiz_result=COALESCE(fyp_progress.quiz_result,EXCLUDED.quiz_result) RETURNING quiz_result`,[req.user.id,item.id,JSON.stringify(result)])).rows[0];
    res.json(row.quiz_result);
  }));
  app.get('/api/fyp',auth,wrap(async(req,res)=>{
    const limit=Number(req.query.limit ?? 10),offset=Number(req.query.offset ?? 0),tab=req.query.tab || 'for-you',topic=req.query.topic || 'all',format=req.query.format || 'all',post=req.query.post || '';const idList=String(req.query.ids||'').split(',').map(x=>x.trim()).filter(x=>x&&x.length<=120).slice(0,120);const idSet=new Set(idList);
    if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0||offset>10000||!['for-you','saved','following'].includes(tab)||(topic!=='all'&&!validTopic(topic))||!['all','reel','carousel','image'].includes(format)||(post && (typeof post!=='string'||post.length>150))) return res.status(400).json({error:'Invalid feed filters'});
    if(ctx.socialGraphReady)await ctx.socialGraphReady().catch(()=>{});
    const progress=new Map((await q('SELECT * FROM fyp_progress WHERE user_id=$1',[req.user.id])).rows.map(r=>[r.lesson_id,r]));
    const library=await content(),profile=await profileFor(req.user.id),totals=await social.metrics(q,library.map(x=>x.id));
    const followed=new Set((await q('SELECT followee FROM follows WHERE follower=$1',[req.user.id]).catch(()=>({rows:[]}))).rows.map(r=>r.followee));
    // Personal affinity from the viewer's own watch time (topics + creators), not just likes.
    const watched=(await q(`SELECT lesson_id,watched_ms,duration_ms,completed FROM fyp_views WHERE user_id=$1 AND last_seen_at>now()-interval '60 days'`,[req.user.id])).rows;
    const byId=new Map(library.map(x=>[x.id,x])),topicW={},creatorW={},seen=new Set();
    for(const v of watched){const x=byId.get(v.lesson_id);if(!x)continue;seen.add(x.id);const r=Math.min(1.5,(+v.watched_ms||0)/Math.max(4000,+v.duration_ms||0));topicW[x.topic]=(topicW[x.topic]||0)+r;const a=x.author?.userId;if(a)creatorW[a]=(creatorW[a]||0)+r;}
    for(const [id,p] of progress){const x=byId.get(id);if(!x)continue;if(p.liked)topicW[x.topic]=(topicW[x.topic]||0)+1;if(p.liked&&x.author?.userId)creatorW[x.author.userId]=(creatorW[x.author.userId]||0)+1.5;}
    const topicTotal=Object.values(topicW).reduce((a,b)=>a+b,0)||1;
    // Respect each post's own visibility: private = only the author; followers = author's followers only. Blocked users never see each other.
    const blockedIds=new Set((await q('SELECT blocked u FROM user_blocks WHERE blocker=$1 UNION SELECT blocker FROM user_blocks WHERE blocked=$1',[req.user.id]).catch(()=>({rows:[]}))).rows.map(r=>r.u));
    const canSee=x=>{const a=x.author?.userId;if(!a||a===req.user.id)return true;if(blockedIds.has(a))return false;if(x.visibility==='private')return false;if(x.visibility==='followers')return followed.has(a);return true;};
    const allowed=library.filter(canSee).filter(x=>(idList.length?idSet.has(x.id):post?x.id===post:(topic==='all'||x.topic===topic)&&(format==='all'||x.format===format)&&(tab==='saved'?progress.get(x.id)?.saved:tab==='following'?followed.has(x.author?.userId):!progress.get(x.id)?.hidden)));
    const key=idList.length?'ids:'+require('crypto').createHash('sha1').update(idList.join(',')).digest('hex').slice(0,16):`${tab}:${topic}:${format}:${post}`;
    let ids;
    if(offset>0)ids=(await q('SELECT lesson_ids FROM fyp_feed_orders WHERE user_id=$1 AND feed_key=$2',[req.user.id,key])).rows[0]?.lesson_ids;
    if(!ids){
      const now=Date.now();
      if(idList.length){const ok=new Set(allowed.map(x=>x.id));ids=idList.filter(id=>ok.has(id));}
      else if(tab==='following'){ids=allowed.map(x=>({id:x.id,t:Date.parse(x.publishedAt||0)||0})).sort((a,b)=>b.t-a.t).map(x=>x.id);}
      else{
        const ranked=allowed.map((x,i)=>{const p=progress.get(x.id),ageH=x.publishedAt?(now-Date.parse(x.publishedAt))/36e5:2000;
          const score=social.scorePost(totals.get(x.id))
            +(topicW[x.topic]||0)/topicTotal*30+(profile.interests.includes(x.topic)?12:0)
            +Math.min(20,(creatorW[x.author?.userId]||0)*4)+(followed.has(x.author?.userId)?10:0)
            +(x.ugc?Math.max(0,18-ageH/8):0)                       // freshness for new member posts
            -(seen.has(x.id)?25:0)-(p?.completed?60:0)
            +Math.random()*8;                                       // light exploration so feeds don't freeze
          return {id:x.id,topic:x.topic,author:x.author?.userId||'shukr',i,score};});
        ids=[];const topicCount={},authorCount={};
        while(ranked.length){ranked.sort((a,b)=>(b.score-(topicCount[b.topic]||0)*8-(authorCount[b.author]||0)*10)-(a.score-(topicCount[a.topic]||0)*8-(authorCount[a.author]||0)*10)||a.i-b.i);const x=ranked.shift();ids.push(x.id);topicCount[x.topic]=(topicCount[x.topic]||0)+1;authorCount[x.author]=(authorCount[x.author]||0)+1;}
      }
      await q('INSERT INTO fyp_feed_orders(user_id,feed_key,lesson_ids) VALUES($1,$2,$3) ON CONFLICT(user_id,feed_key) DO UPDATE SET lesson_ids=EXCLUDED.lesson_ids',[req.user.id,key,JSON.stringify(ids)]);
    }
    const allowedById=new Map(allowed.map(x=>[x.id,x]));ids=ids.filter(id=>allowedById.has(id));
    const page=ids.slice(offset,offset+limit);
    const authors=[...new Set(page.map(id=>allowedById.get(id).author?.userId).filter(Boolean))];
    const prof=authors.length?new Map((await q('SELECT user_id,username,display_name,avatar FROM profiles WHERE user_id=ANY($1)',[authors]).catch(()=>q('SELECT user_id,username,display_name FROM profiles WHERE user_id=ANY($1)',[authors])).catch(()=>({rows:[]}))).rows.map(r=>[r.user_id,r])):new Map();
    const items=page.map(id=>{const item=allowedById.get(id),p=progress.get(id),au=item.author||{name:'Shukr Learning',editorial:true},pr=au.userId?prof.get(au.userId):null;return {
      id:item.id,topic:item.topic,title:item.title,hook:item.hook,body:item.body,publishedAt:item.publishedAt||null,
      takeaway:item.takeaway,durationSeconds:item.durationSeconds,sources:item.sources,format:item.format || 'image',media:item.media || null,
      author:au.userId?{...au,username:pr?.username||au.username,name:pr?.display_name||au.name,avatar:pr?.avatar||null,isFollowing:followed.has(au.userId),me:au.userId===req.user.id}:au,
      authorId:item.authorId,counts:totals.get(id),silent:false,
      quiz:item.quiz?{question:item.quiz.question,options:item.quiz.options}:null,ugc:!!item.ugc,
      liked:!!p?.liked,saved:!!p?.saved,completed:!!p?.completed,reposted:!!p?.reposted,quizResult:p?.quiz_result || null
    };});
    // Sponsored slots: one ad after every N organic posts (none for No-Ads subscribers or in Saved / deep links).
    let out=items;
    if(ctx.pickAds&&tab!=='saved'&&!post&&items.length){
      const every=ctx.adEvery||6,slots=Math.floor((offset+items.length)/every)-Math.floor(offset/every);
      const ads=slots>0?await ctx.pickAds(req.user,slots):[];
      if(ads.length){out=[];let k=0;items.forEach((x,i)=>{out.push(x);if((offset+i+1)%every===0&&ads[k]){out.push({...ads[k],nextTo:x.ugc?x.id:null});k++;}});}
    }
    const nextOffset=Math.min(offset+limit,ids.length);
    res.json({items:out,hasMore:nextOffset<ids.length,nextOffset,total:ids.length,topics:TOPICS});
  }));
};
