// New to Islam? — a warm welcome & glossary for curious visitors and new Muslims.
import { $, $$, esc, escAttr, I, shell, bindGo, askAlim, loadJSON } from '../core.js';

const PENDING_NI = new Set([]);
const MENU = [
  ['Daily', [
    ['/today', 'Today', 'home', 'Your daily home: prayer times, a verse, a reminder and your streaks, all in one place.'],
    ['/chat/new', 'Alim (AI companion)', 'chat', 'Ask anything, privately and without judgement. A friendly AI guide, not a scholar.'],
    ['/sunnah', 'Sunnah tracker', 'check', 'Small, beautiful daily habits of the Prophet ﷺ, like smiling or drinking water mindfully.'],
    ['/challenges', 'Challenges & leaderboard', 'flame', 'Friendly challenges, such as 7 days of gratitude, that you can do with others.'],
    ['/habits', 'Habit tracker', 'target', 'Build good routines one tiny step at a time.'],
    ['/journal', 'Gratitude journal', 'book', 'Write down three things you are thankful for. This is the heart of Shukr.'],
    ['/blessings', 'Blessings', 'gem', 'A growing collection of the good things in your life, for the days you need reminding.']
  ]],
  ['Worship', [
    ['/prayer', 'Prayer times', 'clock', 'The five daily prayer times for where you are, worked out automatically.'],
    ['/dhikr', 'Dhikr counter', 'beads', 'A calm tap-counter for repeating short phrases that remember God.'],
    ['/istighfar', 'Istighfar', 'leaf', 'Asking forgiveness: a gentle reset button for the heart.'],
    ['/adhkar', 'Adhkar & duas', 'moon', 'Morning, evening and everyday prayers, with meanings in English.'],
    ['/qibla', 'Qibla', 'compass', 'A compass that points towards Makkah, the direction of prayer.'],
    ['/calendar', 'Calendar', 'cal', 'The moon-based Islamic (Hijri) calendar and its special days.'],
    ['/fasting', 'Fasting', 'fast', 'Track Ramadan and voluntary fasts, with suhoor and iftar times.'],
    ['/salah-guide', 'How to pray', 'hands', 'A step-by-step, beginner-friendly guide to wudu and the prayer.']
  ]],
  ['Knowledge', [
    ['/quran', 'Quran', 'quran', 'Read and listen to the Quran in Arabic, with English translation.'],
    ['/ayah-finder', 'Ayah finder', 'search', 'Describe a feeling or topic and find verses about it.'],
    ['/tafsir', 'Tafsir', 'book', 'Explanations of what verses mean and the context behind them.'],
    ['/hadith', 'Hadith', 'scroll', 'Sayings and actions of the Prophet ﷺ from trusted collections.'],
    ['/seerah', 'Seerah & history', 'hourglass', 'The life story of the Prophet ﷺ and the history of early Islam.'],
    ['/hifz', 'Hifz', 'brain', 'Memorise short chapters of the Quran, little by little.'],
    ['/tajweed', 'Tajweed', 'mic', 'Learn to recite the Quran beautifully and correctly.'],
    ['/learn', 'Learn', 'cap', 'Bite-sized lessons on beliefs, worship and character.'],
    ['/names', '99 Names', 'star', 'The beautiful names of God, such as The Most Merciful, and what each one means.']
  ]],
  ['Listen', [
    ['/audiobooks', 'Audiobooks', 'headphones', 'Listen to Islamic books and stories on the go.']
  ]],
  ['Barakah & wealth', [
    ['/barakah', 'Barakah', 'sparkle', 'Practical ways to invite blessing into your time, home and work.'],
    ['/wealth', 'Halal wealth', 'wallet', 'Learn about earning, saving and spending ethically. General education only, not financial advice.'],
    ['/zakat', 'Zakat calculator', 'coin', 'Work out the yearly charity owed on savings, step by step.']
  ]],
  ['Heart & community', [
    ['/scholars', 'Scholars', 'cap', 'Send your question to a real, qualified human scholar.'],
    ['/akhirah', 'Akhirah reminders', 'hourglass', 'Gentle reminders about the life to come, to keep today meaningful.'],
    ['/ummah', 'Ummah', 'users', 'Connect with the wider Muslim community.'],
    ['/jummah', 'Jummah', 'mosque', 'Everything for Friday: the special prayer and its beautiful habits.'],
    ['/mosques', 'Mosque map', 'pin', 'Find mosques near you. Visitors are welcome.'],
    ['/halal-places', 'Halal food near me', 'bag', 'Find halal restaurants and shops nearby.'],
    ['/creator/analytics', 'Creator tools', 'create', 'For people who make Islamic content: share, grow and see what helps.']
  ]]
];

// Big questions. Quran refs are rendered from the Pickthall + Arabic data files.
const BIG = [
  { id: 'allah', icon: 'sun', tone: 'a', q: 'Who is Allah?', lead: '“Allah” is simply the Arabic word for God, the same God of Abraham, Moses and Jesus.',
    body: ['Muslims believe God is One, with no partners and no children. He is not part of His creation and nothing is like Him, yet He is closer to you than you might think.', 'The Quran describes Him with many beautiful names. The two used most often are <b>ar-Rahman</b> and <b>ar-Rahim</b>, both meaning the Most Merciful. Every chapter of the Quran but one begins with them.', 'One very short chapter, often called a third of the Quran because of its weight, sums up who God is:'],
    quote: [[112, 1], [112, 2], [112, 3], [112, 4]], foot: 'Surah al-Ikhlas (Sincerity), chapter 112. A hadith in Sahih al-Bukhari describes it as equal to a third of the Quran.', go: '/names', goLabel: 'Explore the 99 Names' },
  { id: 'quran', icon: 'quran', tone: 'b', q: 'What is the Quran?', lead: 'The holy book of Islam. Muslims believe it is the actual words of God.',
    body: ['It was revealed to the Prophet Muhammad ﷺ through the angel Gabriel (Jibril) bit by bit, over about 23 years, starting in 610 CE.', 'It has 114 chapters (surahs) and more than 6,000 verses (ayat). It has been memorised and recited in the same Arabic, word for word, ever since. Today millions of people know all of it by heart.', 'Translations help people understand it, but they are seen as explanations of the meaning rather than the Quran itself. It speaks about God, mercy, justice, prophets, nature, family and the purpose of life.'],
    quote: [[2, 2]], foot: 'Quran 2:2. Translations in Shukr use Pickthall’s classic English.', go: '/quran', goLabel: 'Open the Quran' },
  { id: 'muhammad', icon: 'star', tone: 'c', q: 'Who was Muhammad ﷺ?', lead: 'The final prophet of Islam, and a man known for honesty long before his prophethood.',
    body: ['He was born in Makkah around 570 CE and lost both his parents as a child. As a young man he was called <i>al-Amin</i>, “the trustworthy”.', 'At 40 he received the first revelation. He spent the next 23 years teaching people to worship One God, look after orphans and the poor, free slaves, honour women and their rights, and treat even enemies with fairness.', 'He lived simply, mended his own clothes, helped at home, and was famous for his gentleness with children. He died in Madinah in 632 CE. Muslims love him deeply but do not worship him. When they mention his name they add ﷺ, “peace and blessings be upon him”.'],
    quote: [[21, 107]], foot: 'Quran 21:107. On his character see also Quran 68:4, and Sahih al-Bukhari on his helping at home.', go: '/seerah', goLabel: 'Read his life story' },
  { id: 'iman', icon: 'heart', tone: 'd', q: 'What do Muslims believe?', lead: 'Faith (iman) has six parts, often called the six pillars of faith.',
    list: [['God', 'There is one God, who has no partner and no equal.'], ['Angels', 'Unseen beings of light who carry out His commands.'], ['Books', 'Revealed scriptures, including the Torah, the Psalms, the Gospel and finally the Quran.'], ['Prophets', 'Messengers such as Adam, Noah, Abraham, Moses, Jesus and Muhammad, peace be upon them all.'], ['The Last Day', 'One day everyone will be raised again and treated with perfect justice.'], ['Divine decree', 'Nothing happens outside God’s knowledge and wisdom, the good and the hard alike.']],
    quote: [[2, 285]], foot: 'Quran 2:285 and 4:136. The six are listed together in the “Hadith of Jibril”, Sahih Muslim 8.', go: '/learn', goLabel: 'Learn the basics' },
  { id: 'pillars', icon: 'mosque', tone: 'e', q: 'What do Muslims do?', lead: 'Islam is built on five pillars: simple practices that shape the whole of life.',
    list: [['Shahada', 'Declaring that there is no god but God, and that Muhammad is His messenger.'], ['Salah', 'Praying five times a day: a few minutes to stop, breathe and reconnect.'], ['Zakat', 'Giving 2.5% of savings above a minimum each year to people in need.'], ['Sawm', 'Fasting from dawn to sunset during the month of Ramadan.'], ['Hajj', 'A pilgrimage to Makkah, once in a lifetime for those able to go.']],
    foot: 'Hadith reported in Sahih al-Bukhari 8 and Sahih Muslim 16: “Islam is built on five…”', go: '/mosques', goLabel: 'Visit a mosque near you' },
  { id: 'shukr', icon: 'sparkle', tone: 'f', q: 'Why does gratitude matter so much?', lead: 'In Islam, gratitude is a way of living, not just good manners.',
    body: ['Shukr means noticing a gift, knowing where it came from, and using it well. Breath, sight, people who love you and a warm meal are all gifts.', 'The Quran makes a beautiful promise to those who give thanks:'],
    quote: [[14, 7]], after: 'The Prophet ﷺ also said that a believer’s affairs are all good: when something good happens they are grateful, and when hardship comes they are patient, and both are good for them (Sahih Muslim 2999).', foot: 'Quran 14:7. Sahih Muslim 2999.', go: '/journal', goLabel: 'Try the gratitude journal' },
  { id: 'peace', icon: 'leaf', tone: 'g', q: 'Is Islam about peace?', lead: 'Peace runs through the faith. Even its greeting is “Peace be upon you”.',
    body: ['The word Islam shares a root with <i>salam</i>, peace. One of God’s names is <i>as-Salam</i>, The Source of Peace, and Paradise is called “the Home of Peace” (Quran 10:25).', 'This verse is often quoted, and the full wording matters. It was given as a law to earlier communities, and it makes an exception only for justice after murder or for serious violence in the land:'],
    quote: [[5, 32]], after: 'The Quran also says plainly: “There is no compulsion in religion” (2:256). Like followers of any faith, Muslims do not always live up to their teachings, but the teachings themselves call for mercy, justice and the protection of life.', foot: 'Quran 5:32, 2:256, 10:25.', go: '/hadith', goLabel: 'Read hadith on good character' },
  { id: 'after', icon: 'hourglass', tone: 'h', q: 'What happens after death?', lead: 'Muslims believe death is not an end, but a doorway.',
    body: ['After death the soul waits in a stage called the <i>barzakh</i>. Then comes the Day of Resurrection, when everyone is raised and every life is weighed with perfect fairness and great mercy.', 'Nothing good is ever lost, not even the smallest kindness:'],
    quote: [[99, 7], [99, 8]], after: 'Muslims hope for Jannah (Paradise) through God’s mercy rather than by earning it alone. The Prophet ﷺ taught that no one enters Paradise by their deeds alone, but only through God’s mercy (Sahih al-Bukhari 6467). This is why hope, not fear, is meant to lead the way.', foot: 'Quran 99:7–8, 3:185. Sahih al-Bukhari 6467.', go: '/akhirah', goLabel: 'Akhirah reminders' }
];

const FEEL = [
  { ref: [13, 28], tag: 'Peace', g: 'ni-g1' },
  { ref: [39, 53], tag: 'Mercy', g: 'ni-g2' },
  { ref: [2, 186], tag: 'Closeness', g: 'ni-g3' },
  { ref: [94, 5], ref2: [94, 6], tag: 'Hope', g: 'ni-g4' },
  { ref: [51, 56], tag: 'Purpose', g: 'ni-g5' },
  { ref: [49, 13], tag: 'Belonging', g: 'ni-g6' }
];

const ayah = (ar, en, [s, a]) => ({ ar: (ar[s - 1]?.[a - 1] || '').replace(/^\uFEFF/, ''), en: en[s - 1]?.[a - 1] || '' });
const stripBasmala = (t, s, a) => (a === 1 && s !== 1 && s !== 9) ? t.replace(/^بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ\s*/, '') : t;

function quoteHTML(ar, en, refs) {
  if (!refs?.length) return '';
  const parts = refs.map(r => { const x = ayah(ar, en, r); return { ar: stripBasmala(x.ar, r[0], r[1]), en: x.en, r }; });
  const label = refs.length > 1 && refs.every(r => r[0] === refs[0][0]) ? `${refs[0][0]}:${refs[0][1]}–${refs[refs.length - 1][1]}` : refs.map(r => r.join(':')).join(', ');
  return `<figure class="ni-quote"><div class="ar ni-ar" lang="ar">${parts.map(p => esc(p.ar) + ` <span class="ni-an">﴿${p.r[1].toLocaleString('ar-EG')}﴾</span>`).join(' ')}</div>
    <blockquote>${parts.map(p => esc(p.en)).join(' ')}</blockquote><figcaption>Quran ${label} · Pickthall</figcaption></figure>`;
}

const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘'`ʿʾ-]/g, '');
const letterOf = t => { const c = norm(t).replace(/[^a-z]/g, '')[0]; return c ? c.toUpperCase() : '#'; };

async function view() {
  const p = shell('New to Islam?');
  p.classList.add('ni-page');
  p.innerHTML = `<div class="ni-hero"><div class="ni-hero-glow"></div>
      <div class="ni-kicker">${I.sparkle} Welcome</div>
      <h1>New here?<br>Start here.</h1>
      <p>Shukr means <b>gratitude</b> in Arabic. It is an app about gratitude, calm and a meaningful life, shaped by the teachings of Islam.</p>
      <p class="ni-sub">Whether you are just curious, have a Muslim friend, or have recently become Muslim, you are very welcome. Take your time, look around, and skip anything you like.</p>
      <div class="ni-jump">
        <a href="#ni-words" data-jump="ni-words">${I.book} The words</a>
        <a href="#ni-menu" data-jump="ni-menu">${I.grid} The menu</a>
        <a href="#ni-big" data-jump="ni-big">${I.bulb} Big questions</a>
        <a href="#ni-feel" data-jump="ni-feel">${I.heart} Feel it</a>
      </div></div>
    <div id="ni-body"><div class="ni-loading">Loading…</div></div>`;
  $$('[data-jump]', p).forEach(a => a.addEventListener('click', e => { e.preventDefault(); document.getElementById(a.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));

  let gl, ar, en;
  try { [gl, ar, en] = await Promise.all([loadJSON('/data/ni-glossary.json'), loadJSON('/data/quran-ar.json'), loadJSON('/data/quran-en-pickthall.json')]); }
  catch (e) { $('#ni-body', p).innerHTML = `<div class="ni-err">${I.alert} Couldn’t load this page. Please check your connection and try again.</div>`; return; }
  gl = gl.slice().sort((a, b) => norm(a.t).localeCompare(norm(b.t)));
  const letters = [...new Set(gl.map(g => letterOf(g.t)))].sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));

  const body = $('#ni-body', p);
  body.innerHTML = `
    <section class="ni-sec" id="ni-words">
      <div class="ni-sh"><span class="ni-ic ni-t1">${I.book}</span><div><h2>What the words mean</h2><p>An A–Z of words you will see in Shukr and hear from Muslim friends.</p></div></div>
      <label class="ni-search">${I.search}<input id="ni-q" type="search" placeholder="Search a word, e.g. Wudu or thanks" autocomplete="off" aria-label="Search the glossary"></label>
      <div class="ni-letters" role="tablist"><button class="on" data-l="">All</button>${letters.map(l => `<button data-l="${l}">${l}</button>`).join('')}</div>
      <div class="ni-gl" id="ni-gl"></div>
      <div class="ni-none" id="ni-none" hidden>No match yet. <button class="ni-link" id="ni-askword">Ask Alim about it ${I.fwd || ''}</button></div>
    </section>

    <section class="ni-sec" id="ni-menu">
      <div class="ni-sh"><span class="ni-ic ni-t2">${I.grid}</span><div><h2>Your menu, explained</h2><p>Everything in the side menu, in one line each.</p></div></div>
      ${MENU.map(([g, items]) => [g, items.filter(it => !PENDING_NI.has(it[0]))]).filter(([, items]) => items.length).map(([g, items]) => `<div class="ni-mg"><div class="ni-mgt">${esc(g)}</div>${items.map(([path, label, ic, d]) => `
        <button class="ni-mi" data-go="${escAttr(path)}"><span class="ni-mic">${I[ic] || I.info}</span><span class="ni-mtx"><b>${esc(label)}</b><span>${esc(d)}</span></span><span class="ni-try">Try it</span></button>`).join('')}</div>`).join('')}
    </section>

    <section class="ni-sec" id="ni-big">
      <div class="ni-sh"><span class="ni-ic ni-t3">${I.bulb}</span><div><h2>Big questions</h2><p>Honest, simple answers, with sources so you can check them yourself.</p></div></div>
      <div class="ni-bq">${BIG.map(b => `
        <details class="ni-q ni-tone-${b.tone}" id="ni-q-${b.id}">
          <summary><span class="ni-qi">${I[b.icon] || I.info}</span><span class="ni-qt"><b>${esc(b.q)}</b><span>${esc(b.lead)}</span></span><span class="ni-chev">${I.fwd || '›'}</span></summary>
          <div class="ni-qb">
            ${(b.body || []).map(x => `<p>${x}</p>`).join('')}
            ${b.list ? `<ol class="ni-ol">${b.list.map(([h, d]) => `<li><b>${esc(h)}</b><span>${esc(d)}</span></li>`).join('')}</ol>` : ''}
            ${quoteHTML(ar, en, b.quote)}
            ${b.after ? `<p>${esc(b.after)}</p>` : ''}
            <div class="ni-ref">${I.bookmark} ${esc(b.foot)}</div>
            <div class="ni-qa"><button class="ni-pill" data-go="${b.go}">${esc(b.goLabel)} ${I.fwd || ''}</button><button class="ni-pill ghost" data-ask="${escAttr(b.q)}">${I.chat} Ask a follow-up</button></div>
          </div></details>`).join('')}</div>
    </section>

    <section class="ni-sec" id="ni-feel">
      <div class="ni-sh"><span class="ni-ic ni-t4">${I.heart}</span><div><h2>Feel it</h2><p>A few verses that millions of people hold close. Swipe through slowly.</p></div></div>
      <div class="ni-swipe" id="ni-swipe">${FEEL.map(f => { const refs = f.ref2 ? [f.ref, f.ref2] : [f.ref]; const xs = refs.map(r => ayah(ar, en, r)); return `
        <article class="ni-fc ${f.g}"><div class="ni-ftag">${esc(f.tag)}</div>
          <div class="ar ni-far" lang="ar">${xs.map(x => esc(x.ar)).join(' ۝ ')}</div>
          <p class="ni-fen">${xs.map(x => esc(x.en)).join(' ')}</p>
          <div class="ni-fref">Quran ${f.ref.join(':')}${f.ref2 ? '–' + f.ref2[1] : ''} · Pickthall</div></article>`; }).join('')}</div>
      <div class="ni-dots" id="ni-dots">${FEEL.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
    </section>

    <section class="ni-sec" id="ni-next">
      <div class="ni-sh"><span class="ni-ic ni-t5">${I.route}</span><div><h2>Gentle next steps</h2><p>No pressure, ever. Go at your own pace.</p></div></div>
      <div class="ni-steps">
        <button class="ni-step s1" id="ni-ask"><span>${I.lock}</span><b>Ask a question privately</b><small>Chat with Alim. Nobody else sees it.</small></button>
        <button class="ni-step s2" data-go="/scholars"><span>${I.cap}</span><b>Talk to a real scholar</b><small>A qualified person answers you.</small></button>
        <button class="ni-step s3" data-go="/mosques"><span>${I.pin}</span><b>Find a mosque near you</b><small>Mosques welcome visitors. Just say you’re curious.</small></button>
      </div>
      <details class="ni-shahada">
        <summary><span>${I.info}</span><b>Want to know how someone becomes Muslim?</b><span class="ni-chev">${I.fwd || '›'}</span></summary>
        <div class="ni-qb">
          <p>It is simpler than most people expect. There is no ceremony, fee, exam or new name required. A person who sincerely believes says the <b>Shahada</b>, the testimony of faith:</p>
          <div class="ar ni-ar ni-sha" lang="ar">أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا ٱللَّٰهُ، وَأَشْهَدُ أَنَّ مُحَمَّدًا رَسُولُ ٱللَّٰهِ</div>
          <p class="ni-tr"><i>Ash-hadu an la ilaha illallah, wa ash-hadu anna Muhammadan rasulullah.</i></p>
          <p class="ni-mean">“I bear witness that there is no god but God, and I bear witness that Muhammad is the messenger of God.”</p>
          <ul class="ni-ul">
            <li><b>The first half</b> means turning to the One God alone, the same God of Abraham, Moses and Jesus.</li>
            <li><b>The second half</b> means accepting Muhammad ﷺ as His final messenger and learning from his example.</li>
            <li>Many people choose to say it with a friend or at a mosque, where the community can welcome and support them. Saying it sincerely is what counts.</li>
            <li>Muslims believe it is a fresh start: past mistakes are wiped clean (see Quran 8:38, and Sahih Muslim 121).</li>
            <li>There is no rush. Faith is a personal decision and “there is no compulsion in religion” (Quran 2:256). Ask questions, read and take your time.</li>
          </ul>
          <div class="ni-qa"><button class="ni-pill" data-go="/scholars">Talk it through with a scholar ${I.fwd || ''}</button></div>
        </div>
      </details>
      <p class="ni-end">Whatever brought you here, we are glad you came. <span lang="ar" class="ni-salam">السلام عليكم</span>, peace be with you.</p>
    </section>`;

  // Glossary rendering + search + letter chips
  const glEl = $('#ni-gl', body), noneEl = $('#ni-none', body), qEl = $('#ni-q', body);
  let letter = '';
  const render = () => {
    const q = norm(qEl.value.trim());
    const rows = gl.filter(g => (!letter || letterOf(g.t) === letter) && (!q || norm(g.t + ' ' + g.m + ' ' + (g.say || '')).includes(q)));
    noneEl.hidden = rows.length > 0;
    let last = '';
    glEl.innerHTML = rows.map(g => { const L = letterOf(g.t); const head = (!letter && !q && L !== last) ? `<div class="ni-L">${L}</div>` : ''; last = L; return `${head}
      <div class="ni-term"><div class="ni-th"><b>${esc(g.t)}</b>${g.say ? `<span class="ni-say">${esc(g.say)}</span>` : ''}</div>
        <p>${esc(g.m)}</p>${g.go && !PENDING_NI.has(g.go) ? `<button class="ni-where" data-go="${escAttr(g.go)}">${I.pin} Where in Shukr</button>` : ''}</div>`; }).join('');
    bindGo(glEl);
  };
  qEl.addEventListener('input', () => { if (qEl.value && letter) { letter = ''; $$('.ni-letters button', body).forEach(b => b.classList.toggle('on', !b.dataset.l)); } render(); });
  $$('.ni-letters button', body).forEach(b => b.addEventListener('click', () => { letter = b.dataset.l; qEl.value = ''; $$('.ni-letters button', body).forEach(x => x.classList.toggle('on', x === b)); render(); }));
  $('#ni-askword', body).addEventListener('click', () => askAlim(`I am new to Islam. What does the word "${qEl.value.trim().slice(0, 60)}" mean, in simple terms?`));
  render();

  // Feel-it swipe dots
  const sw = $('#ni-swipe', body), dots = $$('#ni-dots i', body);
  sw.addEventListener('scroll', () => { const w = sw.firstElementChild?.offsetWidth || 1; const i = Math.round(sw.scrollLeft / (w + 12)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); }, { passive: true });
  dots.forEach((d, k) => d.addEventListener('click', () => sw.children[k]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })));

  $('#ni-ask', body).addEventListener('click', () => askAlim('I am new to Islam and curious about '));
  $$('[data-ask]', body).forEach(b => b.addEventListener('click', () => askAlim(`I am new to Islam and curious about this: ${b.dataset.ask} Could you explain it simply and kindly?`)));
  bindGo(body);
}

export const routes = [[/^\/new-to-islam$/, () => view(), 'newislam']];
