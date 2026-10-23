// App entry: screen routing, home form, wire up Net + UI + Render.
(async function () {
  // Theme toggle: light ⇄ dark
  const applyTheme = (t) => document.documentElement.setAttribute('data-theme', t);
  const stored = localStorage.getItem('catan.theme');
  if (stored) applyTheme(stored);
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('catan.theme', next);
  }
  document.getElementById('themeToggle').onclick = toggleTheme;
  document.getElementById('themeToggle2').onclick = toggleTheme;

  // Populate maps + modes
  const [maps, modes] = await Promise.all([
    fetch('/api/maps').then(r => r.json()),
    fetch('/api/modes').then(r => r.json()),
  ]);
  const mapSel = document.getElementById('mapSelect');
  for (const m of maps) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = `${m.label} — ${m.hint}`;
    mapSel.appendChild(o);
  }
  // Mode selector (segmented buttons)
  let chosenMode = 'base';
  const modeRow = document.getElementById('modeRow');
  for (const m of modes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mode-opt' + (m.id === chosenMode ? ' on' : '');
    btn.dataset.mode = m.id;
    btn.innerHTML = `<div class="m-title">${m.label}</div><div class="m-sub">${m.hint}</div>`;
    btn.onclick = () => {
      chosenMode = m.id;
      document.querySelectorAll('.mode-opt').forEach(b => b.classList.toggle('on', b.dataset.mode === chosenMode));
    };
    modeRow.appendChild(btn);
  }

  // Prefill from URL
  const q = new URLSearchParams(location.search);
  if (q.get('r')) document.getElementById('joinCode').value = q.get('r').toUpperCase();

  await Net.connect();

  Net.on('error', (m) => {
    if (m === 'disconnected') {
      alert('Lost connection. Reload to rejoin.');
    } else {
      alert(m);
    }
  });

  Net.on('joined', () => {
    document.getElementById('screen-home').classList.add('hidden');
    document.getElementById('screen-game').classList.remove('hidden');
    document.getElementById('roomCode').textContent = Net.code;
    // layout is now final; make sure the canvas has real dimensions before drawing
    requestAnimationFrame(() => Render.inst && Render.inst.resize());
  });

  // Hoist renderer onto window.Render.inst
  const canvas = document.getElementById('board');
  Render.inst = new Render.Renderer(canvas);

  // Zoom controls
  document.getElementById('zoomIn') .onclick = () => Render.inst.zoom(1.2);
  document.getElementById('zoomOut').onclick = () => Render.inst.zoom(1 / 1.2);
  document.getElementById('zoomFit').onclick = () => Render.inst.recenter();

  Net.on('state', (state) => {
    Render.inst.setState(state);
    UI.render(state);
  });

  Net.on('chat', (msg) => {
    const log = document.getElementById('chatLog');
    const d = document.createElement('div');
    d.className = 'msg';
    d.innerHTML = `<b style="color:${msg.color}">${escape(msg.from)}:</b> ${escape(msg.text)}`;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  });

  document.getElementById('hostBtn').onclick = () => {
    const name = document.getElementById('hostName').value.trim() || 'Host';
    const code = document.getElementById('hostCode').value.trim();
    const mapVariant = mapSel.value;
    Net.send('create', { name, code, mapVariant, mode: chosenMode });
  };

  // --- Tabs on home: switch which card is highlighted / focused ---
  function pickTab(tab) {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.navitem[data-pick-tab]').forEach(b => b.classList.toggle('active', b.dataset.pickTab === tab));
    document.querySelectorAll('.panel[data-card]').forEach(c => {
      c.style.boxShadow = c.dataset.card === tab
        ? '0 0 0 3px var(--yellow), var(--shadow-1)'
        : 'var(--shadow-1)';
    });
    if (tab === 'host') document.getElementById('hostName').focus();
    if (tab === 'join') document.getElementById('joinName').focus();
  }
  document.querySelectorAll('[data-tab], [data-pick-tab]').forEach(b => {
    b.onclick = () => pickTab(b.dataset.tab || b.dataset.pickTab);
  });

  // --- Rules modal ---
  function openRules() {
    const html = `
      <h3>How to play</h3>
      <div style="font-size:13px;line-height:1.55;color:var(--fg);font-weight:600;max-height:60vh;overflow-y:auto">
        <p><strong style="color:var(--yellow)">Goal</strong> — be first to <strong>10 VP</strong>.
        Settlements = 1 VP, cities = 2 VP, Longest Road = 2 VP, Largest Army = 2 VP, each VP dev card = 1 VP.</p>

        <p><strong style="color:var(--yellow)">Setup</strong> — each player places two settlements and two roads
        (reverse order on the second round). You collect one resource for each hex touching your second settlement.</p>

        <p><strong style="color:var(--yellow)">Each turn</strong></p>
        <ol style="margin:4px 0 10px 20px;padding:0">
          <li>Roll two dice. Each hex with that number pays all touching settlements (1 card) and cities (2).</li>
          <li>On a <strong>7</strong>: everyone with &gt;7 cards discards half, then the roller moves the robber to a new hex and steals from one player with a settlement there.</li>
          <li>Trade with players or 4:1 (3:1 / 2:1 at harbors) with the bank.</li>
          <li>Build or buy dev cards. End turn.</li>
        </ol>

        <p><strong style="color:var(--yellow)">Build costs</strong> — Road: wood+brick · Settlement: wood+brick+sheep+wheat · City: 2 wheat + 3 ore · Dev card: sheep+wheat+ore.</p>

        <p><strong style="color:var(--yellow)">Cities &amp; Knights</strong> — cities on wood/sheep/ore hexes also produce commodities (paper/cloth/coin). Spend commodities to improve one of three tracks (Trade/Politics/Science). Hire knights (sheep+ore), activate with wheat, promote with sheep+ore. Barbarians advance when a special event die rolls their symbol — if their strength beats the knights, the weakest city falls back to a settlement. Reaching level 4 on a track gives you a Metropolis (2 VP).</p>

        <p><strong style="color:var(--yellow)">Board shortcuts</strong></p>
        <ul style="margin:4px 0 10px 20px;padding:0">
          <li>Mouse wheel or +/− buttons = zoom. Drag the board to pan. ⤢ fits the whole map.</li>
          <li>Hover any hex for a tooltip (resource, number, roll probability).</li>
          <li>Esc or right-click cancels an active placement.</li>
        </ul>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="chip on" id="rClose">Got it</button>
      </div>
    `;
    const m = document.getElementById('modal');
    document.getElementById('modalBody').innerHTML = html;
    m.classList.remove('hidden');
    document.getElementById('rClose').onclick = closeModal;
  }
  document.getElementById('rulesNav').onclick = openRules;
  document.getElementById('rulesBtn').onclick  = openRules;
  document.getElementById('rulesBtn2').onclick = openRules;

  // --- Global keyboard: Esc cancels pickers / closes modal ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('modal').classList.contains('hidden')) {
        closeModal();
      } else if (Render.inst && Render.inst.pick) {
        Render.inst.cancelPick();
        banner('');
      }
    }
  });
  // Right-click on board cancels active pick
  document.getElementById('board').addEventListener('contextmenu', (e) => {
    if (Render.inst && Render.inst.pick) {
      e.preventDefault();
      Render.inst.cancelPick();
      banner('');
    }
  });
  document.getElementById('joinBtn').onclick = () => {
    const name = document.getElementById('joinName').value.trim() || 'Player';
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    if (!code) return alert('enter a room code');
    Net.send('join', { name, code });
  };

  document.getElementById('copyLink').onclick = () => {
    const url = `${location.origin}?r=${Net.code}`;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('copyLink');
      const old = btn.textContent; btn.textContent = '✓';
      setTimeout(() => (btn.textContent = old), 1000);
    });
  };

  document.getElementById('historyBtn').onclick = () => UI.openHistoryModal();

  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      Net.send('chat', { text: e.target.value.trim() });
      e.target.value = '';
    }
  });

  // Close modal on backdrop click
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  function escape(s) {
    return (s || '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
})();
