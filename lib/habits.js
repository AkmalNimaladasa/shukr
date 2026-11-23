module.exports = function registerHabits(ctx) {
  const {app,q,auth,wrap,todayFor}=ctx;
  const icons=new Set(['leaf','quran','book','beads','heart','hands','moon','sun','target','flame','dua','mosque','star','fast','brain','gem']);
  const shift=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const object=b=>b && typeof b==='object' && !Array.isArray(b);
  const text=(v,max)=>typeof v==='string' && v.trim().length>0 && v.trim().length<=max;
  async function response(req,day=todayFor(req.user)) {
    const today=todayFor(req.user),days=Array.from({length:7},(_,i)=>shift(today,i-6));
    const rows=(await q('SELECT * FROM habits WHERE user_id=$1 ORDER BY active DESC,id',[req.user.id])).rows;
    const logs=(await q('SELECT habit_id,day::text AS day FROM habit_logs WHERE user_id=$1 AND completed=true AND day<=$2::date',[req.user.id,today])).rows;
    const completed=new Map();
    for(const log of logs) { if(!completed.has(log.habit_id)) completed.set(log.habit_id,new Set()); completed.get(log.habit_id).add(log.day); }
    const habits=rows.map(h=>{
      const done=completed.get(h.id)||new Set();
      let cursor=done.has(today)?today:shift(today,-1),streak=0;
      while(done.has(cursor)) { streak++;cursor=shift(cursor,-1); }
      const history=days.map(day=>({day,completed:done.has(day)}));
      return {...h,completed:done.has(day),streak,weekCompleted:history.filter(x=>x.completed).length,history};
    });
    const active=habits.filter(h=>h.active);
    return {habits,day,days,summary:{active:active.length,completed:active.filter(h=>h.completed).length,todayCompleted:active.filter(h=>completed.get(h.id)?.has(today)).length}};
  }
  const validDay=(day,today)=>typeof day==='string' && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day+'T12:00:00Z')) && new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day && day<=today;
  const validId=id=>/^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id)<=2147483647;
  app.get('/api/habits',auth,wrap(async(req,res)=>{
    const day=req.query.day===undefined?todayFor(req.user):req.query.day;
    if(!validDay(day,todayFor(req.user))) return res.status(400).json({error:'Choose a valid date, no later than today.'});
    res.json(await response(req,day));
  }));
  app.patch('/api/habits/:id',auth,wrap(async(req,res)=>{
    if(!validId(req.params.id)) return res.status(404).json({error:'Habit not found'});
    const b=req.body;
    if(!object(b) || !Object.keys(b).length || Object.keys(b).some(k=>!['name','active'].includes(k)) || (b.name!==undefined && !text(b.name,80)) || (b.active!==undefined && typeof b.active!=='boolean')) return res.status(400).json({error:'Provide a valid name or active boolean.'});
    const habit=(await q('UPDATE habits SET name=COALESCE($3,name),active=COALESCE($4,active) WHERE id=$1 AND user_id=$2 RETURNING *',[Number(req.params.id),req.user.id,b.name===undefined?null:b.name.trim(),b.active===undefined?null:b.active])).rows[0];
    if(!habit) return res.status(404).json({error:'Habit not found'});
    res.json({habit});
  }));
  app.put('/api/habits/:id/log',auth,wrap(async(req,res)=>{
    if(!validId(req.params.id)) return res.status(404).json({error:'Habit not found'});
    const b=req.body;
    if(!object(b) || Object.keys(b).some(k=>!['day','completed'].includes(k)) || !validDay(b.day,todayFor(req.user)) || typeof b.completed!=='boolean') return res.status(400).json({error:'Provide a valid day no later than today and a completed boolean.'});
    const habit=(await q('SELECT id,active FROM habits WHERE id=$1 AND user_id=$2',[Number(req.params.id),req.user.id])).rows[0];
    if(!habit) return res.status(404).json({error:'Habit not found'});
    if(!habit.active) return res.status(409).json({error:'Restore this archived habit before logging.'});
    await q('INSERT INTO habit_logs(user_id,habit_id,day,completed) VALUES($1,$2,$3,$4) ON CONFLICT(habit_id,day) DO UPDATE SET completed=EXCLUDED.completed',[req.user.id,habit.id,b.day,b.completed]);
    const data=await response(req,b.day);
    res.json({...data,habit:data.habits.find(h=>h.id===habit.id)});
  }));
  app.post('/api/habits',auth,wrap(async(req,res)=>{
    const b=req.body;
    if(!object(b) || Object.keys(b).some(k=>!['name','category','icon'].includes(k)) || !text(b.name,80) || (b.category!==undefined && !text(b.category,32)) || (b.icon!==undefined && !icons.has(b.icon))) return res.status(400).json({error:'Enter a name (1–80 characters), category (1–32 characters), and a supported icon.'});
    const habit=(await q('INSERT INTO habits(user_id,name,category,icon) VALUES($1,$2,$3,$4) RETURNING *',[req.user.id,b.name.trim(),b.category===undefined?'personal':b.category.trim(),b.icon===undefined?'leaf':b.icon])).rows[0];
    res.status(201).json({habit});
  }));
};
