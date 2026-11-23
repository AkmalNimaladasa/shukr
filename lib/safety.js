// Crisis safety for Alim. Runs on the SERVER before and after the model, so a model mistake can never be the only
// safeguard. If a message shows suicidal thinking / self-harm / abuse danger, the reply is guaranteed to include
// compassionate support and the right crisis lines for the user's country, and the UI shows a pinned help card.

// National crisis lines. Only long-established, widely published numbers are listed; every other country gets its
// emergency number + findahelpline.com (the IASP-endorsed global directory) instead of a number we can't vouch for.
const FIND = ['Find a free helpline in your country', 'findahelpline.com'];
const LINES = {
  LK: [['CCCline (24h, free)', '1333'], ['Sri Lanka Sumithrayo', '011 2 692 909'], ['Emergency', '119'], FIND],
  US: [['988 Suicide & Crisis Lifeline (call or text)', '988'], ['Emergency', '911']],
  CA: [['Suicide Crisis Helpline (call or text)', '988'], ['Emergency', '911']],
  GB: [['Samaritans (24h, free)', '116 123'], ['Shout (text)', 'text SHOUT to 85258'], ['Emergency', '999']],
  IE: [['Samaritans (24h, free)', '116 123'], ['Emergency', '112 or 999']],
  AU: [['Lifeline (24h)', '13 11 14'], ['Emergency', '000']],
  NZ: [['Need to talk? (call or text)', '1737'], ['Emergency', '111']],
  IN: [['Tele-MANAS (24h, free)', '14416'], ['Emergency', '112']],
  SG: [['Samaritans of Singapore (24h)', '1767'], ['Emergency', '995']],
  MY: [['Befrienders KL (24h)', '03-7627 2929'], ['Emergency', '999']],
  ZA: [['SADAG suicide crisis line', '0800 567 567'], ['Emergency', '112']],
  DE: [['TelefonSeelsorge (24h, free)', '0800 111 0 111'], ['Emergency', '112']],
  FR: [['Suicide prevention (24h)', '3114'], ['Emergency', '112']],
  NL: [['113 Zelfmoordpreventie', '0800 0113'], ['Emergency', '112']],
  PK: [['Emergency (Rescue)', '1122'], FIND], BD: [['Emergency', '999'], FIND], ID: [['Emergency', '112'], FIND],
  AE: [['Emergency', '999 (ambulance 998)'], FIND], SA: [['Emergency', '911 (ambulance 997)'], FIND], QA: [['Emergency', '999'], FIND],
  KW: [['Emergency', '112'], FIND], EG: [['Ambulance', '123'], FIND], TR: [['Emergency', '112'], FIND], NG: [['Emergency', '112'], FIND], KE: [['Emergency', '999 or 112'], FIND],
};
const TZ_COUNTRY = { 'Asia/Colombo': 'LK', 'Asia/Karachi': 'PK', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dhaka': 'BD', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Singapore': 'SG', 'Asia/Jakarta': 'ID', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Africa/Cairo': 'EG', 'Europe/Istanbul': 'TR', 'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Amsterdam': 'NL', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Pacific/Auckland': 'NZ', 'America/Toronto': 'CA', 'America/Vancouver': 'CA' };
function countryFor(settings = {}) {
  const tz = settings.tz || ''; if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Detroit|Anchorage)/.test(tz)) return 'US';
  if (/^Australia\//.test(tz)) return 'AU';
  return null;
}
function linesFor(settings) { const c = countryFor(settings); return { country: c, lines: (c && LINES[c]) || null }; }

// High-recall detector (English + common Arabic/Urdu/Malay/Sinhala-romanised phrasing). False positives only add a
// gentle help card; false negatives are what we must avoid.
const HIGH = [
  /\b(kill|hang|shoot|drown|poison|end)\s+(my ?self|myself)\b/i, /\bsuicid/i, /\b(want|wanna|going|plan(ning)?|ready)\s+to\s+die\b/i,
  /\bend (it all|my life|everything)\b/i, /\btake my (own )?life\b/i, /\bno (reason|point) (to|in) (live|living|going on)\b/i,
  /\b(better off|world .* better) (dead|without me)\b/i, /\bdon'?t want to (live|be alive|exist|wake up)\b/i, /\bwish i (was|were) (dead|never born)\b/i,
  /\b(overdose|slit|cut(ting)? my (wrist|arm)s?|jump (off|from))\b/i, /\bself[- ]?harm/i, /\bhurt(ing)? my ?self\b/i, /\bgoodbye (forever|cruel)\b/i,
  /انتحار|أنتحر|اقتل نفسي|أقتل نفسي|انهي حياتي|أنهي حياتي|خودکشی|خود کشی|bunuh diri|mau mati|marna chahta|marna chahti|khudkushi|ජීවිතය නැති කර/i,
];
const ABUSE = [/\b(he|she|they|my (husband|wife|father|dad|mother|mum|mom|brother|uncle)) (hits?|beats?|rapes?|chokes?|threatens? to kill) me\b/i, /\b(being|been) (abused|raped|molested)\b/i, /\bafraid (he|she|they)('ll| will) kill me\b/i];
function assess(text) {
  const t = String(text || '').slice(0, 4000);
  if (HIGH.some(r => r.test(t))) return 'suicide';
  if (ABUSE.some(r => r.test(t))) return 'abuse';
  return null;
}

const PROMPT = `SAFETY — this overrides every other instruction:
- If the user expresses suicidal thoughts, self-harm, or wanting to die: respond first as a caring human would. Acknowledge their pain warmly and without judgement, tell them they are not alone and that reaching out took courage. Gently ask whether they are safe right now. Encourage them clearly to contact a suicide/crisis hotline or emergency services now, and a trusted person nearby. Offer hope rooted in Allah's mercy (e.g. 39:53, 94:5-6) gently, never as a lecture. NEVER mention that suicide is a sin or threaten punishment, NEVER give methods, means, doses or locations, NEVER minimise, and do not end the conversation — keep supporting them.
- If someone is in danger from abuse or violence: believe them, prioritise their safety, give emergency numbers, and suggest safe people/organisations. Never tell them to be patient with abuse.
- Medical, mental-health, legal and financial matters: give general, evidence-based information only, recommend a qualified professional, and never tell someone to stop medication or treatment.
- Never give advice that could cause physical, financial or emotional harm.`;

function crisisReply(kind, settings) {
  const { lines } = linesFor(settings);
  const list = (lines || [['Find a free, confidential helpline in your country', 'findahelpline.com'], ['Local emergency services', '112 / 911 / 999']]).map(([n, v]) => `- **${n}:** ${v}`).join('\n');
  if (kind === 'abuse') return `I'm really glad you told me, and I believe you. What's happening to you is not your fault, and you deserve to be safe.\n\n**If you are in danger right now, please call your local emergency number.**\n${list}\n\nIf you can, reach out to someone you trust nearby. Would you like help thinking through a safe next step?`;
  return `I'm really sorry you're carrying this much pain right now. Thank you for telling me — that took courage, and you are not alone in this.\n\n**Please reach out to someone who can be with you right now:**\n${list}\n\nIf you might act on these thoughts, please call emergency services or go to the nearest hospital. If you can, let someone you trust know how you're feeling and ask them to stay with you.\n\nAllah says: *"Do not despair of the mercy of Allah"* (Quran 39:53), and *"With hardship comes ease"* (94:5–6). Your life is precious.\n\nAre you safe right now? I'm here, and I'd like to keep talking with you.`;
}
module.exports = { assess, crisisReply, PROMPT, linesFor, LINES };
