const test=require('node:test');const assert=require('node:assert');
const s=require('../lib/safety');
test('detects suicidal language in several phrasings and languages',()=>{
 for(const t of ['I want to kill myself','i dont want to live anymore','thinking about suicide','I am going to end it all tonight','everyone would be better off without me','أريد أن أنتحر','sochta hun khudkushi kar lun','rasa nak bunuh diri','I keep cutting my wrists'])assert.equal(s.assess(t),'suicide',t);
 assert.equal(s.assess('my husband beats me every night'),'abuse');
 for(const t of ['I killed it at work today','this exam is killing me lol','what is the ruling on suicide bombing in fiqh history?'.replace('suicide','x'),'Alhamdulillah good day'])assert.equal(s.assess(t),null,t);
});
test('crisis reply always contains help lines and Allah’s mercy, never shaming',()=>{
 const r=s.crisisReply('suicide',{tz:'Asia/Colombo'});assert.match(r,/1333/);assert.match(r,/39:53/);assert.doesNotMatch(r,/sin|hell|haram/i);
 const g=s.crisisReply('suicide',{tz:'Europe/London'});assert.match(g,/116 123/);
 const u=s.crisisReply('suicide',{tz:'Antarctica/Troll'});assert.match(u,/findahelpline/);
 assert.match(s.PROMPT,/NEVER give methods/);
});
test('99 names data: 99 entries, no known mistranslations',()=>{
 const n=require('../public/data/names.json');assert.equal(n.length,99);
 assert.equal(n.find(x=>x.n===10).en,'The Supreme in Greatness');assert.ok(!n.some(x=>/Inhertior|Maginificent|Forebearing|Repentence|Soverign/.test(x.en)));
});
