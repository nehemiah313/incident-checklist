let GUIDE = { phases: [], report_fields: [] };
const state = { tasks: {}, incident: null, log: [] }; // tasks: "phaseId|idx" -> true
const LS_KEY = 'incident-v1';
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (d) { Object.assign(state.tasks, d.tasks || {}); state.incident = d.incident || null; state.log = d.log || []; }
  } catch (e) {}
}
function tkey(p, i) { return p + '|' + i; }

function buildPhases() {
  $('phases').innerHTML = GUIDE.phases.map(p => {
    const done = p.tasks.filter((_, i) => state.tasks[tkey(p.id, i)]).length;
    return '<div class="phase" data-phase="' + p.id + '"><div class="phase-head"><h3>' + esc(p.title) + '</h3>' +
      '<span class="muted small">' + esc(p.window) + ' · ' + done + '/' + p.tasks.length + '</span></div>' +
      p.tasks.map((t, i) => {
        const k = tkey(p.id, i);
        const on = !!state.tasks[k];
        return '<label class="task' + (on ? ' done' : '') + '"><input type="checkbox" data-task="' + k + '"' + (on ? ' checked' : '') + '>' +
          '<span class="task-t">' + esc(t.t) + '</span><span class="task-why">' + esc(t.why) + '</span></label>';
      }).join('') + '</div>';
  }).join('');
  $('phases').querySelectorAll('[data-task]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.tasks[cb.dataset.task] = true; else delete state.tasks[cb.dataset.task];
      cb.closest('.task').classList.toggle('done', cb.checked);
      save(); updatePhaseCounts();
    });
  });
}

function updatePhaseCounts() {
  document.querySelectorAll('.phase').forEach(el => {
    const p = GUIDE.phases.find(x => x.id === el.dataset.phase);
    const done = p.tasks.filter((_, i) => state.tasks[tkey(p.id, i)]).length;
    el.querySelector('.phase-head .muted').textContent = p.window + ' · ' + done + '/' + p.tasks.length;
  });
}

function buildReportFields() {
  $('reportFields').innerHTML = '<div class="fields">' + GUIDE.report_fields.map(f =>
    '<div class="field"><strong>' + esc(f.f) + '</strong><span>' + esc(f.d) + '</span></div>').join('') + '</div>';
}

function fmtDur(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

let cdTimer = null;
function startCountdown() {
  clearInterval(cdTimer);
  if (!state.incident || !state.incident.discovery) { $('countdown').classList.add('hidden'); return; }
  $('countdown').classList.remove('hidden');
  const disc = new Date(state.incident.discovery);
  const deadline = new Date(disc.getTime() + 72 * 3600 * 1000);
  $('cdDisc').textContent = 'Discovered ' + disc.toLocaleString() + ' · Report due ' + deadline.toLocaleString();
  const tick = () => {
    const left = deadline - Date.now();
    $('cdTime').textContent = fmtDur(left);
    $('countdown').classList.toggle('urgent', left < 12 * 3600 * 1000);
    $('countdown').classList.toggle('overdue', left <= 0);
    if (left <= 0) $('cdTime').textContent = 'OVERDUE ' + fmtDur(-left);
  };
  tick();
  cdTimer = setInterval(tick, 1000);
}

function renderLog() {
  $('logList').innerHTML = state.log.length
    ? state.log.map((e, i) => '<div class="log-e"><span class="log-t">' + esc(e.t) + '</span><span>' + esc(e.text) + '</span>' +
      '<button class="linklike" data-dellog="' + i + '">remove</button></div>').join('')
    : '<p class="muted">No entries yet. Log every action with a timestamp; it becomes the backbone of your DoD report.</p>';
  $('logList').querySelectorAll('[data-dellog]').forEach(b => {
    b.addEventListener('click', () => { state.log.splice(+b.dataset.dellog, 1); save(); renderLog(); });
  });
}

function addLog(text) {
  state.log.push({ t: new Date().toLocaleString(), text });
  save(); renderLog();
}

function exportMd() {
  let s = '# Cyber Incident Record\n\n';
  if (state.incident) {
    s += '**Incident:** ' + (state.incident.name || 'Unnamed') + '\n\n';
    if (state.incident.discovery) {
      const disc = new Date(state.incident.discovery);
      s += '**Discovered:** ' + disc.toLocaleString() + '\n\n';
      s += '**72-hour deadline:** ' + new Date(disc.getTime() + 72 * 3600 * 1000).toLocaleString() + '\n\n';
    }
  }
  s += '## Response checklist\n\n';
  for (const p of GUIDE.phases) {
    s += '### ' + p.title + '\n\n';
    p.tasks.forEach((t, i) => {
      s += '- [' + (state.tasks[tkey(p.id, i)] ? 'x' : ' ') + '] ' + t.t + '\n';
    });
    s += '\n';
  }
  s += '## Incident log\n\n';
  for (const e of state.log) s += '- **' + e.t + ':** ' + e.text + '\n';
  s += '\n_File the actual report through the DoD DIBNet portal. This record supports, but does not replace, that filing._\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([s], { type: 'text/markdown' }));
  a.download = 'incident-record.md';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

async function init() {
  const res = await fetch('data/incident-guide.json');
  GUIDE = await res.json();
  load();
  if (state.incident) {
    $('inc_name').value = state.incident.name || '';
    if (state.incident.discovery) $('inc_disc').value = state.incident.discovery;
  }
  buildPhases();
  buildReportFields();
  renderLog();
  startCountdown();
  $('startInc').addEventListener('click', () => {
    state.incident = { name: $('inc_name').value.trim(), discovery: $('inc_disc').value };
    if (!state.incident.discovery) { alert('Enter the discovery date and time. The 72-hour clock starts at discovery.'); return; }
    save(); startCountdown();
    addLog('Incident declared: ' + (state.incident.name || 'unnamed') + '. 72-hour clock started.');
  });
  $('inc_name').addEventListener('change', () => { if (state.incident) { state.incident.name = $('inc_name').value.trim(); save(); } });
  $('clearInc').addEventListener('click', () => {
    if (confirm('Clear the active incident? The checklist and log stay.')) {
      state.incident = null; save(); startCountdown();
    }
  });
  $('addLog').addEventListener('click', () => {
    const v = $('logEntry').value.trim();
    if (v) { addLog(v); $('logEntry').value = ''; }
  });
  $('logEntry').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('addLog').click(); });
  $('exportMd').addEventListener('click', exportMd);
  $('printBtn').addEventListener('click', () => window.print());
}
init();
