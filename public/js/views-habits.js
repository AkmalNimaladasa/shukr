import { $, $$, esc, escAttr, I, api, toast, shell, loadingHTML, onCleanup } from './core.js';

const suggestions = [
  { name: 'Read Quran', category: 'faith', icon: 'quran' },
  { name: 'Morning adhkar', category: 'faith', icon: 'beads' },
  { name: 'Give sadaqah', category: 'kindness', icon: 'heart' },
  { name: 'Take a walk', category: 'wellbeing', icon: 'leaf' }
];
const dateLabel = (day, options) => new Date(day + 'T12:00:00Z').toLocaleDateString([], { timeZone: 'UTC', ...options });

export async function viewHabits() {
  const p = shell('Habit tracker');
  p.innerHTML = loadingHTML('Loading your habits…');
  let data, selected = '', alive = true, busy = false, request = 0;
  onCleanup(() => { alive = false; request++; });
  const current = () => alive && p.isConnected;
  const row = h => `<article class="habit-row ${h.completed ? 'is-complete' : ''}">
    <label class="habit-check"><input type="checkbox" data-habit-log="${h.id}" ${h.completed ? 'checked' : ''} ${!h.active ? 'disabled' : ''}>
      <span class="habit-icon" aria-hidden="true">${I[h.icon] || I.leaf}</span>
      <span class="habit-copy"><strong>${esc(h.name)}</strong><span class="muted small">${esc(h.category)} · ${h.streak} day streak · ${h.weekCompleted}/7 days</span></span>
    </label>
    <details class="habit-menu"><summary aria-label="Options for ${escAttr(h.name)}">${I.more || '…'}</summary>
      <div class="habit-menu-panel"><button type="button" data-habit-archive="${h.id}">${h.active ? 'Archive' : 'Restore'}</button></div>
    </details>
    <div class="habit-history" aria-label="Last seven days">${h.history.map(x => `<span class="${x.completed ? 'done' : ''}" title="${escAttr(x.day + (x.completed ? ': completed' : ': not completed'))}"><span class="habit-sr-only">${esc(x.day)}: ${x.completed ? 'completed' : 'not completed'}</span></span>`).join('')}</div>
  </article>`;
  function render() {
    if (!current()) return;
    const active = data.habits.filter(h => h.active), archived = data.habits.filter(h => !h.active);
    const today = data.days[data.days.length - 1];
    p.innerHTML = `<div class="habits-view">
      <header class="habit-intro"><div class="muted small">SMALL STEPS, LASTING CHANGE</div><h2>A little, every day.</h2><p class="muted">Build a rhythm that brings you closer to what matters. Your habits are private.</p></header>
      <section class="card habit-progress" aria-label="Daily progress"><strong>${data.summary.completed} of ${data.summary.active}</strong><span class="muted"> habits completed ${selected === today ? 'today' : 'on ' + esc(dateLabel(selected, { month: 'short', day: 'numeric' }))}</span><progress max="${Math.max(1, data.summary.active)}" value="${data.summary.completed}" aria-label="Completed habits"></progress></section>
      <nav class="habit-days" aria-label="Select one of the last seven days">${data.days.map(day => `<button type="button" data-habit-day="${escAttr(day)}" aria-pressed="${day === selected}" aria-label="${escAttr(dateLabel(day, { weekday: 'long', month: 'long', day: 'numeric' }))}"><span>${esc(dateLabel(day, { weekday: 'short' }))}</span><strong>${esc(day.slice(8))}</strong>${day === today ? '<small>Today</small>' : '<small>&nbsp;</small>'}</button>`).join('')}</nav>
      <section class="card habit-list" aria-label="Daily habits"><h3>${selected === today ? 'Today’s habits' : esc(dateLabel(selected, { month: 'long', day: 'numeric' }))}</h3>${active.length ? active.map(row).join('') : '<p class="muted">Start with one small habit. Add your own below, or choose a suggestion.</p>'}</section>
      <section class="card"><h3>Add habit</h3><form id="habit-add" class="habit-add"><label for="habit-name">Habit name</label><input class="input" id="habit-name" name="name" maxlength="80" required placeholder="e.g. Read a page of Quran" autocomplete="off"><label for="habit-category">Category</label><select class="input" id="habit-category" name="category"><option value="personal">Personal</option><option value="faith">Faith</option><option value="wellbeing">Wellbeing</option><option value="kindness">Kindness</option><option value="learning">Learning</option></select><button class="btn accent" type="submit">${I.plus} Add habit</button></form>
      <p class="muted small">Or try a small step</p><div class="habit-suggestions">${suggestions.map((s, i) => `<button class="btn" type="button" data-habit-suggest="${i}" ${active.some(h => h.name.toLowerCase() === s.name.toLowerCase()) ? 'disabled' : ''}>${I[s.icon] || I.leaf}${esc(s.name)}</button>`).join('')}</div></section>
      ${archived.length ? `<details class="card habit-archived"><summary>Archived habits (${archived.length})</summary><p class="muted small">History is kept. Restore a habit to track it again.</p>${archived.map(row).join('')}</details>` : ''}
    </div>`;
    for (const button of $$('[data-habit-day]', p)) button.onclick = () => load(button.dataset.habitDay);
    for (const input of $$('[data-habit-log]', p)) input.onchange = () => mutate('/' + input.dataset.habitLog + '/log', 'PUT', { day: selected, completed: input.checked });
    for (const button of $$('[data-habit-archive]', p)) button.onclick = () => {
      const h = data.habits.find(h => String(h.id) === button.dataset.habitArchive);
      mutate('/' + h.id, 'PATCH', { active: !h.active });
    };
    for (const button of $$('[data-habit-suggest]', p)) button.onclick = () => mutate('', 'POST', suggestions[Number(button.dataset.habitSuggest)]);
    const form = $('#habit-add', p);
    if (form) form.onsubmit = e => {
      e.preventDefault();
      const name = $('#habit-name', p).value.trim();
      if (!name) { toast('Give your habit a name'); return; }
      mutate('', 'POST', { name, category: $('#habit-category', p).value });
    };
  }
  async function load(day = '') {
    if (busy) return;
    const id = ++request;
    try {
      const result = await api('/habits' + (day ? '?day=' + encodeURIComponent(day) : ''));
      if (!current() || id !== request) return;
      data = result; selected = result.day; render();
    } catch (e) {
      if (!current() || id !== request) return;
      if (data) toast(e.message);
      else {
        p.innerHTML = '<div class="card habits-view"><h3>Could not load habits</h3><p id="habit-error"></p><button class="btn" id="habit-retry">Try again</button></div>';
        const message = $('#habit-error', p), retry = $('#habit-retry', p);
        if (message) message.textContent = e.message;
        if (retry) retry.onclick = () => load();
      }
    }
  }
  async function mutate(path, method, body) {
    if (busy || !current()) return;
    busy = true; request++;
    p.setAttribute('aria-busy', 'true');
    for (const control of $$('button,input,select', p)) control.disabled = true;
    try {
      await api('/habits' + path, { method, body });
      if (!current()) return;
      // Always reload the selected day: create/archive responses need not contain a collection.
      const result = await api('/habits?day=' + encodeURIComponent(selected));
      if (current()) { data = result; selected = result.day; render(); }
    } catch (e) { if (current()) { render(); toast(e.message); } }
    finally { busy = false; if (current()) p.removeAttribute('aria-busy'); }
  }
  await load();
}
