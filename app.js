// PR Urban Social — content planner, post database & weekly numbers, with cloud sync.
'use strict';

const SYNC_KEY = 'social-sync-url';
const CACHE_KEY = 'social-cache';
const PLATFORMS = [
  { id: 'fb', name: 'Facebook' },
  { id: 'ig', name: 'Instagram' },
  { id: 'tt', name: 'TikTok' },
];
const pfName = id => (PLATFORMS.find(p => p.id === id) || {}).name || id;
const STATUSES = ['idea', 'drafted', 'scheduled', 'posted'];
const stLabel = { idea: 'Idea', drafted: 'Drafted', scheduled: 'Scheduled', posted: 'Posted' };

let DATA = null;
let postsFilter = 'all';

function ensureDefaults(d) {
  if (!d || typeof d !== 'object') d = {};
  if (!Array.isArray(d.plans)) d.plans = [];
  if (!Array.isArray(d.posts)) d.posts = [];
  if (!Array.isArray(d.weeks)) d.weeks = [];
  if (!d.updatedAt) d.updatedAt = 0;
  return d;
}
const seedData = () => ({ plans: [], posts: [], weeks: [], updatedAt: 0 });

// ---------- sync ----------
const getSyncUrl = () => localStorage.getItem(SYNC_KEY) || '';
const setSyncUrl = u => localStorage.setItem(SYNC_KEY, u);
let syncTimer = null;

function setStatus(msg, ok) {
  const el = document.getElementById('sync-status');
  el.textContent = msg; el.style.color = ok ? '#7bd88f' : '#999';
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function cacheLocal() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(DATA)); } catch (e) {} }

async function pullFromCloud(silent) {
  const url = getSyncUrl(); if (!url) return false;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const remote = ensureDefaults(await res.json());
    if (!DATA || (remote.updatedAt || 0) > (DATA.updatedAt || 0)) { DATA = remote; cacheLocal(); renderAll(); }
    setStatus('Synced ✓  (' + new Date().toLocaleTimeString() + ')', true);
    return true;
  } catch (e) { if (!silent) setStatus('Sync failed — check connection', false); return false; }
}
async function pushToCloud() {
  const url = getSyncUrl(); if (!url) return;
  DATA.updatedAt = Date.now(); cacheLocal();
  try {
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DATA) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    setStatus('Synced ✓  (' + new Date().toLocaleTimeString() + ')', true);
  } catch (e) { setStatus('Save failed — will retry when online', false); toast('Save failed — check internet'); }
}
const save = () => pushToCloud();

// ---------- helpers ----------
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtDate = iso => { if (!iso) return 'no date'; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
function weekStartOf(iso) { const d = new Date(iso + 'T00:00:00'); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.toISOString().slice(0, 10); }
const todayIso = () => new Date().toISOString().slice(0, 10);
const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const pfTag = id => `<span class="pf-tag pf-${id}">${pfName(id)}</span>`;

function armDelete(btn, onConfirm) {
  if (btn.dataset.armed === '1') { onConfirm(); return; }
  btn.dataset.armed = '1'; btn.classList.add('armed'); const orig = btn.textContent; btn.textContent = 'sure?';
  setTimeout(() => { btn.classList.remove('armed'); btn.textContent = orig; delete btn.dataset.armed; }, 2500);
}

// ---------- tabs ----------
function switchTab(name) {
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
}
document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

// ---------- planner ----------
const plSelected = new Set(['ig']);
function paintPlChips() {
  document.querySelectorAll('#pl-platforms .pf-chip').forEach(c => {
    const on = plSelected.has(c.dataset.pf);
    c.className = 'pf-chip' + (on ? ' on-' + c.dataset.pf : '');
  });
}
document.querySelectorAll('#pl-platforms .pf-chip').forEach(c => c.onclick = () => {
  const pf = c.dataset.pf;
  plSelected.has(pf) ? plSelected.delete(pf) : plSelected.add(pf);
  paintPlChips();
});

document.getElementById('pl-add').onclick = () => {
  const cap = document.getElementById('pl-cap').value.trim();
  if (!cap) { toast('Write the idea first'); return; }
  if (!plSelected.size) { toast('Pick at least one platform'); return; }
  DATA.plans.push({
    id: 'p-' + Date.now().toString(36),
    date: document.getElementById('pl-date').value || '',
    type: document.getElementById('pl-type').value,
    platforms: [...plSelected],
    caption: cap,
    status: 'idea',
  });
  document.getElementById('pl-cap').value = '';
  save(); renderPlanner(); toast('Added to plan');
};

function renderPlanner() {
  const wrap = document.getElementById('plan-list');
  const plans = DATA.plans.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  if (!plans.length) {
    wrap.innerHTML = '<p class="empty">Nothing planned yet. Add your first idea above — the content ideas bank in the <b>PR Urban Brain</b> app is a great place to steal from.</p>';
    return;
  }
  let html = '', lastWeek = null;
  for (const p of plans) {
    const wk = p.date ? weekStartOf(p.date) : 'unscheduled';
    if (wk !== lastWeek) {
      lastWeek = wk;
      html += `<div class="wk-head">${wk === 'unscheduled' ? 'No date yet' : 'Week of ' + fmtDate(wk)}</div>`;
    }
    html += `<div class="plan-card" data-id="${p.id}">
      <div class="top">
        <span class="date">${fmtDate(p.date)}</span>
        <button class="status st-${p.status}" data-act="status">${stLabel[p.status]}</button>
        <span style="font-size:11px;color:#888">${esc(p.type)}</span>
        ${p.platforms.map(pfTag).join('')}
        <span style="flex:1"></span>
        <button class="mini" data-act="edit" title="Edit">✎</button>
        <button class="mini" data-act="del" title="Delete">✕</button>
      </div>
      <div class="cap">${esc(p.caption)}</div>
    </div>`;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('.plan-card').forEach(card => {
    const p = DATA.plans.find(x => x.id === card.dataset.id);
    card.querySelector('[data-act="status"]').onclick = () => {
      const next = STATUSES[(STATUSES.indexOf(p.status) + 1) % STATUSES.length];
      p.status = next;
      if (next === 'posted') {
        const when = p.date || todayIso();
        for (const pf of p.platforms) {
          DATA.posts.push({ id: 'x-' + Date.now().toString(36) + '-' + pf, date: when, platform: pf, type: p.type, caption: p.caption, likes: null, comments: null, views: null });
        }
        toast('Moved to Posts — add the numbers there in a few days!');
      }
      save(); renderPlanner(); renderPosts();
    };
    card.querySelector('[data-act="edit"]').onclick = () => {
      const nc = prompt('Edit the idea/caption:', p.caption);
      if (nc !== null && nc.trim()) { p.caption = nc.trim(); save(); renderPlanner(); }
    };
    card.querySelector('[data-act="del"]').onclick = function () {
      armDelete(this, () => { DATA.plans = DATA.plans.filter(x => x.id !== p.id); save(); renderPlanner(); });
    };
  });
}

// ---------- posts ----------
document.querySelectorAll('#posts-filter .pf-chip').forEach(c => c.onclick = () => {
  postsFilter = c.dataset.pf;
  document.querySelectorAll('#posts-filter .pf-chip').forEach(x => {
    x.className = 'pf-chip' + (x.dataset.pf === postsFilter ? (postsFilter === 'all' ? ' on-all' : ' on-' + postsFilter) : '');
    if (x.dataset.pf === 'all') x.style.background = postsFilter === 'all' ? '#555' : '#222';
  });
  renderPosts();
});
document.getElementById('search-posts').addEventListener('input', renderPosts);

function renderPosts() {
  const wrap = document.getElementById('post-list');
  const q = document.getElementById('search-posts').value.trim().toLowerCase();
  let posts = DATA.posts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (postsFilter !== 'all') posts = posts.filter(p => p.platform === postsFilter);
  if (q) posts = posts.filter(p => (p.caption + ' ' + p.type).toLowerCase().includes(q));
  if (!posts.length) {
    wrap.innerHTML = '<p class="empty">No posts here yet. When you mark a planned post as <b>Posted</b>, it lands in this database automatically — then come back after a few days and fill in how it performed.</p>';
    return;
  }
  wrap.innerHTML = posts.map(p => `
    <div class="post-card" data-id="${p.id}">
      <div class="top">
        <span class="date" style="font-size:12px;color:#888">${fmtDate(p.date)}</span>
        ${pfTag(p.platform)}
        <span style="font-size:11px;color:#888">${esc(p.type)}</span>
        <span style="flex:1"></span>
        <button class="mini" data-act="del">✕</button>
      </div>
      <div class="cap">${esc(p.caption)}</div>
      <div class="metrics">
        <span class="metric">Likes <input type="number" data-m="likes" value="${p.likes == null ? '' : p.likes}"></span>
        <span class="metric">Comments <input type="number" data-m="comments" value="${p.comments == null ? '' : p.comments}"></span>
        <span class="metric">Views/Reach <input type="number" data-m="views" value="${p.views == null ? '' : p.views}"></span>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('.post-card').forEach(card => {
    const p = DATA.posts.find(x => x.id === card.dataset.id);
    card.querySelectorAll('input[data-m]').forEach(inp => inp.onchange = () => { p[inp.dataset.m] = num(inp.value); save(); });
    card.querySelector('[data-act="del"]').onclick = function () {
      armDelete(this, () => { DATA.posts = DATA.posts.filter(x => x.id !== p.id); save(); renderPosts(); });
    };
  });
}

// ---------- numbers ----------
function renderWeekForm() {
  const wk = weekStartOf(todayIso());
  const wrap = document.getElementById('week-form');
  wrap.innerHTML = PLATFORMS.map(p => {
    const ex = DATA.weeks.find(w => w.weekStart === wk && w.platform === p.id) || {};
    return `<div class="row3" style="margin-bottom:6px;align-items:end">
      <div style="align-self:center"><span class="pf-tag pf-${p.id}">${p.name}</span></div>
      <div><label>Followers</label><input type="number" data-wk-f="${p.id}" value="${ex.followers == null ? '' : ex.followers}"></div>
      <div><label>Views/Reach this week</label><input type="number" data-wk-v="${p.id}" value="${ex.views == null ? '' : ex.views}"></div>
    </div>`;
  }).join('');
}
document.getElementById('wk-save').onclick = () => {
  const wk = weekStartOf(todayIso());
  let any = false;
  for (const p of PLATFORMS) {
    const f = num(document.querySelector(`[data-wk-f="${p.id}"]`).value);
    const v = num(document.querySelector(`[data-wk-v="${p.id}"]`).value);
    if (f == null && v == null) continue;
    any = true;
    let row = DATA.weeks.find(w => w.weekStart === wk && w.platform === p.id);
    if (!row) { row = { id: 'w-' + wk + '-' + p.id, weekStart: wk, platform: p.id, followers: null, views: null }; DATA.weeks.push(row); }
    row.followers = f; row.views = v;
  }
  if (!any) { toast('Type at least one number first'); return; }
  save(); renderNumbers(); toast('Week saved 📈');
};

function renderNumbers() {
  renderWeekForm();
  const wrap = document.getElementById('numbers-history');
  if (!DATA.weeks.length) { wrap.innerHTML = '<p class="empty">No check-ins yet. Fill in this week above and hit save — growth tracking starts with the second week.</p>'; return; }
  const weeks = [...new Set(DATA.weeks.map(w => w.weekStart))].sort().reverse();
  let html = '';
  for (const p of PLATFORMS) {
    const rows = weeks.map(wk => DATA.weeks.find(w => w.weekStart === wk && w.platform === p.id)).filter(Boolean);
    if (!rows.length) continue;
    html += `<div class="form-panel"><h3><span class="pf-tag pf-${p.id}">${p.name}</span></h3><table>
      <tr><th>Week of</th><th>Followers</th><th>Views/Reach</th></tr>`;
    rows.forEach((r, i) => {
      const prev = rows[i + 1];
      const dF = prev && r.followers != null && prev.followers != null ? r.followers - prev.followers : null;
      const dV = prev && r.views != null && prev.views != null ? r.views - prev.views : null;
      const dd = d => d == null ? '' : `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</span>`;
      html += `<tr><td>${fmtDate(r.weekStart)}</td>
        <td><b>${r.followers == null ? '—' : r.followers}</b>${dd(dF)}</td>
        <td><b>${r.views == null ? '—' : r.views}</b>${dd(dV)}</td></tr>`;
    });
    html += '</table></div>';
  }
  wrap.innerHTML = html;
}

// ---------- sync UI ----------
document.getElementById('save-sync-btn').onclick = async () => {
  const url = document.getElementById('sync-url').value.trim();
  if (!/^https:\/\/.+\.json$/.test(url)) { toast('That doesn’t look like a sync code'); return; }
  setSyncUrl(url); setStatus('Connecting…', false);
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const remote = res.ok ? await res.json() : null;
    if (remote && (Array.isArray(remote.plans) || Array.isArray(remote.posts))) {
      DATA = ensureDefaults(remote); cacheLocal();
    } else { DATA = DATA || seedData(); await pushToCloud(); }
    document.getElementById('setup-banner').style.display = 'none';
    renderAll(); switchTab('planner'); setStatus('Synced ✓', true); toast('Connected!');
    startPolling();
  } catch (e) { setStatus('Could not connect — check the code', false); }
};
document.getElementById('backup-btn').onclick = () => {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pr-urban-social-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
};
function startPolling() { if (syncTimer) clearInterval(syncTimer); syncTimer = setInterval(() => pullFromCloud(true), 60000); }
window.addEventListener('focus', () => pullFromCloud(true));

function renderAll() { renderPlanner(); renderPosts(); renderNumbers(); paintPlChips(); }

// ---------- boot ----------
(function boot() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) { try { DATA = ensureDefaults(JSON.parse(cached)); } catch (e) {} }
  DATA = DATA || seedData();
  const url = getSyncUrl();
  document.getElementById('sync-url').value = url;
  document.getElementById('pl-date').value = todayIso();
  renderAll();
  if (!url) { document.getElementById('setup-banner').style.display = 'block'; switchTab('sync'); }
  else { switchTab('planner'); pullFromCloud(false); startPolling(); }
})();
