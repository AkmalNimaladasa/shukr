function chatModel({mode,deep,fast,full}) {
 return deep || mode === 'fiqh' || mode === 'istikhara' ? full : fast;
}
function lexicalHistory(rows,query,k=4) {
 const terms=[...new Set(String(query).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])].filter(x=>!['the','and','what','about','that','have','with','this','from','you','your'].includes(x));
 return rows.map(r=>{const text=r.content||r.text||'';const hay=text.toLowerCase(); const hits=terms.filter(t=>hay.includes(t)).length;return {src:r.src||`chat "${r.title||'Past conversation'}" (${r.role||'user'})`,text:text.slice(0,600),s:hits/Math.max(terms.length,1)};}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,k);
}
async function settleTitle(p,ms=100) {
 if(!p) return ''; let timer;
 try{return await Promise.race([Promise.resolve(p).catch(()=>''),new Promise(r=>{timer=setTimeout(()=>r(''),ms);})]);}finally{clearTimeout(timer);}
}
module.exports={chatModel,lexicalHistory,settleTitle};
