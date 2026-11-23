/* INTEGRATION (parent-owned files only):
 * 1. Execute require('./lib/schema-social-hub') after schema2/schema-fyp-social.
 * 2. Set ctx.fypContent = async () => [...staticLessons, ...publicationRows.map(r=>r.content)]
 *    (read fyp_publications on every content refresh), then require('./lib/social-hub')(ctx).
 * 3. Import viewSocialHub from ./views-social-hub.js in app.js; route
 *    /explore,/stories,/create,/activity,/messages to viewSocialHub(section,query).
 * 4. Import public/social-hub.css in the bundle's stylesheet entry; run bash build.sh.
 * All routes use existing auth/wrap. Existing same-origin CSRF middleware must remain.
 * No external uploads, AI calls, copied branding, music, or arbitrary media URLs.
 */
const { randomUUID } = require('crypto');
const library = require('../public/data/fyp-lessons.json');
const clean = (v,n) => typeof v === 'string' ? v.trim().slice(0,n) : '';
const safeMedia = s => typeof s === 'string' && /^\/media\/(fyp|house)\/[a-zA-Z0-9_./-]+$/.test(s) && !s.includes('..');
module.exports = function registerSocialHub(ctx) {
  const { app,q,auth,wrap } = ctx;
  ctx.fypSuppressed = async () => new Set((await q('SELECT lesson_id FROM social_takedowns')).rows.map(r=>r.lesson_id));
  ctx.publishedFyp = async () => (await q('SELECT content FROM fyp_publications ORDER BY published_at DESC')).rows.map(r=>r.content);
  const publicLesson = x => ({...x,quiz:x.quiz ? {question:x.quiz.question,options:x.quiz.options} : null});
  const adminEmails = (process.env.NODE_ENV === 'test' && process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.toLowerCase().split(',').map(s => s.trim()) : ['akmal.yasaz@gmail.com']);
  const profile = async uid => (await q('SELECT user_id,username,display_name,is_admin,banned FROM profiles WHERE user_id=$1',[uid])).rows[0];
  async function canPublish(user) { const p=await profile(user.id); return !p?.banned && ((process.env.NODE_ENV === 'test' && !!p?.is_admin) || adminEmails.includes(String(user.email||'').toLowerCase())); }
  const err = (res,status,error) => res.status(status).json({error});
  async function source(req,res) {
    if (!await canPublish(req.user)) { err(res,403,'Publishing is restricted to Shukr administrators.'); return null; }
    if (req.body.rightsConfirmed !== true) { err(res,400,'Confirm that you have rights to your original caption.'); return null; }
    const x=library.find(x=>x.id===req.body.lessonId);
    if (!x || !safeMedia(x.media?.src) || (x.media?.poster && !safeMedia(x.media.poster)) || (x.media?.slides||[]).some(s=>!safeMedia(s.src))) { err(res,400,'Select original media from the Shukr lesson library.'); return null; }
    return x;
  }
  const route = (method,path,fn) => app[method]('/api/social'+path,auth,wrap(fn));
  route('post','/reports',async(req,res)=>{
    const b=req.body||{};if(typeof b.lessonId!=='string'||b.lessonId.length>150||!['copyright','misinformation','abuse','other'].includes(b.reason)||typeof b.details!=='string'||b.details.trim().length<10||b.details.length>2000)return err(res,400,'Choose a reason and provide 10–2000 characters of context.');
    const all=ctx.fypContent?await ctx.fypContent():[...library,...await ctx.publishedFyp()];if(!all.some(x=>x.id===b.lessonId))return err(res,404,'Post not found.');
    const recent=(await q("SELECT count(*)::int n FROM social_reports WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[req.user.id])).rows[0].n;if(recent>=10)return err(res,429,'Please wait before submitting another report.');
    const report=(await q('INSERT INTO social_reports(user_id,lesson_id,reason,details) VALUES($1,$2,$3,$4) RETURNING id,status',[req.user.id,b.lessonId,b.reason,b.details.trim()])).rows[0];res.status(201).json({report});
  });
  route('get','/reports',async(req,res)=>{if(!await canPublish(req.user))return err(res,403,'Administrator access required.');res.json({reports:(await q("SELECT id,lesson_id,reason,details,status,created_at FROM social_reports ORDER BY created_at DESC LIMIT 200")).rows});});
  route('post','/reports/:id/resolve',async(req,res)=>{if(!await canPublish(req.user))return err(res,403,'Administrator access required.');if(!/^\d{1,9}$/.test(req.params.id)||!['remove','dismiss'].includes(req.body?.resolution))return err(res,400,'Invalid review.');const report=(await q('SELECT * FROM social_reports WHERE id=$1',[+req.params.id])).rows[0];if(!report)return err(res,404,'Report not found.');if(req.body.resolution==='remove')await q('INSERT INTO social_takedowns(lesson_id,reviewer) VALUES($1,$2) ON CONFLICT DO NOTHING',[report.lesson_id,req.user.id]);await q('UPDATE social_reports SET status=$2 WHERE id=$1',[report.id,req.body.resolution==='remove'?'removed':'dismissed']);res.json({ok:true});});
  route('get','/permissions',async(req,res)=>res.json({canPublish:await canPublish(req.user)}));
  route('get','/explore',async(req,res)=>{
    const query=clean(req.query.q,120).toLowerCase(), format=clean(req.query.format,20);
    const all=ctx.fypContent ? await ctx.fypContent() : [...library,...(await q('SELECT content FROM fyp_publications ORDER BY published_at DESC')).rows.map(r=>r.content)];
    const suppressed=await ctx.fypSuppressed();const rows=(Array.isArray(all)?all:(all.items||[])).filter(x=>!suppressed.has(x.id));
    const items=rows.filter(x=>(!format||format==='all'||x.format===format)&&(!query||[x.title,x.body,x.hook,x.topic].join(' ').toLowerCase().includes(query))).slice(0,200);
    res.json({items:items.map(publicLesson),search:query,library:library.map(x=>({id:x.id,title:x.title,topic:x.topic,format:x.format,media:x.media}))});
  });
  route('post','/publish',async(req,res)=>{
    const x=await source(req,res);if(!x)return;
    const title=clean(req.body.title,120), body=clean(req.body.body,2000);
    if(title.length<3||body.length<21)return err(res,400,'Use a title (3–120 characters) and an original caption (21–2000 characters).');
    // Preserve the source teaching/quiz/attribution. The new text is explicitly a reflection,
    // not a replacement for the source lesson or a quotation from its cited source.
    const id='post-'+randomUUID();
    const content={...x,id,title,hook:body,body:`Editorial reflection: ${body}\n\nOriginal lesson — ${x.title}\n${x.body}`,authorId:req.user.id,sourceLessonId:x.id,editorialCaption:body,publishedAt:new Date().toISOString()};
    await q('INSERT INTO fyp_publications(id,user_id,content) VALUES($1,$2,$3)',[id,req.user.id,JSON.stringify(content)]);
    const saved=(await q('SELECT content FROM fyp_publications WHERE id=$1',[id])).rows[0];
    res.status(201).json({publication:publicLesson(saved.content)});
  });
  route('get','/stories',async(req,res)=>res.json({stories:(await q(`SELECT id,lesson_id,caption,content,created_at,expires_at FROM social_stories WHERE expires_at>now() AND lesson_id NOT IN(SELECT lesson_id FROM social_takedowns) ORDER BY created_at DESC LIMIT 100`)).rows.map(s=>({...s,content:publicLesson(s.content)}))}));
  route('post','/stories',async(req,res)=>{
    const x=await source(req,res);if(!x)return;
    const caption=clean(req.body.caption,500);if(!caption)return err(res,400,'Add an original story caption.');
    const id='story-'+randomUUID();
    await q('INSERT INTO social_stories(id,user_id,lesson_id,caption,content) VALUES($1,$2,$3,$4,$5)',[id,req.user.id,x.id,caption,JSON.stringify(x)]);
    const story=(await q('SELECT id,lesson_id,caption,content,created_at,expires_at FROM social_stories WHERE id=$1',[id])).rows[0];res.status(201).json({story:{...story,content:publicLesson(story.content)}});
  });
  route('get','/activity',async(req,res)=>{
    const u=req.user.id;
    const engagement=(await q(`SELECT p.id,p.content->>'title' title,
      (SELECT count(*)::int FROM fyp_progress f WHERE f.lesson_id=p.id AND f.liked AND f.user_id<>$1) likes,
      (SELECT count(*)::int FROM fyp_progress f WHERE f.lesson_id=p.id AND f.reposted AND f.user_id<>$1) reposts,
      (SELECT count(*)::int FROM fyp_comments c WHERE c.lesson_id=p.id AND NOT c.hidden AND c.user_id<>$1) comments
      FROM fyp_publications p WHERE p.user_id=$1 ORDER BY p.published_at DESC LIMIT 100`,[u])).rows;
    const comments=(await q(`SELECT c.id,c.lesson_id,c.body,c.created_at,p.username,p.display_name FROM fyp_comments c
      JOIN fyp_publications f ON f.id=c.lesson_id LEFT JOIN profiles p ON p.user_id=c.user_id
      WHERE f.user_id=$1 AND c.user_id<>$1 AND NOT c.hidden ORDER BY c.created_at DESC LIMIT 100`,[u])).rows;
    // A flat-comment schema cannot honestly identify replies. Support the parent's optional reply schema.
    const cols=(await q("SELECT column_name FROM information_schema.columns WHERE table_name='fyp_comments' AND column_name='parent_id'")).rows;
    const replies=cols.length?(await q(`SELECT c.id,c.lesson_id,c.body,c.created_at,p.username,p.display_name FROM fyp_comments c JOIN fyp_comments parent ON parent.id=c.parent_id LEFT JOIN profiles p ON p.user_id=c.user_id WHERE parent.user_id=$1 AND c.user_id<>$1 AND NOT c.hidden AND NOT parent.hidden ORDER BY c.created_at DESC LIMIT 100`,[u])).rows:[];
    res.json({engagement,comments,replies,repliesSupported:!!cols.length});
  });
  const isBlocked=async(a,b)=>!!(await q('SELECT 1 FROM blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)',[a,b]).catch(()=>({rows:[]}))).rows[0];
  // Per-chat settings: mute, theme, nickname (stored per user per conversation)
  let chatPrefsReady=null;const chatPrefs=()=>chatPrefsReady||=q('CREATE TABLE IF NOT EXISTS social_chat_prefs (user_id INT, conversation_id TEXT, muted BOOLEAN NOT NULL DEFAULT false, theme TEXT, PRIMARY KEY(user_id,conversation_id))').catch(e=>{chatPrefsReady=null;throw e;});
  route('get','/messages/:id/prefs',async(req,res)=>{const c=await member(req,res);if(!c)return;await chatPrefs();const other=c.starter===req.user.id?c.recipient:c.starter;
    const p=(await q('SELECT muted,theme FROM social_chat_prefs WHERE user_id=$1 AND conversation_id=$2',[req.user.id,c.id])).rows[0]||{muted:false,theme:null};
    res.json({...p,blocked:!!(await q('SELECT 1 FROM blocks WHERE blocker=$1 AND blocked=$2',[req.user.id,other])).rows[0]});});
  route('put','/messages/:id/prefs',async(req,res)=>{const c=await member(req,res);if(!c)return;await chatPrefs();
    const THEMES=['default','sunset','ocean','forest','night','rose','gold','lavender'];const b=req.body||{};
    const theme=THEMES.includes(b.theme)?b.theme:null,muted=typeof b.muted==='boolean'?b.muted:null;
    await q(`INSERT INTO social_chat_prefs(user_id,conversation_id,muted,theme) VALUES($1,$2,COALESCE($3,false),$4) ON CONFLICT(user_id,conversation_id) DO UPDATE SET muted=COALESCE($3,social_chat_prefs.muted),theme=COALESCE($4,social_chat_prefs.theme)`,[req.user.id,c.id,muted,theme]);
    // theme is shared with the other person (like Messenger/Instagram)
    if(theme){const other=c.starter===req.user.id?c.recipient:c.starter;await q(`INSERT INTO social_chat_prefs(user_id,conversation_id,theme) VALUES($1,$2,$3) ON CONFLICT(user_id,conversation_id) DO UPDATE SET theme=$3`,[other,c.id,theme]);}
    res.json({ok:true});});
  route('post','/messages/:id/block',async(req,res)=>{const c=await member(req,res);if(!c)return;const other=c.starter===req.user.id?c.recipient:c.starter;
    if(req.body?.block===false)await q('DELETE FROM blocks WHERE blocker=$1 AND blocked=$2',[req.user.id,other]);else await q('INSERT INTO blocks(blocker,blocked) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,other]);
    res.json({ok:true,blocked:req.body?.block!==false});});
  route('delete','/messages/:id/chat',async(req,res)=>{const c=await member(req,res);if(!c)return;await rich();
    await q('INSERT INTO social_reads(conversation_id,user_id,read_at) VALUES($1,$2,now()) ON CONFLICT(conversation_id,user_id) DO UPDATE SET read_at=now()',[c.id,req.user.id]).catch(()=>{});
    await q(`UPDATE social_messages SET deleted=true WHERE conversation_id=$1 AND sender=$2`,[c.id,req.user.id]);res.json({ok:true});});
  async function member(req,res) {
    const c=(await q('SELECT * FROM social_conversations WHERE id=$1 AND (starter=$2 OR recipient=$2)',[req.params.id,req.user.id])).rows[0];
    if(!c)err(res,404,'Conversation not found.');return c;
  }
  let hasAvatar=null;
  route('get','/messages',async(req,res)=>{
    await rich();if(hasAvatar===null)hasAvatar=!!(await q("SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='avatar'")).rows[0];
    res.json({conversations:(await q(`SELECT c.id,c.starter,c.recipient,c.accepted,c.created_at,p.username,p.display_name,${hasAvatar?'p.avatar,':''}
      lm.body last_message,lm.kind last_kind,lm.sender last_sender,lm.deleted last_deleted,lm.created_at last_at,
      (SELECT count(*)::int FROM social_messages m WHERE m.conversation_id=c.id AND m.sender<>$1 AND m.created_at>COALESCE((SELECT read_at FROM social_reads r WHERE r.conversation_id=c.id AND r.user_id=$1),'epoch')) unread
      FROM social_conversations c LEFT JOIN profiles p ON p.user_id=CASE WHEN c.starter=$1 THEN c.recipient ELSE c.starter END
      LEFT JOIN LATERAL (SELECT body,kind,sender,deleted,created_at FROM social_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) lm ON true
      WHERE c.starter=$1 OR c.recipient=$1 ORDER BY COALESCE(lm.created_at,c.created_at) DESC LIMIT 100`,[req.user.id])).rows});
  });
  route('post','/messages/start',async(req,res)=>{
    const mine=await profile(req.user.id);if(!mine||mine.banned)return err(res,403,'Create an active community profile before messaging.');
    const username=clean(req.body.username,40).replace(/^@/,'');
    const p=(await q('SELECT user_id FROM profiles WHERE lower(username)=lower($1) AND NOT banned',[username])).rows[0];
    if(!p)return err(res,404,'Community username not found.');if(p.user_id===req.user.id)return err(res,400,'Choose another community member.');
    if(await isBlocked(req.user.id,p.user_id))return err(res,403,'You can’t message this account.');
    const recent=(await q("SELECT count(*)::int n FROM social_conversations WHERE starter=$1 AND created_at>now()-interval '1 hour'",[req.user.id])).rows[0].n;
    let c=(await q('SELECT * FROM social_conversations WHERE (starter=$1 AND recipient=$2) OR (starter=$2 AND recipient=$1)',[req.user.id,p.user_id])).rows[0];
    if(!c){if(recent>=10)return err(res,429,'Please wait before starting more conversations.');
      await q('INSERT INTO social_conversations(id,starter,recipient) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',['dm-'+randomUUID(),req.user.id,p.user_id]);
      c=(await q('SELECT * FROM social_conversations WHERE (starter=$1 AND recipient=$2) OR (starter=$2 AND recipient=$1)',[req.user.id,p.user_id])).rows[0];}
    res.json({conversation:c});
  });
  // Rich messages: text, GIF (GIPHY, family-safe), Shukr stickers, photos, replies, reactions, unsend, read receipts.
  let richReady=null;const rich=()=>richReady||(richReady=[
    "ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text'",
    "ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS media JSONB",
    "ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS reply_to TEXT",
    "ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE social_messages DROP CONSTRAINT IF EXISTS social_messages_body_check",
    "ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS read_receipts BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS typing_indicator BOOLEAN NOT NULL DEFAULT true",
    "CREATE TABLE IF NOT EXISTS social_reads (conversation_id TEXT, user_id INT, read_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(conversation_id,user_id))"
  ].reduce((p,x)=>p.then(()=>q(x).catch(e=>{if(!/social_privacy/.test(x))throw e;})),Promise.resolve()).catch(e=>{richReady=null;throw e;}));
  const GIF_HOST=/^https:\/\/(media[0-9]?\.giphy\.com|i\.giphy\.com)\/[\w\-./]+\.(gif|webp|mp4)(\?[\w=&.-]*)?$/i;
  const STICKER_RE=/^\/stickers\/[a-z0-9-]+\/[a-z0-9-]+\.(svg|webp|png)$/;
  // Message privacy (reciprocal, like WhatsApp): if you hide read receipts / typing, you also can't see other people's.
  const msgPrefs=async uid=>{const r=(await q('SELECT read_receipts,typing_indicator FROM social_privacy WHERE user_id=$1',[uid]).catch(()=>({rows:[]}))).rows[0];return{read:r?r.read_receipts!==false:true,typing:r?r.typing_indicator!==false:true};};
  const typing=new Map(); // conversationId -> Map(userId -> expiresAt)
  const otherOf=(c,me)=>c.starter===me?c.recipient:c.starter;
  async function liveState(c,me){
    const other=otherOf(c,me),[mp,op]=await Promise.all([msgPrefs(me),msgPrefs(other)]);
    const t=typing.get(c.id),otherTyping=!!(mp.typing&&op.typing&&t&&t.get(other)>Date.now());
    const seenAt=mp.read&&op.read?((await q('SELECT read_at FROM social_reads WHERE conversation_id=$1 AND user_id=$2',[c.id,other])).rows[0]?.read_at||null):null;
    const last=(await q('SELECT id,count(*) OVER()::int n FROM social_messages WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[c.id])).rows[0];
    return{otherTyping,otherSeenAt:seenAt,receipts:mp.read&&op.read,lastId:last?.id||null,count:last?.n||0};
  }
  route('post','/messages/:id/typing',async(req,res)=>{
    const c=await member(req,res);if(!c)return;const p=await msgPrefs(req.user.id);
    if(p.typing){let t=typing.get(c.id);if(!t)typing.set(c.id,t=new Map());if(req.body?.typing===false)t.delete(req.user.id);else t.set(req.user.id,Date.now()+6000);}
    if(typing.size>5000)for(const[k,v]of typing)if(![...v.values()].some(x=>x>Date.now()))typing.delete(k);
    res.json({ok:true});
  });
  route('get','/messages/:id/state',async(req,res)=>{
    const c=await member(req,res);if(!c)return;await rich();
    if(req.query.read==='1')await q('INSERT INTO social_reads(conversation_id,user_id,read_at) VALUES($1,$2,now()) ON CONFLICT(conversation_id,user_id) DO UPDATE SET read_at=now()',[c.id,req.user.id]);
    res.json(await liveState(c,req.user.id));
  });
  ctx.richMessages=rich;
  route('get','/gifs',async(req,res)=>{
    const key=process.env.GIPHY_API_KEY;if(!key)return res.json({enabled:false,gifs:[]});
    const term=String(req.query.q||'').trim().slice(0,50);
    const u=new URL('https://api.giphy.com/v1/gifs/'+(term?'search':'trending'));u.searchParams.set('api_key',key);u.searchParams.set('limit','24');u.searchParams.set('rating','g');if(term)u.searchParams.set('q',term);
    try{const r=await fetch(u,{signal:AbortSignal.timeout(6000)});const j=await r.json();
      res.json({enabled:true,gifs:(j.data||[]).map(g=>({id:g.id,title:String(g.title||'').slice(0,80),url:g.images?.fixed_width?.webp||g.images?.fixed_width?.url,still:g.images?.fixed_width_still?.url,w:+g.images?.fixed_width?.width||200,h:+g.images?.fixed_width?.height||200})).filter(g=>g.url&&GIF_HOST.test(g.url))});}
    catch{res.json({enabled:true,gifs:[],error:'GIF search is busy. Try again.'});}
  });
  route('get','/messages/:id',async(req,res)=>{
    const c=await member(req,res);if(!c)return;
    await rich();
    const messages=(await q('SELECT id,sender,CASE WHEN deleted THEN \'\' ELSE body END body,kind,CASE WHEN deleted THEN NULL ELSE media END media,reply_to,reactions,deleted,created_at FROM social_messages WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200',[c.id])).rows.reverse();
    await q('INSERT INTO social_reads(conversation_id,user_id,read_at) VALUES($1,$2,now()) ON CONFLICT(conversation_id,user_id) DO UPDATE SET read_at=now()',[c.id,req.user.id]);
    const other=c.starter===req.user.id?c.recipient:c.starter;
    const live=await liveState(c,req.user.id),seen=live.otherSeenAt;
    const op=(await q('SELECT p.username,COALESCE(p.display_name,u.name) name,p.avatar FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1',[other]).catch(()=>q('SELECT username,display_name AS name FROM profiles WHERE user_id=$1',[other]))).rows[0]||null;
    res.json({conversation:c,messages,otherSeenAt:seen,other:op,otherTyping:live.otherTyping,receipts:live.receipts,prefs:await msgPrefs(req.user.id)});
  });
  route('post','/messages/:id/accept',async(req,res)=>{
    const c=await member(req,res);if(!c)return;if(c.recipient!==req.user.id)return err(res,403,'Only the recipient can accept this request.');
    await q('UPDATE social_conversations SET accepted=true WHERE id=$1',[c.id]);
    res.json({conversation:(await q('SELECT * FROM social_conversations WHERE id=$1',[c.id])).rows[0]});
  });
  // Serialize sends in-process so simultaneous initial requests cannot bypass the one-message rule.
  let sends=Promise.resolve();
  route('post','/messages/:id',async(req,res)=>{
    const previous=sends;let unlock;sends=new Promise(r=>{unlock=r;});await previous;
    try {
      const c=await member(req,res);if(!c)return;
      const mine=await profile(req.user.id);if(!mine||mine.banned)return err(res,403,'An active community profile is required.');
      if(await isBlocked(c.starter,c.recipient))return err(res,403,'You can’t message this account.');
      await rich();
      const kind=['text','gif','sticker','image'].includes(req.body.kind)?req.body.kind:'text';
      const body=typeof req.body.body==='string'?req.body.body.trim():'';
      let media=null;
      if(kind==='text'){if(!body||body.length>1000)return err(res,400,'Messages must contain 1–1000 characters.');}
      else if(kind==='gif'){const u=String(req.body.media?.url||'');if(!GIF_HOST.test(u))return err(res,400,'That GIF can’t be sent.');media={url:u,w:Math.min(500,+req.body.media.w||200),h:Math.min(500,+req.body.media.h||200),title:String(req.body.media.title||'').slice(0,80)};}
      else if(kind==='sticker'){const u=String(req.body.media?.url||'');if(!STICKER_RE.test(u))return err(res,400,'Unknown sticker.');media={url:u};}
      else if(kind==='image'){const u=String(req.body.media?.url||'');if(!/^\/ugc\/[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(u))return err(res,400,'Upload the photo first.');const own=(await q('SELECT 1 FROM social_media WHERE user_id=$1 AND file=$2',[req.user.id,u.slice(5)]).catch(()=>({rows:[]}))).rows[0];if(!own)return err(res,403,'Photo not found.');media={url:u};}
      if(body.length>1000)return err(res,400,'Caption is too long.');
      const replyTo=typeof req.body.replyTo==='string'&&req.body.replyTo.length<80?req.body.replyTo:null;
      const recent=(await q("SELECT count(*)::int n FROM social_messages WHERE sender=$1 AND created_at>now()-interval '1 minute'",[req.user.id])).rows[0].n;
      if(recent>=20)return err(res,429,'Please slow down. Try again in a minute.');
      if(!c.accepted){const n=(await q('SELECT count(*)::int n FROM social_messages WHERE conversation_id=$1',[c.id])).rows[0].n;
        if(c.starter!==req.user.id||n>0)return err(res,403,'The recipient must accept before more messages can be sent.');}
      typing.get(c.id)?.delete(req.user.id);
      await q('INSERT INTO social_reads(conversation_id,user_id,read_at) VALUES($1,$2,now()) ON CONFLICT(conversation_id,user_id) DO UPDATE SET read_at=now()',[c.id,req.user.id]);
      const id='msg-'+randomUUID();await q('INSERT INTO social_messages(id,conversation_id,sender,body,kind,media,reply_to) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,c.id,req.user.id,body||(kind==='gif'?'GIF':kind==='sticker'?'Sticker':kind==='image'?'Photo':''),kind,media,replyTo]);
      const other=c.starter===req.user.id?c.recipient:c.starter;if(ctx.pushUser)ctx.pushUser(other,{title:'New message',body:kind==='text'?body.slice(0,80):kind==='gif'?'Sent a GIF':kind==='sticker'?'Sent a sticker':'Sent a photo',url:'/#/messages?id='+encodeURIComponent(c.id),tag:'dm-'+c.id}).catch(()=>{});
      res.status(201).json({message:(await q('SELECT id,sender,body,kind,media,reply_to,reactions,created_at FROM social_messages WHERE id=$1',[id])).rows[0]});
    } finally {unlock();}
  });
  route('post','/messages/:id/:msg/react',async(req,res)=>{
    const c=await member(req,res);if(!c)return;await rich();const e=String(req.body?.emoji||'');
    if(!['❤️','😂','😮','😢','🤲','👍'].includes(e))return err(res,400,'Unknown reaction.');
    const m=(await q('SELECT reactions FROM social_messages WHERE id=$1 AND conversation_id=$2',[req.params.msg,c.id])).rows[0];if(!m)return err(res,404,'Message not found.');
    const r=m.reactions||{},k=String(req.user.id);if(r[k]===e)delete r[k];else r[k]=e;
    await q('UPDATE social_messages SET reactions=$2 WHERE id=$1',[req.params.msg,JSON.stringify(r)]);res.json({reactions:r});
  });
  route('delete','/messages/:id/:msg',async(req,res)=>{
    const c=await member(req,res);if(!c)return;await rich();
    const r=await q('UPDATE social_messages SET deleted=true,media=NULL WHERE id=$1 AND conversation_id=$2 AND sender=$3',[req.params.msg,c.id,req.user.id]);
    if(!r.rowCount)return err(res,403,'You can only unsend your own messages.');res.json({ok:true});
  });
};
