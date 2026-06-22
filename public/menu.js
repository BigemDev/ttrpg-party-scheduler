const els = {
  newBtn: document.getElementById('new-campaign-btn'),
  createCard: document.getElementById('create-card'),
  form: document.getElementById('create-form'),
  error: document.getElementById('create-error'),
  grid: document.getElementById('campaign-grid'),
  emptyHint: document.getElementById('empty-hint'),
  logoutBtn: document.getElementById('logout-btn'),
  rosterChips: document.getElementById('roster-chips'),
  rosterText: document.getElementById('roster-text'),
  toast: document.getElementById('toast')
};

let roster = [];
let toastTimer = null;

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function renderRosterChips() {
  els.rosterChips.innerHTML = '';
  roster.forEach((name, i) => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `<span></span><button type="button" aria-label="Remove">&times;</button>`;
    chip.querySelector('span').textContent = name;
    chip.querySelector('button').addEventListener('click', () => {
      roster.splice(i, 1);
      renderRosterChips();
    });
    els.rosterChips.appendChild(chip);
  });
}

function addRosterName(raw) {
  const name = raw.trim();
  if (!name) return;
  if (roster.some(n => n.toLowerCase() === name.toLowerCase())) return;
  roster.push(name);
  renderRosterChips();
}

els.rosterText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addRosterName(els.rosterText.value);
    els.rosterText.value = '';
  } else if (e.key === 'Backspace' && !els.rosterText.value && roster.length) {
    roster.pop();
    renderRosterChips();
  }
});
els.rosterText.addEventListener('blur', () => {
  if (els.rosterText.value.trim()) {
    addRosterName(els.rosterText.value);
    els.rosterText.value = '';
  }
});

els.newBtn.addEventListener('click', () => {
  const showing = els.createCard.style.display !== 'none';
  els.createCard.style.display = showing ? 'none' : 'block';
  if (!showing) document.getElementById('name').focus();
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.error.textContent = '';

  const payload = {
    name: document.getElementById('name').value,
    description: document.getElementById('description').value,
    timeStart: document.getElementById('time-start').value,
    timeEnd: document.getElementById('time-end').value,
    slotMinutes: document.getElementById('slot-minutes').value,
    roster
  };

  const btn = els.form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    window.location.href = `/campaign/${data.id}`;
  } catch (err) {
    els.error.textContent = err.message;
    btn.disabled = false;
    btn.textContent = 'Create campaign';
  }
});

async function loadCampaigns() {
  const res = await fetch('/api/campaigns');
  if (res.status === 401) { window.location.href = '/login'; return; }
  const campaigns = await res.json();

  els.grid.innerHTML = '';
  els.emptyHint.style.display = campaigns.length ? 'none' : 'block';

  campaigns.forEach(c => {
    const card = document.createElement('a');
    card.className = 'campaign-card';
    card.href = `/campaign/${c.id}`;
    card.innerHTML = `
      <h2>${escapeHtml(c.name)}</h2>
      <p class="campaign-card-desc">${escapeHtml(c.description || 'No description yet.')}</p>
      <div class="campaign-card-footer">
        <span>${c.rosterCount} player${c.rosterCount === 1 ? '' : 's'}</span>
        <button type="button" class="btn-ghost campaign-delete" data-id="${c.id}">Delete</button>
      </div>
    `;
    card.querySelector('.campaign-delete').addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!confirm(`Delete "${c.name}"? This removes all of its scheduling history.`)) return;
      const delRes = await fetch(`/api/campaigns/${c.id}`, { method: 'DELETE' });
      if (delRes.ok) { showToast('Campaign deleted'); loadCampaigns(); }
      else showToast('Could not delete campaign');
    });
    els.grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

els.logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
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

renderRosterChips();
loadCampaigns();