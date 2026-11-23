import { $, $$, esc, escAttr, I, api, state, shell, go, sheet, toast, onCleanup, confirmSheet } from './core.js';
import { peopleSearchHTML, bindPeopleSearch } from './views-social-plus.js';
import { startCall, callIcons } from './calls.js';
// TikTok-style bottom tab bar, mounted beside #main so it stays put while the page scrolls.
export const socialTabs=[['/fyp','Home','home',['fyp','']],['/explore','Discover','search',['explore','stories']],['/create','Create','plus',['create']],['/notifications','Inbox','chat',['activity','messages','notifications']],['/profile','Profile','user',['profile']]];
export const socialNavigation=section=>`<nav class="social-tabbar" aria-label="Learning community">${socialTabs.map(([url,label,icon,secs])=>url==='/create'?`<a href="#${url}" class="tab-create" aria-label="Create" ${secs.includes(section)?'aria-current="page"':''}><span>${I.create}</span></a>`:`<a href="#${url}" ${secs.includes(section)?'aria-current="page"':''}>${I[icon]}<b>${label}</b></a>`).join('')}</nav>`;
export function mountSocialTabbar(section){
 const host=document.querySelector('.shell-main');if(!host)return;
 host.querySelectorAll('.social-tabbar').forEach(n=>n.remove());
 host.insertAdjacentHTML('beforeend',socialNavigation(section));
 const bar=host.querySelector('.social-tabbar');document.documentElement.classList.add('has-stab');onCleanup(()=>{bar.remove();document.documentElement.classList.remove('has-stab');});
 inboxBadge(bar);
}
// Red Inbox counter (notifications + unread messages); pops when it changes.
let lastBadge=-1;
export async function inboxBadge(bar){
 const a=bar&&bar.querySelector('a[href="#/notifications"]');if(!a)return;
 try{const r=await api('/notifications/count');const n=(r.count||0)+(r.messages||0);a.querySelector('.ib-badge')?.remove();
  if(n>0)a.insertAdjacentHTML('beforeend',`<i class="ib-badge${n!==lastBadge?' pop':''}">${n>99?'99+':n}</i>`);lastBadge=n;}catch{}
}
setInterval(()=>{const b=document.querySelector('.social-tabbar');if(b&&!document.hidden)inboxBadge(b);},45000);
export const inboxSegHTML=section=>`<nav class="social-seg" aria-label="Inbox"><a href="#/notifications" ${section==='notifications'?'aria-current="page"':''}>Notifications</a><a href="#/messages" ${section==='messages'?'aria-current="page"':''}>Messages</a><a href="#/activity" ${section==='activity'?'aria-current="page"':''}>Activity</a></nav>`;
export const socialLinks=socialTabs.map(([url,label])=>[url,label]);
const local=s=>typeof s==='string'&&(/^\/media\/(fyp|house)\/[a-zA-Z0-9_./-]+$/.test(s)||/^\/ugc\/[a-f0-9-]{36}\.[a-z0-9]{3,4}$/.test(s))&&!s.includes('..')?escAttr(s):'';
const thumb=x=>{const m=x.media||{};if(x.format==='reel'&&!m.poster&&m.ugc)return `<video src="${local(m.src)}#t=0.5" muted playsinline preload="metadata"></video>`;return `<img src="${local(m.poster||m.src||m.slides?.[0]?.src)}" alt="${escAttr(m.alt||x.title)}" loading="lazy">`;};
const empty=(title,body)=>`<div class="empty"><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
export async function viewSocialHub(section,query=new URLSearchParams()){
 const names={explore:'Discover',stories:'Stories',create:'Create',activity:'Activity',messages:'Messages',rights:'Content & rights'};
 const p=shell(names[section]||'Community');let alive=true;onCleanup(()=>{alive=false;});
 p.classList.add('social-hub');mountSocialTabbar(section);
  const inboxSeg=['activity','messages'].includes(section)?inboxSegHTML(section):'';
 const discoverSeg=['explore','stories'].includes(section)?`<nav class="social-quick" aria-label="Discover"><a href="#/fyp?format=reel">${I.play} Videos</a><a href="#/stories">${I.sun} Stories</a><a href="#/fyp?saved=1">${I.bookmark} Saved</a></nav>`:'';
 p.innerHTML=inboxSeg+discoverSeg+'<div class="social-content" id="socialContent"><p class="muted">Loading…</p></div>';const c=$('#socialContent',p);
 const render=html=>{if(alive)c.innerHTML=html;};
 const failed=e=>{if(alive)toast(e.message||'Could not complete that request.');};
 if(section==='explore'){
  let seq=0;const search=query.get('q')||'',format=query.get('format')||'all';
  render(`${peopleSearchHTML()}<div id="discoverPosts"><h2>Find something worth keeping.</h2><form id="discoverForm" class="social-search"><input class="input" name="q" aria-label="Search lessons" placeholder="Search lessons, topics, ideas" maxlength="120" value="${escAttr(search)}"><select class="input" name="format" aria-label="Post format">${[['all','All formats'],['reel','Videos'],['carousel','Carousels'],['image','Images']].map(([v,l])=>`<option value="${v}" ${format===v?'selected':''}>${l}</option>`).join('')}</select><button class="btn accent">Search</button></form><div id="discoverResults" aria-live="polite"></div><a href="#/rights" class="link">Original content & copyright reporting</a></div>`);
  const load=async()=>{const n=++seq,f=$('#discoverForm',c);$('#discoverResults',c).textContent='Searching…';try{const r=await api('/social/explore?q='+encodeURIComponent(f.q.value)+'&format='+encodeURIComponent(f.format.value));if(!alive||n!==seq)return;$('#discoverResults',c).innerHTML=r.items.length?`<div class="social-grid">${r.items.map(x=>`<a class="social-tile" href="#/fyp?post=${encodeURIComponent(x.id)}">${thumb(x)}<span class="social-format" aria-label="${escAttr(x.format||'image')}">${x.format==='reel'?I.play:x.format==='carousel'?(I.layers||I.copy):''}</span><strong>${esc(x.title)}</strong></a>`).join('')}</div>`:empty('No matching lessons','Try a broader search or another format.');}catch(e){if(alive&&n===seq)$('#discoverResults',c).textContent=e.message;}};
  $('#discoverPosts',c).insertAdjacentHTML('beforeend','');bindPeopleSearch(c,{onEmpty:()=>{}});const pq=$('#psQ',c);pq.addEventListener('input',()=>{$('#discoverPosts',c).hidden=!!pq.value.trim();});
  $('#discoverForm',c).onsubmit=e=>{e.preventDefault();load();};await load();return;
 }
 if(section==='stories'){
  const r=await api('/social/stories');if(!alive)return;
  render(`<div class="social-heading"><div><h2>A reminder for today.</h2><p class="muted">Short editorial reflections. Stories expire after 24 hours.</p></div><a class="btn accent" href="#/create?type=story">${I.plus} Add story</a></div>${r.stories.length?`<div class="social-grid">${r.stories.map(s=>`<button class="social-tile" data-story="${escAttr(s.id)}">${thumb(s.content)}<strong>${esc(s.caption)}</strong><span class="muted small">Until ${esc(new Date(s.expires_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</span></button>`).join('')}</div>`:empty('No active stories','There are no editorial stories right now. Explore the lesson library instead.')}<a href="#/explore" class="btn ghost">Explore lessons</a>`);
  $$('[data-story]',c).forEach(b=>b.onclick=()=>{const s=r.stories.find(s=>s.id===b.dataset.story);const c=s.content||{},m=c.media||{};sheet(c.ugc?`<div class="social-story ugc">${c.format==='reel'?`<video src="${local(m.src)}" ${m.poster?`poster="${local(m.poster)}"`:''} playsinline autoplay controls></video>`:`<img src="${local(m.src||m.slides?.[0]?.src)}" alt="">`}<div class="social-story-by"><b>@${esc(c.author?.username||'member')}</b> ${esc(s.caption)}</div></div>`:`<div class="social-story">${thumb(c)}<h2>${esc(s.caption)}</h2><p>${esc(c.title)}</p><a class="btn accent" href="#/fyp?post=${encodeURIComponent(s.lesson_id)}">Open original lesson</a></div>`);});return;
 }
 if(section==='create'){
  const permission=await api('/social/permissions');if(!alive)return;
  if(!permission.canPublish){render(empty('Publishing is currently editorial-only','You can explore, comment, share and save. Public uploads are not enabled while creator permissions and moderation are being settled.')+'<a href="#/rights" class="btn ghost">Content & rights policy</a>');return;}
  const r=await api('/social/explore');if(!alive)return;
  render(`<h2>Share a useful reflection.</h2><p class="muted">Use Shukr’s original artwork. External uploads, commercial music and copied footage are not accepted here.</p><form id="publishForm" class="social-form"><label>Publish as<select class="input" name="kind"><option value="post">Feed post</option><option value="story" ${query.get('type')==='story'?'selected':''}>24-hour story</option></select></label><label>Original lesson / media<select class="input" name="lessonId">${r.library.map(x=>`<option value="${escAttr(x.id)}">${esc(x.title)} · ${esc(x.format)}</option>`).join('')}</select></label><div id="publishPreview" class="social-preview"></div><label>Post title<input class="input" name="title" maxlength="120" value="A moment of reflection"></label><label>Your original reflection<textarea class="input" name="body" rows="5" maxlength="500" minlength="21" required placeholder="Write in your own words. Keep the original source teaching intact."></textarea></label><label class="social-check"><input type="checkbox" name="rights" required> I wrote this reflection and have the rights to publish it. I have not copied someone else’s caption.</label><p class="small muted">Sources support the lesson, not a licence to copy their wording or artwork. No system can guarantee that a copyright claim will never arise.</p><button class="btn accent" id="publishButton">Publish reflection</button><p id="publishStatus" role="status"></p></form><a href="#/rights" class="link">Content & rights policy</a>`);
  const f=$('#publishForm',c);const preview=()=>{$('#publishPreview',c).innerHTML=thumb(r.library.find(x=>x.id===f.lessonId.value));};f.lessonId.onchange=preview;preview();
  f.onsubmit=async e=>{e.preventDefault();const b=$('#publishButton',c);b.disabled=true;try{const story=f.kind.value==='story';const result=await api('/social/'+(story?'stories':'publish'),{body:story?{lessonId:f.lessonId.value,caption:f.body.value,rightsConfirmed:f.rights.checked}:{lessonId:f.lessonId.value,title:f.elements.namedItem('title').value,body:f.body.value,rightsConfirmed:f.rights.checked}});if(!alive)return;toast(story?'Story published for 24 hours.':'Reflection published.');go(story?'/stories':'/fyp?post='+encodeURIComponent(result.publication.id));}catch(e){if(alive)$('#publishStatus',c).textContent=e.message;}finally{b.disabled=false;}};return;
 }
 if(section==='activity'){
  const r=await api('/social/activity');if(!alive)return;
  render(`<h2>Conversations around your learning.</h2><p class="muted">Real interactions on your published reflections.</p>${r.engagement.length?`<div class="social-list">${r.engagement.map(x=>`<a class="social-list-item" href="#/fyp?post=${encodeURIComponent(x.id)}"><strong>${esc(x.title)}</strong><span>${x.likes} likes · ${x.comments} comments · ${x.reposts} reposts</span></a>`).join('')}</div>`:empty('No post activity yet','Interactions will appear here when people engage with your published reflections.')}<h3>Recent comments</h3>${r.comments.length?r.comments.map(x=>`<a class="social-list-item" href="#/fyp?post=${encodeURIComponent(x.lesson_id)}"><strong>${esc(x.display_name||x.username||'Learner')}</strong><p>${esc(x.body)}</p></a>`).join(''):'<p class="muted">No recent comments on your posts.</p>'}`);return;
 }
 if(section==='messages'){
  const id=query.get('id');if(id){await conversation(id);return;}
  const r=await api('/social/messages');if(!alive)return;
  const ago=t=>{if(!t)return'';const s=(Date.now()-new Date(t))/1000;return s<60?'now':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':s<604800?Math.floor(s/86400)+'d':new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short'});};
  const prev=x=>x.last_deleted?'Message unsent':x.last_kind==='post'?'Sent a post':x.last_kind==='listing'?'Marketplace listing':x.last_kind==='gif'?'GIF':x.last_kind==='sticker'?'Sticker':x.last_kind==='image'?'Photo':(x.last_message||'Say salam 👋');
  const av=x=>`<span class="ib-av">${x.avatar?`<img src="${escAttr(x.avatar)}" alt="">`:esc((x.display_name||x.username||'?')[0].toUpperCase())}</span>`;
  const reqs=r.conversations.filter(x=>!x.accepted&&x.recipient===state.user.id),chats=r.conversations.filter(x=>!(!x.accepted&&x.recipient===state.user.id));
  const row=x=>`<a class="ib-row ${x.unread?'unread':''}" href="#/messages?id=${encodeURIComponent(x.id)}">${av(x)}<span class="ib-mid"><b>${esc(x.display_name||x.username||'Community member')}</b><span>${x.last_sender===state.user.id&&!x.last_deleted?'You: ':''}${esc(prev(x))}</span></span><span class="ib-end"><small>${ago(x.last_at||x.created_at)}</small>${x.unread?`<i class="ib-dot">${x.unread>9?'9+':x.unread}</i>`:!x.accepted?'<small class="ib-pend">Pending</small>':''}</span></a>`;
  render(`<div class="ib-top"><span class="ib-count">${chats.length?`${chats.length} chat${chats.length===1?'':'s'}`:''}${r.conversations.reduce((n,x)=>n+(x.unread||0),0)?` · <b>${r.conversations.reduce((n,x)=>n+(x.unread||0),0)} unread</b>`:''}</span><button class="ib-new" id="ibNew">${I.edit||I.plus}<span>New message</span></button></div>
   <form id="messageStart" class="ib-search" hidden><span>${I.search}</span><input name="username" required maxlength="40" placeholder="Username to message" aria-label="Recipient username" autocomplete="off"><button class="btn accent sm">Chat</button></form>
   ${reqs.length?`<details class="ib-reqs"><summary><span class="ib-reqicon">${I.mail||I.chat}</span><span><b>Message requests</b><small>${reqs.length} waiting · only accept people you trust</small></span></summary>${reqs.map(row).join('')}</details>`:''}
   <div class="ib-list">${chats.map(row).join('')||`<div class="ib-empty"><div class="ib-empty-art">${I.chat}</div><b>No messages yet</b><p>Start a chat with someone you follow. Stickers, GIFs and du‘a reactions included.</p><a class="btn accent" href="#/ummah">Find people</a></div>`}</div>
   <p class="ib-note">${I.lock||''} Messages are private between you and the other person.</p>`);
  $('#ibNew',c).onclick=()=>{const f=$('#messageStart',c);f.hidden=!f.hidden;if(!f.hidden)f.username.focus();};
  $('#messageStart',c).onsubmit=async e=>{e.preventDefault();const b=$('button',e.target);b.disabled=true;try{const x=await api('/social/messages/start',{body:{username:e.target.username.value.replace(/^@/,'')}});if(alive)go('/messages?id='+encodeURIComponent(x.conversation.id));}catch(e){failed(e);}finally{b.disabled=false;}};return;
 }
 async function conversation(id){
  const r=await api('/social/messages/'+encodeURIComponent(id));if(!alive)return;const v=r.conversation,me=state.user.id,o=r.other||{};
  const byId=new Map(r.messages.map(m=>[m.id,m]));
  const preview=m=>!m?'':m.deleted?'Unsent message':m.kind==='post'?'Post':m.kind==='listing'?'Listing':m.kind==='gif'?'GIF':m.kind==='sticker'?'Sticker':m.kind==='image'?'Photo':m.body;
  const lastMine=[...r.messages].reverse().find(m=>m.sender===me);
  const seen=lastMine&&r.otherSeenAt&&new Date(r.otherSeenAt)>=new Date(lastMine.created_at);
  const bubble=m=>{const mine=m.sender===me,rx=Object.values(m.reactions||{}),rep=m.reply_to&&byId.get(m.reply_to);
   const content=m.deleted?`<p class="dm-unsent">${mine?'You unsent a message':'Message unsent'}</p>`
    :m.kind==='gif'?`<img class="dm-gif" src="${escAttr(m.media.url)}" alt="${escAttr(m.media.title||'GIF')}" loading="lazy" style="aspect-ratio:${m.media.w||1}/${m.media.h||1}">`
    :m.kind==='sticker'?`<img class="dm-sticker" src="${escAttr(m.media.url)}" alt="Sticker" loading="lazy">`
    :m.kind==='post'&&m.media?`<a class="dm-post" href="#/fyp?post=${encodeURIComponent(m.media.id)}">${m.media.thumb?`<img src="${escAttr(m.media.thumb)}" alt="" loading="lazy">`:''}<span><b>@${esc(m.media.author||'shukr')}</b><small>${esc(m.media.title||'')}</small></span>${m.media.format==='reel'?`<i class="dm-post-ic">${I.play}</i>`:''}</a>`
    :m.kind==='listing'&&m.media?`<a class="dm-post" href="#/market/${m.media.id}">${m.media.photo?`<img src="${escAttr(m.media.photo)}" alt="" loading="lazy">`:''}<span><b>${esc(m.media.title)}</b><small>${esc(m.media.currency)} ${esc(String(m.media.price))} · Marketplace</small></span></a>${m.body?`<p>${esc(m.body)}</p>`:''}`
    :m.kind==='image'?`<img class="dm-photo" src="${escAttr(m.media.url)}" alt="Photo" loading="lazy">${m.body&&m.body!=='Photo'?`<p>${esc(m.body)}</p>`:''}`
    :`<p>${esc(m.body)}</p>`;
   return `<div class="dm-row ${mine?'mine':''}" data-mid="${escAttr(m.id)}">${!mine?`<span class="dm-av">${o.avatar?`<img src="${escAttr(o.avatar)}" alt="">`:esc((o.name||'?')[0])}</span>`:''}
    <div class="dm-b ${m.kind} ${m.deleted?'del':''}">${rep?`<div class="dm-reply-q">${esc(preview(rep).slice(0,60))}</div>`:''}${content}${rx.length?`<span class="dm-rx">${[...new Set(rx)].join('')}${rx.length>1?' '+rx.length:''}</span>`:''}</div></div>`;};
  const dayLbl=t=>{const d=new Date(t),n=new Date(),y=new Date(n-864e5);return d.toDateString()===n.toDateString()?'Today':d.toDateString()===y.toDateString()?'Yesterday':d.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});};
  const tm=t=>new Date(t).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  const threadHTML=()=>{let out='',lastDay='';r.messages.forEach((m,k)=>{const d=new Date(m.created_at).toDateString();if(d!==lastDay){out+=`<div class="dm-day">${dayLbl(m.created_at)}</div>`;lastDay=d;}
    const nx=r.messages[k+1],pv=r.messages[k-1],first=!pv||pv.sender!==m.sender||new Date(m.created_at)-new Date(pv.created_at)>300000,last=!nx||nx.sender!==m.sender||new Date(nx.created_at)-new Date(m.created_at)>300000;
    out+=bubble(m).replace('class="dm-row','class="dm-row'+(first?' first':'')+(last?' last':'')).replace('</div></div>',`</div>${last?`<time>${tm(m.created_at)}</time>`:''}</div>`);});return out;};
  c.innerHTML=`<div class="dm-screen"><div class="dm-head"><a class="iconbtn" href="#/messages" aria-label="Back">${I.back}</a><a class="dm-who" href="${o.username?'#/u/'+escAttr(o.username):'#/messages'}"><span class="dm-av lg">${o.avatar?`<img src="${escAttr(o.avatar)}" alt="">`:esc((o.name||'?')[0])}</span><span><b>${esc(o.name||'Member')}</b><small id="dmSub">${r.otherTyping?'typing…':o.username?'@'+esc(o.username):''}</small></span></a>${v.accepted?`<button class="iconbtn dm-call" id="dmVoice" aria-label="Voice call">${callIcons.phone}</button><button class="iconbtn dm-call" id="dmVideo" aria-label="Video call">${callIcons.cam}</button>`:''}<button class="iconbtn" id="dmMenu" aria-label="Chat options">${I.more||I.settings}</button></div>
   <div class="dm-thread" id="dmT">${r.messages.length?threadHTML():`<div class="dm-hello"><span class="dm-av xl">${o.avatar?`<img src="${escAttr(o.avatar)}" alt="">`:esc((o.name||'?')[0])}</span><b>${esc(o.name||'Member')}</b><small>${o.username?'@'+esc(o.username):''}</small><div class="dm-hello-chips">${['As-salamu alaykum 👋','Jazakallah khair 🤲','How are you?'].map(t=>`<button data-quick="${escAttr(t)}">${esc(t)}</button>`).join('')}</div></div>`}<div class="dm-status" id="dmS">${lastMine&&r.messages.at(-1)?.sender===me?(seen?'Seen':r.receipts?'Delivered':'Sent'):''}</div><div class="dm-typing" id="dmTy" ${r.otherTyping?'':'hidden'}><span class="dm-av">${o.avatar?`<img src="${escAttr(o.avatar)}" alt="">`:esc((o.name||'?')[0])}</span><div class="dm-dots"><i></i><i></i><i></i></div></div></div>
   ${!v.accepted&&v.recipient===me?`<div class="dm-req"><p class="muted">Accept this request only if you want to continue.</p><button class="btn accent block" id="acceptThread">Accept</button></div>`
   :`<div class="dm-compose"><div class="dm-replying" id="dmRep" hidden></div><div class="dm-tray" id="dmTray" hidden></div>
     <div class="dm-bar"><label class="dm-cam" aria-label="Send a photo">${I.camera||I.image}<input type="file" accept="image/*" hidden id="dmPhoto"></label>
     <div class="dm-field"><textarea id="dmIn" class="dm-in" rows="1" maxlength="1000" placeholder="Message…"></textarea><button class="dm-ic" data-tray="stickers" aria-label="Stickers and emoji">${I.smile}</button><button class="dm-ic dm-gifbtn" data-tray="gifs" aria-label="GIFs">GIF</button></div>
     <button class="dm-send" id="dmSend" aria-label="Send" disabled>${I.send}</button></div></div>`}</div>`;
  document.documentElement.classList.add('dm-open');onCleanup(()=>document.documentElement.classList.remove('dm-open'));
  const T=$('#dmT',c);T.scrollTop=T.scrollHeight;
  // Chat options: mute, theme, read receipts / typing, block, report, delete
  api('/social/messages/'+encodeURIComponent(id)+'/prefs').then(pf=>{applyTheme(pf.theme);if(pf.blocked){const cmp=$('.dm-compose',c);if(cmp)cmp.innerHTML=`<div class="dm-req"><p class="muted">You blocked this account. They can’t message or call you.</p><button class="btn ghost block" id="unblk">Unblock</button></div>`;$('#unblk',c)&&($('#unblk',c).onclick=async()=>{await api('/social/messages/'+encodeURIComponent(id)+'/block',{body:{block:false}});toast('Unblocked');viewSocialHub('messages',id);});}c._prefs=pf;}).catch(()=>{});
  function applyTheme(t){const s=$('.dm-screen',c);if(!s)return;s.className=s.className.replace(/\bdm-th-\S+/g,'').trim();if(t&&t!=='default')s.classList.add('dm-th-'+t);}
  $('#dmMenu',c).onclick=async()=>{let pv={};try{pv=(await api('/social/privacy')).privacy||{};}catch{}const pf=c._prefs||{};
    const TH=[['default','Default','#FF5A3D'],['sunset','Sunset','linear-gradient(135deg,#FF7A3D,#FF3D7F)'],['ocean','Ocean','linear-gradient(135deg,#0E7C9B,#1BB3B0)'],['forest','Forest','linear-gradient(135deg,#2E7D32,#9CCC65)'],['night','Night','linear-gradient(135deg,#1B1F4A,#3A1C5C)'],['rose','Rose','linear-gradient(135deg,#E3164E,#8E2DE2)'],['gold','Gold','linear-gradient(135deg,#D4AF37,#8C6A12)'],['lavender','Lavender','linear-gradient(135deg,#B39DDB,#7E57C2)']];
    sheet(`<div class="dmo-head"><span class="dm-av lg">${o.avatar?`<img src="${escAttr(o.avatar)}" alt="">`:esc((o.name||'?')[0])}</span><b>${esc(o.name||'Member')}</b>${o.username?`<a class="muted small" href="#/u/${escAttr(o.username)}">View profile</a>`:''}</div>
      <div class="dmo-sec">Theme</div><div class="dmo-themes">${TH.map(([k,l,bg])=>`<button data-th="${k}" class="${(pf.theme||'default')===k?'on':''}" aria-label="${l}"><i style="background:${bg}"></i><small>${l}</small></button>`).join('')}</div>
      <div class="dmo-sec">Privacy & notifications</div>
      <label class="dmo-row"><span>Mute messages<small>No notifications from this chat</small></span><span class="toggle"><input type="checkbox" id="dmoMute" ${pf.muted?'checked':''}><span></span></span></label>
      <label class="dmo-row"><span>Read receipts<small>If off, you won’t see theirs either</small></span><span class="toggle"><input type="checkbox" data-pv="read_receipts" ${pv.read_receipts!==false?'checked':''}><span></span></span></label>
      <label class="dmo-row"><span>Typing indicator<small>If off, you won’t see theirs either</small></span><span class="toggle"><input type="checkbox" data-pv="typing_indicator" ${pv.typing_indicator!==false?'checked':''}><span></span></span></label>
      <div class="dmo-row"><span>Who can message me<small>Applies to new chats</small></span><select class="input sm" id="dmoWho">${[['everyone','Everyone'],['following','People I follow'],['none','No one']].map(([k,l])=>`<option value="${k}" ${(pv.allow_dms||'everyone')===k?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="dmo-sec">More</div>
      <button class="opt" id="dmoDel"><span class="e">${I.trash||'🗑'}</span><div>Unsend all my messages</div></button>
      <button class="opt" id="dmoRep"><span class="e">${I.flag}</span><div>Report</div></button>
      <button class="opt danger" id="dmoBlk"><span class="e">${I.x||'⛔'}</span><div>${pf.blocked?'Unblock':'Block'} ${esc(o.name||'this account')}<div class="d">${pf.blocked?'They’ll be able to message you again':'They won’t be able to message or call you'}</div></div></button>`,(sh,close)=>{
      $$('[data-th]',sh).forEach(b=>b.onclick=async()=>{$$('[data-th]',sh).forEach(x=>x.classList.toggle('on',x===b));applyTheme(b.dataset.th);pf.theme=b.dataset.th;await api('/social/messages/'+encodeURIComponent(id)+'/prefs',{method:'PUT',body:{theme:b.dataset.th}}).catch(e=>toast(e.message));});
      $('#dmoMute',sh).onchange=async e=>{pf.muted=e.target.checked;await api('/social/messages/'+encodeURIComponent(id)+'/prefs',{method:'PUT',body:{muted:e.target.checked}}).catch(er=>toast(er.message));toast(e.target.checked?'Muted':'Unmuted');};
      $$('[data-pv]',sh).forEach(i=>i.onchange=async()=>{await api('/social/privacy',{method:'PUT',body:{[i.dataset.pv]:i.checked}}).catch(er=>toast(er.message));});
      $('#dmoWho',sh).onchange=async e=>{await api('/social/privacy',{method:'PUT',body:{allow_dms:e.target.value}}).catch(er=>toast(er.message));toast('Saved');};
      $('#dmoDel',sh).onclick=async()=>{if(!confirm('Unsend all your messages in this chat?'))return;await api('/social/messages/'+encodeURIComponent(id)+'/chat',{method:'DELETE'});close();viewSocialHub('messages',id);};
      $('#dmoRep',sh).onclick=async()=>{close();const why=prompt('What’s wrong? (spam, harassment, scam, other)');if(!why)return;try{await api('/social/reports',{body:{targetType:'user',username:o.username,reason:why.slice(0,300)}});toast('Thanks — we’ll review this');}catch(e){toast(e.message);}};
      $('#dmoBlk',sh).onclick=async()=>{const blk=!pf.blocked;if(blk&&!confirm(`Block ${o.name||'this account'}? They won’t be able to message or call you.`))return;await api('/social/messages/'+encodeURIComponent(id)+'/block',{body:{block:blk}});close();toast(blk?'Blocked':'Unblocked');viewSocialHub('messages',id);};
    });};
  $('#dmVoice',c)&&($('#dmVoice',c).onclick=()=>startCall(id,o,false));$('#dmVideo',c)&&($('#dmVideo',c).onclick=()=>startCall(id,o,true));
  let replyTo=null;
  const send=async body=>{try{await api('/social/messages/'+encodeURIComponent(id),{body:{...body,replyTo}});replyTo=null;await conversation(id);}catch(e){toast(e.message);}};
  if($('#acceptThread',c))$('#acceptThread',c).onclick=async e=>{e.target.disabled=true;try{await api('/social/messages/'+encodeURIComponent(id)+'/accept',{body:{}});await conversation(id);}catch(e){failed(e);}};
  const inp=$('#dmIn',c);if(!inp)return;
  let lastPing=0,stopT;const ping=on=>api('/social/messages/'+encodeURIComponent(id)+'/typing',{body:{typing:on}}).catch(()=>{});
  inp.oninput=()=>{inp.style.height='auto';inp.style.height=Math.min(120,inp.scrollHeight)+'px';$('#dmSend',c).disabled=!inp.value.trim();
    if(r.prefs?.typing!==false&&inp.value.trim()){if(Date.now()-lastPing>3500){lastPing=Date.now();ping(true);}clearTimeout(stopT);stopT=setTimeout(()=>{lastPing=0;ping(false);},4000);}};
  $$('[data-quick]',c).forEach(b=>b.onclick=()=>send({kind:'text',body:b.dataset.quick}));
  inp.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#dmSend',c).click();}};
  $('#dmSend',c).onclick=()=>{const t=inp.value.trim();if(!t)return;inp.value='';$('#dmSend',c).disabled=true;clearTimeout(stopT);lastPing=0;send({kind:'text',body:t});};
  $('#dmPhoto',c).onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const res=await fetch('/api/social/media',{method:'POST',headers:{'Content-Type':f.type},body:f,credentials:'same-origin'});const j=await res.json();if(!res.ok)throw new Error(j.error);await send({kind:'image',media:{url:j.media.url}});}catch(er){toast(er.message);}};
  // Long-press / right-click a message: react, reply, copy, unsend
  $$('[data-mid]',c).forEach(row=>{let t;const open=()=>{const m=byId.get(row.dataset.mid);if(!m||m.deleted)return;
    sheet(`<div class="dm-rxbar">${['❤️','😂','😮','😢','🤲','👍'].map(x=>`<button data-rx="${x}">${x}</button>`).join('')}</div>
     <button class="opt" data-o="reply"><span class="e">${I.back}</span><div>Reply</div></button>${m.kind==='text'?`<button class="opt" data-o="copy"><span class="e">${I.copy}</span><div>Copy</div></button>`:''}
     ${m.sender===me?`<button class="opt danger" data-o="unsend"><span class="e">${I.trash}</span><div>Unsend</div></button>`:`<button class="opt" data-o="report"><span class="e">${I.flag}</span><div>Report</div></button>`}`,(sh,close)=>{
     $$('[data-rx]',sh).forEach(b=>b.onclick=async()=>{close();await api(`/social/messages/${encodeURIComponent(id)}/${encodeURIComponent(m.id)}/react`,{body:{emoji:b.dataset.rx}}).catch(e=>toast(e.message));conversation(id);});
     $$('[data-o]',sh).forEach(b=>b.onclick=async()=>{close();const k=b.dataset.o;
      if(k==='reply'){replyTo=m.id;const rp=$('#dmRep',c);rp.hidden=false;rp.innerHTML=`<span>Replying: ${esc(preview(m).slice(0,50))}</span><button class="iconbtn sm" aria-label="Cancel reply">${I.x}</button>`;$('button',rp).onclick=()=>{replyTo=null;rp.hidden=true;};inp.focus();}
      if(k==='copy'){navigator.clipboard?.writeText(m.body);toast('Copied');}
      if(k==='unsend'){await api(`/social/messages/${encodeURIComponent(id)}/${encodeURIComponent(m.id)}`,{method:'DELETE'}).catch(e=>toast(e.message));conversation(id);}
      if(k==='report'){await api('/social/report',{body:{kind:'post',id:m.id.slice(0,80),reason:'Message reported'}}).catch(()=>{});toast('Reported. Thank you.');}});});};
    row.addEventListener('contextmenu',e=>{e.preventDefault();open();});
    row.addEventListener('touchstart',()=>{t=setTimeout(open,450);},{passive:true});['touchend','touchmove'].forEach(ev=>row.addEventListener(ev,()=>clearTimeout(t),{passive:true}));
    row.addEventListener('dblclick',async()=>{const m=byId.get(row.dataset.mid);if(m&&!m.deleted){await api(`/social/messages/${encodeURIComponent(id)}/${encodeURIComponent(m.id)}/react`,{body:{emoji:'❤️'}}).catch(()=>{});conversation(id);}});
  });
  // Sticker + GIF tray
  let stickers=null;const tray=$('#dmTray',c);let open='';
  $$('[data-tray]',c).forEach(b=>b.onclick=async()=>{const k=b.dataset.tray;$$('[data-tray]',c).forEach(x=>x.setAttribute('aria-pressed','false'));if(open===k){tray.hidden=true;open='';return;}open=k;tray.hidden=false;b.setAttribute('aria-pressed','true');
   if(k==='stickers'){if(!stickers)stickers=await fetch('/stickers/index.json').then(x=>x.json()).catch(()=>({packs:[]}));
    const quick=['❤️','🤲','😂','😊','🥹','🙏','✨','🌙','🕌','📿','💯','🔥'];
    tray.innerHTML=`<div class="dm-emoji">${quick.map(e=>`<button data-em="${e}">${e}</button>`).join('')}</div><div class="dm-stk">${stickers.packs.flatMap(p=>p.stickers).map(s=>`<button data-stk="${escAttr(s.url)}" aria-label="${escAttr(s.label)}"><img src="${escAttr(s.url)}" alt="" loading="lazy"></button>`).join('')}</div>`;
    $$('[data-em]',tray).forEach(x=>x.onclick=()=>{inp.value+=x.dataset.em;inp.focus();});
    $$('[data-stk]',tray).forEach(x=>x.onclick=()=>{tray.hidden=true;open='';send({kind:'sticker',media:{url:x.dataset.stk}});});}
   else{tray.innerHTML=`<input class="input dm-gifq" id="gq" placeholder="Search GIFs" type="search"><div class="dm-gifs" id="gl"><div class="loading"><span class="spin"></span></div></div><div class="dm-giphy">Powered by GIPHY</div>`;
    const load=async term=>{const g=await api('/social/gifs'+(term?'?q='+encodeURIComponent(term):'')).catch(()=>({gifs:[]}));const box=$('#gl',tray);if(!box)return;
     if(g.enabled===false){box.innerHTML='<p class="muted small">GIF search isn’t switched on yet.</p>';return;}
     box.innerHTML=g.gifs.length?g.gifs.map(x=>`<button data-gif='${escAttr(JSON.stringify({url:x.url,w:x.w,h:x.h,title:x.title}))}'><img src="${escAttr(x.url)}" alt="${escAttr(x.title)}" loading="lazy"></button>`).join(''):`<p class="muted small">${esc(g.error||'No GIFs found.')}</p>`;
     $$('[data-gif]',box).forEach(x=>x.onclick=()=>{tray.hidden=true;open='';send({kind:'gif',media:JSON.parse(x.dataset.gif)});});};
    let tt;$('#gq',tray).oninput=e=>{clearTimeout(tt);tt=setTimeout(()=>load(e.target.value.trim()),300);};load('');}});
  // Live state: typing, seen, new messages (light 2.5s poll of a tiny endpoint).
  const poll=setInterval(async()=>{if(!alive||!document.body.contains(T)){clearInterval(poll);return;}if(document.hidden)return;
    try{const x=await api('/social/messages/'+encodeURIComponent(id)+'/state?read=1');
      if(x.lastId!==(r.messages.at(-1)?.id||null)||x.count!==r.messages.length){if(!inp.value&&tray.hidden){clearInterval(poll);conversation(id);return;}}
      const ty=$('#dmTy',c),sub=$('#dmSub',c),near=T.scrollHeight-T.scrollTop-T.clientHeight<80;
      if(ty){ty.hidden=!x.otherTyping;if(sub)sub.textContent=x.otherTyping?'typing…':(o.username?'@'+o.username:'');if(x.otherTyping&&near)T.scrollTop=T.scrollHeight;}
      const lm=[...r.messages].reverse().find(m=>m.sender===me),st=$('#dmS',c);
      if(st)st.textContent=lm&&r.messages.at(-1)?.sender===me?(x.otherSeenAt&&new Date(x.otherSeenAt)>=new Date(lm.created_at)?'Seen':x.receipts?'Delivered':'Sent'):'';}catch{}},2500);
  onCleanup&&onCleanup(()=>clearInterval(poll));
 }
 if(section==='rights'){render(`<h2>Original by design. Accountable in practice.</h2><div class="social-policy"><h3>What is in the starter library?</h3><p>Shukr’s starter images, diagrams and silent captioned videos are generated from original layouts and illustrations. No downloaded social-media videos, commercial songs or stock footage are included.</p><h3>Sources are not media licences</h3><p>Educational captions link to their references. A citation does not grant permission to copy a source’s text, photography, music or branding. Religious summaries are labelled paraphrases rather than presented as original translations or new rulings.</p><h3>Publishing is restricted</h3><p>At present, only administrators can publish reflections using the original library. They must confirm rights to their written caption. External media uploads are disabled in this workflow.</p><h3>Report a concern</h3><p>Use the report control on a post to identify suspected infringement, inaccurate teaching or abuse. Include the source URL and explain the concern so a reviewer can investigate. A report is a request for review, not an automatic finding of infringement.</p><h3>No blanket guarantee</h3><p>Original assets and restricted uploads reduce risk; they do not guarantee freedom from copyright claims or legal disputes. Shukr uses its own identity and is not affiliated with Instagram or TikTok.</p></div>`);
  const permission=await api('/social/permissions');if(!alive||!permission.canPublish)return;
  c.insertAdjacentHTML('beforeend','<h3>Administrator report queue</h3><div id="rightsQueue"></div>');
  async function queue(){const r=await api('/social/reports');if(!alive)return;$('#rightsQueue',c).innerHTML=r.reports.length?r.reports.map(x=>`<article class="social-list-item"><strong>${esc(x.reason)} · ${esc(x.status)}</strong><a href="#/fyp?post=${encodeURIComponent(x.lesson_id)}">Open reported post</a><p>${esc(x.details)}</p>${x.status==='open'?`<div class="row"><button class="btn ghost" data-review="${x.id}" data-resolution="dismiss">Dismiss</button><button class="btn danger" data-review="${x.id}" data-resolution="remove">Remove from feeds</button></div>`:''}</article>`).join(''):'<p class="muted">No reports have been submitted.</p>';$$('[data-review]',c).forEach(b=>b.onclick=async()=>{if(b.dataset.resolution==='remove'&&!await confirmSheet('Remove this post?','This hides the post from discovery and feeds while preserving the review record.','Remove',true))return;b.disabled=true;try{await api('/social/reports/'+b.dataset.review+'/resolve',{body:{resolution:b.dataset.resolution}});await queue();}catch(e){failed(e);b.disabled=false;}});}
  await queue();
 }
}
