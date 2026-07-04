import { loadSongs, upsertSong, deleteSongDb, loadSetlist, saveSetlist,
         loadSavedSetlists, saveSetlistDb, deleteSetlistDb } from './db.js';

/* ================= STATE ================= */
let songs         = [];
let setlist       = [];
let savedSetlists = [];
let editingId     = null;

async function init() {
  songs         = await loadSongs();
  setlist       = loadSetlist();
  savedSetlists = await loadSavedSetlists();
  renderSongs();
  renderMoodFilter();
  renderSetlist();
  renderSavedSetlists();
}

/* ================= HELPERS ================= */
const $        = id => document.getElementById(id);
const fmt      = s  => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const esc      = t  => t.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const songById = id => songs.find(s => s.id === id);
const songTime = (s, countIntros) => s.len + (countIntros ? s.intro : 0);
const status   = msg => $('genStatus').textContent = msg;

/* segmented controls */
function segInit(id, def) {
  $(id).querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      $(id).querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
  });
  segSet(id, def);
}
function segSet(id, v) {
  $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
}
function segGet(id) {
  const on = $(id).querySelector('button.on');
  return on ? on.dataset.v : null;
}
segInit('fTempo', 'up');
segInit('fType',  'original');

/* ================= SONG CRUD ================= */
$('btnSave').addEventListener('click', async () => {
  const title = $('fTitle').value.trim();
  if (!title) { $('fTitle').focus(); return; }
  const len = (parseInt($('fMin').value) || 0) * 60 + (parseInt($('fSec').value) || 0);
  if (len <= 0) { $('fMin').focus(); return; }

  const song = {
    id:     editingId || ('s' + Date.now() + Math.floor(Math.random() * 999)),
    title,
    tempo:  segGet('fTempo') || 'up',
    type:   segGet('fType')  || 'original',
    len,
    intro:  parseInt($('fIntro').value) || 0,
    mood:   $('fMood').value.trim(),
    staple: $('fStaple').checked
  };

  try {
    await upsertSong(song);
    songs = editingId ? songs.map(s => s.id === editingId ? song : s) : [...songs, song];
    resetForm();
    renderSongs();
    renderMoodFilter();
    renderSetlist();
  } catch (e) { status('Error saving song: ' + e.message); }
});

$('btnCancel').addEventListener('click', resetForm);

function resetForm() {
  editingId = null;
  $('fTitle').value   = '';
  $('fMin').value     = '';
  $('fSec').value     = '';
  $('fMood').value    = '';
  $('fIntro').value   = '0';
  $('fStaple').checked = false;
  segSet('fTempo', 'up');
  segSet('fType', 'original');
  $('btnSave').textContent    = 'Add Song';
  $('btnCancel').style.display = 'none';
}

window.editSong = function(id) {
  const s = songById(id); if (!s) return;
  editingId = id;
  $('fTitle').value    = s.title;
  $('fMin').value      = Math.floor(s.len / 60);
  $('fSec').value      = s.len % 60;
  $('fIntro').value    = String(s.intro);
  $('fMood').value     = s.mood || '';
  $('fStaple').checked = !!s.staple;
  segSet('fTempo', s.tempo);
  segSet('fType',  s.type);
  $('btnSave').textContent    = 'Save Changes';
  $('btnCancel').style.display = 'inline-block';
  $('fTitle').focus();
};

window.deleteSong = async function(id) {
  const s = songById(id);
  if (!confirm('Delete "' + (s ? s.title : 'this song') + '" from the database?')) return;
  try {
    await deleteSongDb(id);
    songs   = songs.filter(x => x.id !== id);
    setlist = setlist.filter(x => x.songId !== id);
    saveSetlist(setlist);
    renderSongs(); renderMoodFilter(); renderSetlist();
  } catch (e) { status('Error deleting song: ' + e.message); }
};

function renderSongs() {
  $('songCount').textContent = songs.length ? songs.length + ' songs' : '';
  const el = $('songList');
  if (!songs.length) {
    el.innerHTML = '<div class="empty-note">No songs yet. Add your first one above.</div>';
    return;
  }
  el.innerHTML = songs.slice().sort((a, b) => a.title.localeCompare(b.title)).map(s => `
    <div class="song-item">
      <div class="t-title">${esc(s.title)}
        <small>${fmt(s.len)}${s.intro ? ' + ' + fmt(s.intro) + ' intro' : ''}${s.mood ? ' &bull; ' + esc(s.mood) : ''}</small>
      </div>
      <span class="badge ${s.tempo}">${s.tempo}</span>
      ${s.type === 'cover' ? '<span class="badge cover">Cover</span>' : ''}
      ${s.staple ? '<span class="badge staple">&#9733; Staple</span>' : ''}
      <button class="mini" title="Edit"   onclick="editSong('${s.id}')">&#9998;</button>
      <button class="mini" title="Delete" onclick="deleteSong('${s.id}')">&#10005;</button>
    </div>`).join('');
}

function renderMoodFilter() {
  const moods = [...new Set(songs.map(s => s.mood).filter(Boolean))].sort();
  const sel = $('gMood'), cur = sel.value;
  sel.innerHTML = '<option value="">All moods</option>' + moods.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
  sel.value = (cur && moods.includes(cur)) ? cur : '';
}

/* ================= GENERATOR ================= */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

$('btnGenerate').addEventListener('click', () => {
  const target      = (parseInt($('gTarget').value) || 45) * 60;
  const countIntros = $('gIntros').checked;
  const mood        = $('gMood').value;
  const nOriginals  = $('gOriginals').value !== '' ? parseInt($('gOriginals').value) : null;
  const nCovers     = $('gCovers').value    !== '' ? parseInt($('gCovers').value)    : null;

  const poolAll      = songs.filter(s => !mood || s.mood === mood);
  const poolOriginals = poolAll.filter(s => s.type === 'original');
  const poolCovers    = poolAll.filter(s => s.type === 'cover');

  if (nOriginals !== null && poolOriginals.length < nOriginals) {
    status('Not enough originals — you have ' + poolOriginals.length + ', need ' + nOriginals + '.'); return;
  }
  if (nCovers !== null && poolCovers.length < nCovers) {
    status('Not enough covers — you have ' + poolCovers.length + ', need ' + nCovers + '.'); return;
  }

  // Staples are always included
  const staples   = songs.filter(s => s.staple);
  const locked    = setlist.filter(x => x.locked && songById(x.songId));
  const lockedIds = new Set([...locked.map(x => x.songId), ...staples.map(s => s.id)]);
  const lockedAll = [
    ...locked,
    ...staples.filter(s => !locked.find(x => x.songId === s.id)).map(s => ({ songId: s.id, locked: true }))
  ];

  let best = null, bestDiff = Infinity;

  for (let attempt = 0; attempt < 400; attempt++) {
    let list  = lockedAll.map(x => songById(x.songId)).filter(Boolean);
    let total = list.reduce((t, s) => t + songTime(s, countIntros), 0);

    const lockedOriginals = list.filter(s => s.type === 'original').length;
    const lockedCovers    = list.filter(s => s.type === 'cover').length;

    const availOriginals = shuffle(poolOriginals.filter(s => !lockedIds.has(s.id)));
    const availCovers    = shuffle(poolCovers.filter(s => !lockedIds.has(s.id)));

    let picks = [];
    if (nOriginals !== null) {
      const need = nOriginals - lockedOriginals;
      if (need > availOriginals.length) continue;
      if (need > 0) picks.push(...availOriginals.slice(0, need));
    }
    if (nCovers !== null) {
      const need = nCovers - lockedCovers;
      if (need > availCovers.length) continue;
      if (need > 0) picks.push(...availCovers.slice(0, need));
    }

    for (const s of picks) { total += songTime(s, countIntros); list.push(s); }

    const usedIds = new Set([...lockedIds, ...picks.map(s => s.id)]);
    const filler  = shuffle(poolAll.filter(s => {
      if (usedIds.has(s.id)) return false;
      if (nOriginals !== null && s.type === 'original') return false;
      if (nCovers    !== null && s.type === 'cover')    return false;
      return true;
    }));

    for (const s of filler) {
      const t = songTime(s, countIntros);
      if (total + t <= target + 60) { list.push(s); total += t; }
      if (total >= target - 90) break;
    }

    if (list.length < 2) continue;
    list = arrangeSet(list);
    if (!list) continue;

    const diff = Math.abs(target - total) + (total > target + 60 ? 10000 : 0);
    if (diff < bestDiff) { bestDiff = diff; best = { list, total }; }
    if (bestDiff <= 45) break;
  }

  if (!best) { status('Could not build a set — try loosening the rules or the time target.'); return; }
  setlist = best.list.map(s => ({ songId: s.id, locked: lockedIds.has(s.id) }));
  saveSetlist(setlist);
  renderSetlist();

  const origCount  = best.list.filter(s => s.type === 'original').length;
  const coverCount = best.list.filter(s => s.type === 'cover').length;
  status('Set built: ' + best.list.length + ' songs (' + origCount + ' orig / ' + coverCount + ' covers), ' + fmt(best.total) + ' against a ' + fmt(target) + ' target.');
});

function arrangeSet(list) {
  const openUp  = $('gOpenUp').checked;
  const closeUp = $('gCloseUp').checked;
  const noBB    = $('gNoBB').checked;
  let arr = shuffle(list.slice());
  for (let tries = 0; tries < 300; tries++) {
    let ok = true;
    if (openUp  && arr[0].tempo !== 'up')                  ok = false;
    if (ok && closeUp && arr[arr.length-1].tempo !== 'up') ok = false;
    if (ok && noBB) {
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].tempo === 'down' && arr[i-1].tempo === 'down') { ok = false; break; }
      }
    }
    if (ok) return arr;
    arr = shuffle(arr);
  }
  return list;
}

/* ================= SETLIST RENDER + EDITING ================= */
function renderSetlist() {
  const countIntros = $('gIntros').checked;
  const rows = $('slRows');
  const show = $('gShow').value.trim();
  $('slShow').textContent = show || 'Set List';
  const items = setlist.map(x => songById(x.songId)).filter(Boolean);

  if (!items.length) {
    $('slSub').textContent = 'Hit Generate to build a set';
    rows.innerHTML = ''; $('slTotal').style.display = 'none'; return;
  }
  const date = $('gDate').value.trim();
  $('slSub').textContent = (date ? date + ' \u2022 ' : '') + 'Mason Douglas';

  let total = 0;
  rows.innerHTML = setlist.map((x, i) => {
    const s = songById(x.songId); if (!s) return '';
    total += songTime(s, countIntros);
    return '<div class="sl-row ' + (x.locked ? 'locked' : '') + '">' +
      '<span class="num">' + (i + 1) + '</span>' +
      '<span class="name">' + esc(s.title) + (s.intro ? '<span class="intro-flag">' + fmt(s.intro) + ' intro</span>' : '') + '</span>' +
      '<span class="meta arrow-' + s.tempo + '">' + fmt(s.len) + (s.type === 'cover' ? ' &bull; cover' : '') + '</span>' +
      '<span class="tools">' +
        '<button class="mini" title="Move up"          onclick="moveRow(' + i + ',-1)">&#8593;</button>' +
        '<button class="mini" title="Move down"        onclick="moveRow(' + i + ', 1)">&#8595;</button>' +
        '<button class="mini" title="' + (x.locked ? 'Unlock' : 'Lock in set') + '" onclick="toggleLock(' + i + ')">' + (x.locked ? '&#128274;' : '&#128275;') + '</button>' +
        '<button class="mini" title="Swap for another" onclick="swapRow(' + i + ')">&#8635;</button>' +
        '<button class="mini" title="Remove from set"  onclick="removeRow(' + i + ')">&#10005;</button>' +
      '</span>' +
    '</div>';
  }).join('');

  const target = (parseInt($('gTarget').value) || 45) * 60;
  $('slTotal').style.display = 'flex';
  $('slTargetNote').textContent = '(target ' + fmt(target) + ')';
  const clock = $('slClock');
  clock.textContent = fmt(total);
  clock.classList.toggle('over', total > target + 60);
}

window.moveRow = function(i, d) {
  const j = i + d; if (j < 0 || j >= setlist.length) return;
  [setlist[i], setlist[j]] = [setlist[j], setlist[i]];
  saveSetlist(setlist); renderSetlist();
};
window.toggleLock = function(i) {
  setlist[i].locked = !setlist[i].locked;
  saveSetlist(setlist); renderSetlist();
};
window.removeRow = function(i) {
  setlist.splice(i, 1);
  saveSetlist(setlist); renderSetlist();
};
window.swapRow = function(i) {
  const used = new Set(setlist.map(x => x.songId));
  const cur  = songById(setlist[i].songId);
  const pool = songs.filter(s => !used.has(s.id) && (!$('gMood').value || s.mood === $('gMood').value));
  if (!pool.length) { status('No unused songs left to swap in.'); return; }
  pool.sort((a, b) =>
    Math.abs(a.len - cur.len) + (a.tempo === cur.tempo ? 0 : 120) -
    (Math.abs(b.len - cur.len) + (b.tempo === cur.tempo ? 0 : 120))
  );
  const pick = pool[Math.floor(Math.random() * Math.min(3, pool.length))];
  setlist[i] = { songId: pick.id, locked: false };
  saveSetlist(setlist); renderSetlist();
};

['gTarget', 'gIntros', 'gShow', 'gDate'].forEach(id => $(id).addEventListener('input', renderSetlist));

/* ================= SAVE / LOAD SETLISTS ================= */
$('btnSaveSet').addEventListener('click', async () => {
  const items = setlist.filter(x => songById(x.songId));
  if (!items.length) { status('Generate a set list first.'); return; }
  const name = prompt('Name this set list:');
  if (!name || !name.trim()) return;
  try {
    const record = await saveSetlistDb(name.trim(), items, $('gShow').value.trim(), $('gDate').value.trim());
    savedSetlists = [record, ...savedSetlists];
    renderSavedSetlists();
    status('Set list saved: ' + name.trim());
  } catch (e) { status('Error saving set list: ' + e.message); }
});

function renderSavedSetlists() {
  const el = $('savedSetlists');
  if (!savedSetlists.length) {
    el.innerHTML = '<div class="empty-note">No saved sets yet.</div>';
    return;
  }
  el.innerHTML = savedSetlists.map(sl =>
    '<div class="saved-set-item">' +
      '<div class="saved-set-info">' +
        '<strong>' + esc(sl.name) + '</strong>' +
        '<small>' + (sl.show ? esc(sl.show) + (sl.date ? ' &bull; ' + esc(sl.date) : '') : (sl.date || '')) + '</small>' +
      '</div>' +
      '<button class="btn small ghost" onclick="loadSavedSet(\'' + sl.id + '\')">Load</button>' +
      '<button class="mini" title="Delete" onclick="deleteSavedSet(\'' + sl.id + '\')">&#10005;</button>' +
    '</div>'
  ).join('');
}

window.loadSavedSet = function(id) {
  const sl = savedSetlists.find(x => x.id === id);
  if (!sl) return;
  try {
    setlist = JSON.parse(sl.items);
    saveSetlist(setlist);
    if (sl.show) $('gShow').value = sl.show;
    if (sl.date) $('gDate').value = sl.date;
    renderSetlist();
    status('Loaded: ' + sl.name);
  } catch (e) { status('Error loading set: ' + e.message); }
};

window.deleteSavedSet = async function(id) {
  const sl = savedSetlists.find(x => x.id === id);
  if (!confirm('Delete saved set "' + (sl ? sl.name : '') + '"?')) return;
  try {
    await deleteSetlistDb(id);
    savedSetlists = savedSetlists.filter(x => x.id !== id);
    renderSavedSetlists();
  } catch (e) { status('Error deleting set: ' + e.message); }
};

/* ================= EXPORT ================= */
$('btnPrint').addEventListener('click', () => window.print());

$('btnWord').addEventListener('click', () => {
  const items = setlist.map(x => songById(x.songId)).filter(Boolean);
  if (!items.length) { status('Generate a set list first.'); return; }
  const countIntros = $('gIntros').checked;
  const show = esc($('gShow').value.trim() || 'Set List');
  const date = esc($('gDate').value.trim());
  let total = 0;
  const rows = items.map((s, i) => {
    total += songTime(s, countIntros);
    return '<tr>' +
      '<td style="font-size:16pt;color:#A8231B;font-weight:bold;padding:8pt 10pt 8pt 0;vertical-align:top;">' + (i + 1) + '.</td>' +
      '<td style="font-size:20pt;font-weight:bold;text-transform:uppercase;padding:8pt 0;border-bottom:1pt dashed #999;">' +
        esc(s.title) + (s.intro ? '<br><span style="font-size:10pt;color:#A8231B;font-weight:normal;">' + fmt(s.intro) + ' INTRO</span>' : '') +
      '</td>' +
      '<td style="font-size:11pt;color:#555;text-align:right;padding:8pt 0;border-bottom:1pt dashed #999;white-space:nowrap;vertical-align:top;">' +
        s.tempo.toUpperCase() + ' &bull; ' + fmt(s.len) + (s.type === 'cover' ? ' &bull; COVER' : '') +
      '</td></tr>';
  }).join('');
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + show + '</title></head>' +
    '<body style="font-family:Arial Black,Arial,sans-serif;">' +
    '<div style="text-align:center;border-bottom:3pt solid #000;padding-bottom:10pt;margin-bottom:6pt;">' +
      '<span style="font-size:28pt;font-weight:bold;text-transform:uppercase;">' + show + '</span><br>' +
      '<span style="font-size:11pt;letter-spacing:2pt;color:#555;">' + (date ? date + ' &bull; ' : '') + 'MASON DOUGLAS</span>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;">' + rows + '</table>' +
    '<p style="text-align:right;font-size:14pt;font-weight:bold;margin-top:14pt;">TOTAL: ' + fmt(total) + '</p>' +
    '</body></html>';
  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = (show.replace(/[^a-z0-9]+/gi, '-') || 'set-list') + '.doc';
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ================= BOOT ================= */
init();
