const campaignId = window.location.pathname.split('/').pop();
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const els = {
  name: document.getElementById('campaign-name'),
  desc: document.getElementById('campaign-desc'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsPanel: document.getElementById('settings-panel'),
  setName: document.getElementById('set-name'),
  setDesc: document.getElementById('set-description'),
  setStart: document.getElementById('set-time-start'),
  setEnd: document.getElementById('set-time-end'),
  setSlot: document.getElementById('set-slot-minutes'),
  setRosterChips: document.getElementById('set-roster-chips'),
  setRosterText: document.getElementById('set-roster-text'),
  saveSettingsBtn: document.getElementById('save-settings-btn'),
  deleteCampaignBtn: document.getElementById('delete-campaign-btn'),
  settingsError: document.getElementById('settings-error'),

  prevMonth: document.getElementById('prev-month'),
  nextMonth: document.getElementById('next-month'),
  todayBtn: document.getElementById('today-btn'),
  calendarTitle: document.getElementById('calendar-title'),
  calendarGrid: document.getElementById('calendar-grid'),
  calendarCard: document.getElementById('calendar-card'),

  playerSelectCard: document.getElementById('player-select-card'),
  playerSelectMain: document.getElementById('player-select-main'),

  weekSection: document.getElementById('week-section'),
  weekTitle: document.getElementById('week-title'),
  tabMine: document.getElementById('tab-mine'),
  tabGroup: document.getElementById('tab-group'),
  minePanel: document.getElementById('mine-panel'),
  groupPanel: document.getElementById('group-panel'),
  noteInput: document.getElementById('note-input'),
  gridTable: document.getElementById('grid-table'),
  rosterStatus: document.getElementById('roster-status'),
  notesPanel: document.getElementById('notes-panel'),

  errorState: document.getElementById('error-state'),
  tooltip: document.getElementById('tooltip'),
  toast: document.getElementById('toast')
};

let campaign = null;
let viewYear, viewMonth;
let mode = 'mine';
let selectedSlots = new Map();
let spotlightKey = null;
let isPainting = false, paintValue = 'available', lastPaintedCell = null;
let settingsRoster = [];
let toastTimer = null;
let currentPlayer = null;
let saveTimeout = null;

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function toKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + shift);
  return d;
}

function weekDaysFromKey(weekKey) {
  const [y, m, d] = weekKey.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(base);
    dt.setDate(base.getDate() + i);
    out.push(dt);
  }
  return out;
}

function formatTime(t) {
  let [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad2(m)}${suffix}`;
}

function fullDaySlots() {
  const out = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += campaign.slotMinutes) {
      out.push(`${pad2(h)}:${pad2(m)}`);
    }
  }
  return out;
}

function slotList() {
  return fullDaySlots();
}

async function loadCampaign() {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) {
      els.errorState.style.display = 'block';
      els.errorState.textContent = "This campaign doesn't exist anymore.";
      els.name.textContent = 'Not found';
      return;
    }
    campaign = await res.json();

    els.name.textContent = campaign.name;
    els.desc.textContent = campaign.description || '';
    els.desc.style.display = campaign.description ? 'block' : 'none';

    const today = new Date();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();

    populateSettingsFields();
    populatePlayerSelectMain();
    renderCalendar();

    if (campaign.selectedWeek) {
      els.weekSection.style.display = 'block';
      renderWeek();
    }
  } catch (err) {
    console.error('Error loading campaign:', err);
    showToast('Error loading campaign: ' + err.message);
  }
}

function buildCalendarWeeks(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const start = mondayOf(firstOfMonth);

  const weeks = [];
  let cursor = new Date(start);
  while (cursor <= lastOfMonth) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function renderCalendar() {
  els.calendarTitle.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
  const weeks = buildCalendarWeeks(viewYear, viewMonth);

  els.calendarGrid.innerHTML = '';

  const dowRow = document.createElement('div');
  dowRow.className = 'cal-dow-row';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d => {
    const cell = document.createElement('div');
    cell.className = 'cal-dow';
    cell.textContent = d;
    dowRow.appendChild(cell);
  });
  els.calendarGrid.appendChild(dowRow);

  weeks.forEach(week => {
    const weekKey = toKey(week[0]);
    const row = document.createElement('div');
    row.className = 'cal-week-row';
    if (campaign.selectedWeek === weekKey) row.classList.add('selected');

    const hasResponses = campaign.weeks[weekKey] &&
      Object.keys(campaign.weeks[weekKey].responses || {}).length > 0;

    week.forEach(day => {
      const cell = document.createElement('div');
      cell.className = 'cal-day';
      if (day.getMonth() !== viewMonth) cell.classList.add('dim');
      if (toKey(day) === toKey(new Date())) cell.classList.add('is-today');
      cell.textContent = day.getDate();
      row.appendChild(cell);
    });

    if (hasResponses) {
      const dot = document.createElement('div');
      dot.className = 'cal-dot';
      row.appendChild(dot);
    }

    row.addEventListener('click', () => selectWeek(weekKey));
    els.calendarGrid.appendChild(row);
  });
}

async function selectWeek(weekKey) {
  if (!currentPlayer) {
    showToast('Please select your character first.');
    return;
  }
  const res = await fetch(`/api/campaigns/${campaignId}/select-week`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekStart: weekKey })
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error || 'Could not select that week.'); return; }

  campaign.selectedWeek = weekKey;
  if (!campaign.weeks[weekKey]) campaign.weeks[weekKey] = { responses: {} };
  renderCalendar();
  els.weekSection.style.display = 'block';
  spotlightKey = null;
  selectedSlots = new Map();
  els.noteInput.value = '';
  renderWeek();
  els.weekSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

els.prevMonth.addEventListener('click', () => {
  viewMonth -= 1;
  if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
  renderCalendar();
});
els.nextMonth.addEventListener('click', () => {
  viewMonth += 1;
  if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
  renderCalendar();
});
els.todayBtn.addEventListener('click', () => {
  const today = new Date();
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
  renderCalendar();
});

function populatePlayerSelectMain() {
  if (!campaign || !campaign.roster || !campaign.roster.length) {
    return;
  }
  
  const current = els.playerSelectMain.value;
  els.playerSelectMain.innerHTML = '<option value="">— Choose your name —</option>';
  
  campaign.roster.slice().sort((a, b) => a.localeCompare(b)).forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    els.playerSelectMain.appendChild(opt);
  });
  
  if (campaign.roster.includes(current)) {
    els.playerSelectMain.value = current;
    onPlayerSelected(current);
  }
}

els.playerSelectMain.addEventListener('change', () => {
  const name = els.playerSelectMain.value;
  onPlayerSelected(name);
});

function onPlayerSelected(name) {
  if (!name) {
    currentPlayer = null;
    els.calendarCard.style.display = 'none';
    els.weekSection.style.display = 'none';
    return;
  }
  currentPlayer = name;
  els.calendarCard.style.display = 'block';
  if (campaign.selectedWeek) {
    els.weekSection.style.display = 'block';
    renderWeek();
  }
  loadPlayerAvailability(name);
}

function loadPlayerAvailability(name) {
  const weekKey = campaign.selectedWeek;
  if (!weekKey) return;
  const responses = weekResponses();
  const key = name.toLowerCase();
  const existing = responses[key];
  if (existing) {
    selectedSlots = new Map();
    if (existing.states) {
      for (const [slotKey, state] of Object.entries(existing.states)) {
        selectedSlots.set(slotKey, state);
      }
    } else {
      existing.slots.forEach(s => {
        selectedSlots.set(s, 'available');
      });
    }
    els.noteInput.value = existing.note || '';
  } else {
    selectedSlots = new Map();
    els.noteInput.value = '';
  }
  renderMineView();
}

function renderWeek() {
  const weekKey = campaign.selectedWeek;
  const days = weekDaysFromKey(weekKey);
  const last = days[6];
  els.weekTitle.textContent =
    `Week of ${MONTHS_SHORT[days[0].getMonth()]} ${days[0].getDate()} – ${MONTHS_SHORT[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;

  buildGrid(days);
  applyMode();
}

function buildGrid(days) {
  const times = slotList();
  const table = els.gridTable;
  table.innerHTML = '';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th'));
  days.forEach(d => {
    const th = document.createElement('th');
    th.innerHTML = `${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d.getDay() === 0 ? 6 : d.getDay() - 1]}<br>${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const btnRow = document.createElement('tr');
  btnRow.className = 'day-btn-row';
  const emptyTh = document.createElement('th');
  emptyTh.className = 'day-btn-label';
  btnRow.appendChild(emptyTh);
  days.forEach(d => {
    const th = document.createElement('th');
    th.className = 'day-btn-cell';
    const dayKey = toKey(d);
    const btnGreen = document.createElement('button');
    btnGreen.type = 'button';
    btnGreen.className = 'day-btn day-btn-green';
    btnGreen.title = 'Mark whole day available';
    btnGreen.textContent = '✓';
    btnGreen.addEventListener('click', () => {
      if (mode !== 'mine') return;
      if (!currentPlayer) { showToast('Choose your name first'); return; }
      const cells = els.gridTable.querySelectorAll(`.cell[data-key^="${dayKey}|"]`);
      cells.forEach(cell => paintCell(cell, 'available'));
      autoSave();
    });
    const btnClear = document.createElement('button');
    btnClear.type = 'button';
    btnClear.className = 'day-btn day-btn-clear';
    btnClear.title = 'Clear whole day';
    btnClear.textContent = '✕';
    btnClear.addEventListener('click', () => {
      if (mode !== 'mine') return;
      if (!currentPlayer) { showToast('Choose your name first'); return; }
      const cells = els.gridTable.querySelectorAll(`.cell[data-key^="${dayKey}|"]`);
      cells.forEach(cell => paintCell(cell, null));
      autoSave();
    });
    th.appendChild(btnGreen);
    th.appendChild(btnClear);
    btnRow.appendChild(th);
  });
  thead.appendChild(btnRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  times.forEach(t => {
    const tr = document.createElement('tr');
    const labelTd = document.createElement('td');
    labelTd.className = 'time-label';
    labelTd.textContent = formatTime(t);
    tr.appendChild(labelTd);

    days.forEach(d => {
      const td = document.createElement('td');
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.key = `${toKey(d)}|${t}`;
      cell.addEventListener('pointerdown', onCellPointerDown);
      cell.addEventListener('pointerenter', onCellHover);
      cell.addEventListener('pointerleave', hideTooltip);
      td.appendChild(cell);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

function getNextState(current) {
  if (!current) return 'available';
  if (current === 'available') return 'yellow';
  if (current === 'yellow') return 'red';
  return null;
}

function onCellPointerDown(e) {
  if (mode !== 'mine') return;
  if (!currentPlayer) { showToast('Choose your name first'); return; }
  e.preventDefault();
  isPainting = true;
  const cell = e.currentTarget;
  const currentState = cell.dataset.state || null;
  paintValue = getNextState(currentState);
  paintCell(cell, paintValue);
  lastPaintedCell = cell;
  autoSave();
}

document.addEventListener('pointermove', (e) => {
  if (!isPainting) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (el && el.classList && el.classList.contains('cell') && el !== lastPaintedCell) {
    paintCell(el, paintValue);
    lastPaintedCell = el;
    autoSave();
  }
});
document.addEventListener('pointerup', () => { isPainting = false; lastPaintedCell = null; });

function paintCell(cell, state) {
  const key = cell.dataset.key;
  cell.classList.remove('selected-available', 'selected-yellow', 'selected-red');
  cell.dataset.state = '';
  
  if (state === 'available') {
    cell.classList.add('selected-available');
    cell.dataset.state = 'available';
    selectedSlots.set(key, 'available');
  } else if (state === 'yellow') {
    cell.classList.add('selected-yellow');
    cell.dataset.state = 'yellow';
    selectedSlots.set(key, 'yellow');
  } else if (state === 'red') {
    cell.classList.add('selected-red');
    cell.dataset.state = 'red';
    selectedSlots.set(key, 'red');
  } else {
    selectedSlots.delete(key);
  }
}

function onCellHover(e) {
  if (mode !== 'group') return;
  const key = e.currentTarget.dataset.key;
  const responses = Object.values(weekResponses());
  if (!responses.length) { hideTooltip(); return; }

  if (spotlightKey) {
    const p = weekResponses()[spotlightKey];
    if (!p || !p.slots.includes(key)) { hideTooltip(); return; }
    const st = (p.states && p.states[key]) || 'available';
    const label = st === 'available' ? '✓ Available' : st === 'yellow' ? '~ Possible' : '✗ Unavailable';
    els.tooltip.textContent = `${p.name}: ${label}`;
  } else {
    const states = slotStatesByPlayer(key);
    if (!states.some(s => s.state !== 'unset')) { hideTooltip(); return; }
    const stateIcon = { available: '✓', yellow: '~', red: '✗', unset: '?' };
    els.tooltip.textContent = states.map(s => `${stateIcon[s.state]} ${s.name}`).join(', ');
  }

  els.tooltip.style.display = 'block';
  const rect = e.currentTarget.getBoundingClientRect();
  els.tooltip.style.left = `${rect.left}px`;
  els.tooltip.style.top = `${rect.bottom + 8}px`;
}
function hideTooltip() { els.tooltip.style.display = 'none'; }

function weekResponses() {
  const w = campaign.weeks[campaign.selectedWeek];
  return w ? w.responses : {};
}

function participantsAt(key) {
  return Object.values(weekResponses()).filter(p => p.slots.includes(key)).map(p => p.name);
}

function slotStatesByPlayer(key) {
  const responses = weekResponses();
  return Object.values(responses).map(p => {
    if (!p.slots.includes(key)) return { name: p.name, state: 'unset' };
    const st = (p.states && p.states[key]) || 'available';
    return { name: p.name, state: st };
  });
}

function overlapClass(key) {
  const responses = Object.values(weekResponses());
  if (!responses.length) return null;
  const states = slotStatesByPlayer(key);
  const anyRed = states.some(s => s.state === 'red');
  const anyUnset = states.some(s => s.state === 'unset');
  const anyYellow = states.some(s => s.state === 'yellow');
  if (anyRed) return 'has-red';
  if (anyUnset) {
    if (anyYellow) return 'has-yellow';
    return 'partial';
  }
  if (anyYellow) return 'has-yellow';
  return 'all-green';
}

function renderGroupView() {
  const btnRow = els.gridTable.querySelector('.day-btn-row');
  if (btnRow) btnRow.style.display = 'none';
  const responses = Object.values(weekResponses());
  const total = responses.length;
  const cells = els.gridTable.querySelectorAll('.cell');

  cells.forEach(cell => {
    cell.classList.add('readonly');
    cell.classList.remove(
      'selected-available', 'selected-yellow', 'selected-red',
      'heat-0', 'heat-low', 'heat-mid', 'heat-high',
      'overlap-green', 'overlap-yellow', 'overlap-red', 'overlap-partial'
    );
    cell.dataset.state = '';
    cell.innerHTML = '';
    const key = cell.dataset.key;

    if (spotlightKey) {
      const p = weekResponses()[spotlightKey];
      if (p && p.slots.includes(key)) {
        const st = (p.states && p.states[key]) || 'available';
        if (st === 'available') cell.classList.add('selected-available');
        else if (st === 'yellow') cell.classList.add('selected-yellow');
        else if (st === 'red') cell.classList.add('selected-red');
        cell.dataset.state = st;
      }
      return;
    }

    if (total === 0) { cell.classList.add('heat-0'); return; }

    const oc = overlapClass(key);
    if (!oc) { cell.classList.add('heat-0'); return; }

    if (oc === 'all-green') {
      cell.classList.add('overlap-green');
    } else if (oc === 'has-yellow') {
      cell.classList.add('overlap-yellow');
    } else if (oc === 'has-red') {
      cell.classList.add('overlap-red');
    } else if (oc === 'partial') {
      const names = participantsAt(key);
      const count = names.length;
      const ratio = count / total;
      if (ratio <= 0.33) cell.classList.add('heat-low');
      else if (ratio <= 0.66) cell.classList.add('heat-mid');
      else cell.classList.add('heat-high');
      const pipsWrap = document.createElement('div');
      pipsWrap.className = 'pips';
      if (count <= 6) {
        for (let i = 0; i < count; i++) {
          const pip = document.createElement('div');
          pip.className = 'pip';
          pipsWrap.appendChild(pip);
        }
      } else {
        const span = document.createElement('span');
        span.className = 'pip-count';
        span.textContent = count;
        pipsWrap.appendChild(span);
      }
      cell.appendChild(pipsWrap);
      return;
    }
  });

  renderNotes();
}

function renderNotes() {
  const responses = Object.values(weekResponses()).filter(p => p.note);
  if (!responses.length) { els.notesPanel.style.display = 'none'; return; }
  els.notesPanel.style.display = 'block';
  els.notesPanel.innerHTML = '<h3>Notes</h3>' + responses.map(p =>
    `<div class="note-item"><strong>${escapeHtml(p.name)}</strong>: ${escapeHtml(p.note)}</div>`
  ).join('');
}

function renderMineView() {
  const btnRow = els.gridTable.querySelector('.day-btn-row');
  if (btnRow) btnRow.style.display = '';
  els.notesPanel.style.display = 'none';
  const cells = els.gridTable.querySelectorAll('.cell');
  cells.forEach(cell => {
    cell.classList.remove('readonly', 'heat-0', 'heat-low', 'heat-mid', 'heat-high');
    cell.classList.remove('selected-available', 'selected-yellow', 'selected-red');
    cell.classList.remove('overlap-green', 'overlap-yellow', 'overlap-red');
    cell.dataset.state = '';
    cell.innerHTML = '';
    const key = cell.dataset.key;
    const state = selectedSlots.get(key);
    if (state === 'available') {
      cell.classList.add('selected-available');
      cell.dataset.state = 'available';
    } else if (state === 'yellow') {
      cell.classList.add('selected-yellow');
      cell.dataset.state = 'yellow';
    } else if (state === 'red') {
      cell.classList.add('selected-red');
      cell.dataset.state = 'red';
    }
  });
}

function renderRosterStatus() {
  els.rosterStatus.innerHTML = '';
  if (!campaign.roster.length) {
    const span = document.createElement('span');
    span.className = 'hint';
    span.textContent = 'No players on the roster yet — add some under "Manage campaign".';
    els.rosterStatus.appendChild(span);
    return;
  }
  const responses = weekResponses();
  campaign.roster.slice().sort((a, b) => a.localeCompare(b)).forEach(name => {
    const key = name.toLowerCase();
    const response = responses[key];
    const chip = document.createElement('div');
    chip.className = 'participant-chip';
    if (response) chip.classList.add('responded');
    if (spotlightKey === key) chip.classList.add('highlighted');
    chip.textContent = response ? `${name} (${response.slots.length})` : `${name} — no response yet`;
    chip.addEventListener('click', () => {
      if (!response) return;
      mode = 'group';
      spotlightKey = spotlightKey === key ? null : key;
      applyMode();
    });
    els.rosterStatus.appendChild(chip);
  });
}

function applyMode() {
  els.tabMine.classList.toggle('active', mode === 'mine');
  els.tabGroup.classList.toggle('active', mode === 'group');
  els.minePanel.style.display = mode === 'mine' ? 'block' : 'none';
  els.groupPanel.style.display = mode === 'group' ? 'block' : 'none';
  hideTooltip();
  if (mode === 'mine') renderMineView();
  else renderGroupView();
  renderRosterStatus();
}

els.tabMine.addEventListener('click', () => { mode = 'mine'; applyMode(); });
els.tabGroup.addEventListener('click', () => { mode = 'group'; spotlightKey = null; applyMode(); });

function autoSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (currentPlayer) saveAvailability();
  }, 300);
}

async function saveAvailability() {
  const name = currentPlayer;
  if (!name) return;

  const slots = Array.from(selectedSlots.keys());
  const states = Object.fromEntries(selectedSlots);
  
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/weeks/${campaign.selectedWeek}/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name, 
        slots, 
        note: els.noteInput.value,
        states: states
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save.');
    campaign.weeks[campaign.selectedWeek].responses[name.toLowerCase()] = data.response;
    renderRosterStatus();
    renderCalendar();
  } catch (err) {
    showToast('Auto-save failed: ' + err.message);
  }
}

els.noteInput.addEventListener('input', () => {
  if (currentPlayer) autoSave();
});

function populateSettingsFields() {
  els.setName.value = campaign.name;
  els.setDesc.value = campaign.description || '';
  els.setStart.value = campaign.timeStart;
  els.setEnd.value = campaign.timeEnd;
  els.setSlot.value = String(campaign.slotMinutes);
  settingsRoster = campaign.roster.slice();
  renderSettingsRosterChips();
}

function renderSettingsRosterChips() {
  els.setRosterChips.innerHTML = '';
  settingsRoster.forEach((name, i) => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `<span></span><button type="button" aria-label="Remove">&times;</button>`;
    chip.querySelector('span').textContent = name;
    chip.querySelector('button').addEventListener('click', () => {
      settingsRoster.splice(i, 1);
      renderSettingsRosterChips();
    });
    els.setRosterChips.appendChild(chip);
  });
}

function addSettingsRosterName(raw) {
  const name = raw.trim();
  if (!name) return;
  if (settingsRoster.some(n => n.toLowerCase() === name.toLowerCase())) return;
  settingsRoster.push(name);
  renderSettingsRosterChips();
}

els.setRosterText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addSettingsRosterName(els.setRosterText.value);
    els.setRosterText.value = '';
  } else if (e.key === 'Backspace' && !els.setRosterText.value && settingsRoster.length) {
    settingsRoster.pop();
    renderSettingsRosterChips();
  }
});
els.setRosterText.addEventListener('blur', () => {
  if (els.setRosterText.value.trim()) {
    addSettingsRosterName(els.setRosterText.value);
    els.setRosterText.value = '';
  }
});

els.settingsBtn.addEventListener('click', () => {
  const showing = els.settingsPanel.style.display !== 'none';
  els.settingsPanel.style.display = showing ? 'none' : 'block';
});

els.saveSettingsBtn.addEventListener('click', async () => {
  els.settingsError.textContent = '';
  const payload = {
    name: els.setName.value,
    description: els.setDesc.value,
    timeStart: els.setStart.value,
    timeEnd: els.setEnd.value,
    slotMinutes: els.setSlot.value,
    roster: settingsRoster
  };
  els.saveSettingsBtn.disabled = true;
  els.saveSettingsBtn.textContent = 'Saving…';
  try {
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save changes.');
    campaign = data;
    els.name.textContent = campaign.name;
    els.desc.textContent = campaign.description || '';
    els.desc.style.display = campaign.description ? 'block' : 'none';
    showToast('Campaign updated');
    populatePlayerSelectMain();
    if (campaign.selectedWeek) renderWeek();
  } catch (err) {
    els.settingsError.textContent = err.message;
  } finally {
    els.saveSettingsBtn.disabled = false;
    els.saveSettingsBtn.textContent = 'Save changes';
  }
});

els.deleteCampaignBtn.addEventListener('click', async () => {
  if (!confirm(`Delete "${campaign.name}"? This removes all of its scheduling history and can't be undone.`)) return;
  const res = await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
  if (res.ok) window.location.href = '/';
  else showToast('Could not delete campaign');
});

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    if (theme === 'light') {
      toggle.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    } else {
      toggle.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    }
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'light' ? 'dark' : 'light');
}

const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

loadCampaign();