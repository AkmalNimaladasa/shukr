const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/views-fyp.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/fyp.css'), 'utf8');
const article = source.slice(source.indexOf('  function article(x,n) {'), source.indexOf('  function draw() {'));
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const render = vm.runInNewContext(`${article};article`, {soundOn:true,TT:new Proxy({}, {get:(_,key)=>`<svg data-tt="${key}"></svg>`}),esc:escape,escAttr:escape,I:new Proxy({}, {get:(_,key)=>`<svg data-icon="${key}"></svg>`}),topics:[],items:[{},{}],topicLabel:(_,id)=>id});
const lesson={id:'lesson-one',title:'A thoughtful lesson',topic:'character',hook:'A hook',body:'A body',takeaway:'A practice'};
test('reels are real local muted inline native video, not text-card placeholders',()=>{
 const html=render({...lesson,format:'reel',media:{src:'/media/fyp/reel.mp4',poster:'/media/fyp/poster.svg',durationSeconds:24}},0);
 assert.match(html,/<video class="fill" src="\/media\/fyp\/reel.mp4" poster="\/media\/fyp\/poster.svg" playsinline/);
 assert.match(html,/fyp-progress/);assert.match(html,/data-play/);assert.doesNotMatch(html,/autoplay/);
});
test('carousels expose real images, individual accessible slides, arrows and dots',()=>{
 const html=render({...lesson,format:'carousel',media:{slides:[{src:'/media/fyp/a.svg',alt:'First lesson'},{src:'/media/fyp/b.svg',alt:'Second lesson'}]}},1);
 assert.equal((html.match(/class="fyp-slide"/g)||[]).length,2);
 assert.match(html,/alt="First lesson"/);assert.match(html,/data-slide-step="-1"/);assert.match(html,/data-slide-step="1"/);assert.match(html,/Slide 2 of 2/);assert.match(html,/1 \/ 2/);
});
test('image captions are escaped, editorial and full-caption sheet accessible',()=>{
 const html=render({...lesson,title:'<script>bad</script>',format:'image',media:{src:'/media/fyp/art.svg',alt:'<art>'}},0);
 assert.match(html,/src="\/media\/fyp\/art.svg"/);assert.match(html,/alt="&lt;art&gt;"/);assert.match(html,/fyp-verified/);assert.match(html,/data-action="caption"/);assert.doesNotMatch(html,/<script>/);
});
test('remote media and path traversal are rejected',()=>{
 for(const src of ['https://example.com/video.mp4','/media/fyp/../private','//example.com/a','/ugc/../x.jpg']){const h=render({...lesson,format:'image',media:{src}},0);assert.match(h,/class="fyp-art" src=""/);assert.doesNotMatch(h,/example\.com|private|\.\.\//);}
 assert.match(render({...lesson,format:'image',media:{src:'/ugc/0b6f1c2e-1111-4a2b-9c3d-123456789abc.jpg',ugc:true}},0),/class="fyp-art ugc" src="\/ugc\/0b6f1c2e/);
});
test('feed exposes formats and required social/learning controls',()=>{
 const html=render({...lesson,format:'image',media:{src:'/media/fyp/art.svg'}},0);
 const rail=html.slice(html.indexOf('fyp-rail'),html.indexOf('fyp-caption'));
 assert.deepEqual([...rail.matchAll(/data-action="(\w+)"/g)].map(m=>m[1]),['like','comment','save','repost','share']);
 for(const a of ['complete','quiz','listen','ask','less','report'])assert.match(source,new RegExp(`data-action="${a}"`));
 assert.match(source,/\['all','All posts'\]/);assert.match(source,/format=\$\{format\}/);assert.match(source,/query\?\.get\('post'\)/);
});
test('lifecycle pauses route, hidden, offscreen media and cleans tracking',()=>{
 for(const pattern of [/visibilitychange/,/pagehide/,/onCleanup\(\(\)=>\{disposeMedia\(\)/,/intersectionRatio<\.5\)v\.pause\(\)/,/v\.onplay=.*active\(\)/,/stopTracking\(\)/,/fyp:slide/])assert.match(source,pattern);
 assert.match(source,/duckNasheed\(!v\.paused&&!v\.muted\)/);assert.match(source,/if\(speech\)\{stopSpeech\(\);return;\}pauseMedia\(\)/);
 assert.match(css,/object-fit:contain/);assert.match(css,/object-fit:cover/);assert.match(css,/fyp-rail/);assert.match(css,/scroll-snap-type:y mandatory/);assert.match(css,/scroll-snap-type:x mandatory/);
});
test('sharing counts only success and comments escape body with explicit own delete',()=>{
 const share=source.slice(source.indexOf('function shareSheet'),source.indexOf('async function act('));
 assert.ok(share.indexOf('await navigator.share')<share.lastIndexOf('record()'));assert.match(share,/wa\.me/);assert.match(share,/util\('copy'/);assert.match(share,/instagram/);assert.match(share,/download/);assert.doesNotMatch(share.slice(share.indexOf('sheet(')),/^\s*record\(\);\s*$/m);
 assert.match(source,/e\.name!=='AbortError'/);assert.match(source,/maxlength="1000"/);assert.match(source,/esc\(c.body\)/);assert.match(source,/c\.isMine\?/);assert.match(source,/await reload\(\)/);
});

test('reels: sound unlock on real user gestures, mute toggle reflects audibility, tap-for-sound fallback',()=>{
 const js=require('fs').readFileSync(require('path').join(__dirname,'..','public','js','views-fyp.js'),'utf8');
 assert.match(js,/const unlockEvents=\['click','touchend','keydown'\]/);
 assert.doesNotMatch(js,/addEventListener\('pointerdown',unlock/);
 assert.match(js,/function syncSoundUI\(\)/);assert.match(js,/data-tapsound/);assert.match(js,/function playReel\(v,card\)/);
 assert.match(js,/addEventListener\('canplay',once\)/);
});
