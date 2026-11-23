// Engagement layer: daily streak, multi-heart bursts, haptics, "new videos" pill, milestone celebrations.
import { $, state, toast } from './core.js';

const LSK = 'shukr.streak';
export function bumpStreak() {
  const today = new Date().toDateString(); let s = {}; try { s = JSON.parse(localStorage.getItem(LSK) || '{}'); } catch {}
  if (s.day === today) return s.n || 1;
  const y = new Date(Date.now() - 864e5).toDateString();
  s = { n: s.day === y ? (s.n || 0) + 1 : 1, day: today, best: Math.max(s.best || 0, s.day === y ? (s.n || 0) + 1 : 1) };
  localStorage.setItem(LSK, JSON.stringify(s));
  if ([3, 7, 14, 30, 50, 100].includes(s.n)) setTimeout(() => celebrate(`🔥 ${s.n}-day streak!`, 'Come back tomorrow to keep it going'), 1200);
  return s.n;
}
export const streak = () => { try { return JSON.parse(localStorage.getItem(LSK) || '{}').n || 0; } catch { return 0; } };
export function streakBadge() { const n = streak(); return n > 1 ? `<span class="eg-streak" title="${n}-day streak">🔥<b>${n}</b></span>` : ''; }

export function haptic(ms = 8) { try { if (state.user?.settings?.haptics !== false) navigator.vibrate?.(ms); } catch {} }

// Several floating hearts from the tap point (TikTok-style double tap, Shukr colours).
export function heartBurst(stage, x, y) {
  const r = stage.getBoundingClientRect(); const cx = (x ?? r.left + r.width / 2) - r.left, cy = (y ?? r.top + r.height / 2) - r.top;
  for (let i = 0; i < 6; i++) {
    const h = document.createElement('i'); h.className = 'eg-heart'; h.textContent = '❤';
    const dx = (Math.random() - .5) * 120, rot = (Math.random() - .5) * 50, sc = .8 + Math.random() * .9, d = 650 + Math.random() * 450;
    h.style.cssText = `left:${cx}px;top:${cy}px;--dx:${dx}px;--rot:${rot}deg;--sc:${sc};animation-duration:${d}ms;animation-delay:${i * 40}ms;color:${['#FF2D55', '#FF6B3D', '#FF3D7F', '#FFC21A'][i % 4]}`;
    stage.append(h); setTimeout(() => h.remove(), d + 400);
  }
  haptic(14);
}
export function celebrate(title, sub) {
  const el = document.createElement('div'); el.className = 'eg-cele'; el.innerHTML = `<div><b>${title}</b><small>${sub || ''}</small></div>`;
  for (let i = 0; i < 22; i++) { const c = document.createElement('i'); c.style.cssText = `--x:${(Math.random() - .5) * 360}px;--y:${-120 - Math.random() * 260}px;--r:${Math.random() * 720}deg;background:${['#FF2D55', '#FFC21A', '#20D5B5', '#6B3CF6', '#FF6B3D'][i % 5]};animation-delay:${Math.random() * 120}ms`; el.append(c); }
  document.body.append(el); haptic(30); setTimeout(() => el.classList.add('out'), 2200); setTimeout(() => el.remove(), 2700);
}
// Milestones on watched count (variable reward).
let watched = 0;
export function onWatched() { watched++; if ([10, 25, 50].includes(watched)) toast(watched === 10 ? '✨ 10 videos today — MashaAllah, keep learning' : watched === 25 ? '🌙 25 videos — you’re on a roll' : '🏆 50 videos — take a moment for dhikr?'); }
