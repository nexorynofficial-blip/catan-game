// Sidebar, hand, action buttons, modal prompts. Exposes window.UI.
(function () {
  const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const COMM = ['paper', 'cloth', 'coin'];

  const UI = {
    state: null, me: null,

    render(state) {
      this.state = state;
      this.me = state.players.find(p => p.id === Net.playerId);
      // Cancel stale pickers when it's no longer our turn or phase changed
      if (Render.inst && Render.inst.pick) {
        const myTurn = state.currentPlayerId === Net.playerId;
        const okPhase = ['main', 'move_robber', 'setup_1', 'setup_2'].includes(state.phase);
        if (!myTurn || !okPhase) {
          Render.inst.cancelPick();
          banner('');
        }
      }
      this.renderPlayers();
      this.renderTurnInfo();
      this.renderDice();
      this.renderActions();
      this.renderLog();
      this.renderHand();
      this.renderOpenTrade();
      // If a knight dev card put us into robber phase, open robber picker automatically
      if (state.phase === 'move_robber'
          && state.currentPlayerId === Net.playerId
          && !Render.inst.pick) {
        setTimeout(() => this.pickRobberHex(), 50);
      }
    },

    renderPlayers() {
      const el = document.getElementById('players');
      el.innerHTML = '';
      const s = this.state;
      s.players.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'player-row' + (s.currentPlayerId === p.id ? ' current' : '');
        row.style.setProperty('--player-color', p.color);
        const vpPct = Math.min(100, (p.vp / 10) * 100);
        const initial = (p.name || '?')[0].toUpperCase();
        row.innerHTML = `
          <div class="player-dot" style="background:${p.color}">
            ${initial}
            ${s.currentPlayerId === p.id ? '<span class="pulse"></span>' : ''}
          </div>
          <div style="flex:1; min-width:0">
            <div class="player-name">${esc(p.name)}${p.id === Net.playerId ? ' <span style="color:var(--fg-mute); font-weight:600">(you)</span>' : ''}</div>
            <div class="vp-bar" title="${p.vp} / 10 VP"><span style="width:${vpPct}%"></span></div>
            <div class="player-mini">
              <span title="Cards">🃏 ${p.handCount}</span>
              <span title="Dev cards">${Icons.dev} ${p.devCardCount}</span>
              <span title="Knights">${Icons.knight} ${p.playedKnights}</span>
              ${s.cnk && p.ck ? `<span title="T/P/S">⚙ ${p.ck.tracks.trade}/${p.ck.tracks.politics}/${p.ck.tracks.science}</span>` : ''}
            </div>
          </div>
          <span class="player-vp">${p.vp}</span>
        `;
        el.appendChild(row);
      });
    },

    renderTurnInfo() {
      const el = document.getElementById('turnInfo');
      const s = this.state;
      const cur = s.players[s.turn];
      const phase = s.phase.replace('_', ' ');
      el.innerHTML = `
        <div><strong>${esc(cur ? cur.name : '—')}</strong><br>
          <span style="color:var(--fg-dim); font-size:11px">to act</span>
        </div>
        <span class="phase-pill">${phase}</span>
      `;
    },

    renderDice() {
      const el = document.getElementById('dice');
      const d = this.state.dice;
      if (!d || !d.red) {
        el.innerHTML = '<span style="color:var(--fg-mute); font-size:12px">no roll yet</span>';
        return;
      }
      // If the roll just changed, animate
      const key = `${d.red}-${d.yellow}-${d.event}-${this.state.lastRoll}`;
      if (this._lastDiceKey !== key) {
        this._lastDiceKey = key;
        this.animateDice(d);
      } else {
        el.innerHTML = `
          <div class="die red">${pips(d.red)}</div>
          <div class="die yellow">${pips(d.yellow)}</div>
          ${d.event ? `<div class="die event ${d.event}">${d.event}</div>` : ''}
        `;
      }
    },

    animateDice(final) {
      const el = document.getElementById('dice');
      let ticks = 0;
      const frame = () => {
        ticks++;
        const r = 1 + Math.floor(Math.random() * 6);
        const y = 1 + Math.floor(Math.random() * 6);
        el.innerHTML = `
          <div class="die red rolling">${pips(r)}</div>
          <div class="die yellow rolling">${pips(y)}</div>
          ${final.event ? `<div class="die event rolling">?</div>` : ''}
        `;
        if (ticks < 10) {
          setTimeout(frame, 50 + ticks * 10);
        } else {
          el.innerHTML = `
            <div class="die red">${pips(final.red)}</div>
            <div class="die yellow">${pips(final.yellow)}</div>
            ${final.event ? `<div class="die event ${final.event}">${final.event}</div>` : ''}
          `;
          // flash resource gains
          this.showResourceGains();
        }
      };
      frame();
    },

    showResourceGains() {
      // Diff last snapshot vs current — show +N floats near hand
      if (!this.me || !this.me.hand) return;
      const prev = this._prevHand;
      this._prevHand = JSON.parse(JSON.stringify(this.me.hand));
      if (!prev) return;
      const container = document.getElementById('floats');
      for (const r of ['wood','brick','sheep','wheat','ore']) {
        const delta = this.me.hand.r[r] - prev.r[r];
        if (delta > 0) {
          const f = document.createElement('div');
          f.className = `float-chip ${r}`;
          f.innerHTML = `+${delta} ${Icons[r]}`;
          f.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
          container.appendChild(f);
          setTimeout(() => f.remove(), 1800);
        }
      }
    },

    renderActions() {
      const el = document.getElementById('actionButtons');
      const s = this.state;
      const myTurn = s.currentPlayerId === Net.playerId;
      el.innerHTML = '';

      if (s.phase === 'lobby') {
        if (Net.host) {
          const btn = btnEl('Start game', () => Net.send('start_game'));
          btn.className = 'primary';
          btn.disabled = s.players.length < 3;
          el.appendChild(btn);
          if (s.players.length < 3) {
            const hint = document.createElement('div');
            hint.style.cssText = 'grid-column: span 2; color:var(--fg-dim); font-size:12px; text-align:center';
            hint.textContent = `Need ${3 - s.players.length} more player${s.players.length === 2 ? '' : 's'}`;
            el.appendChild(hint);
          }
        } else {
          el.innerHTML = '<div style="grid-column: span 2; color:var(--fg-dim); font-size:12px; text-align:center">Waiting for host…</div>';
        }
        return;
      }

      if (s.phase === 'end') {
        el.innerHTML = `<div style="grid-column: span 2; text-align:center; color: var(--accent-2); font-size: 16px;">
          🏆 ${esc(s.players.find(p=>p.id===s.winner).name)} wins!
        </div>`;
        return;
      }

      if (s.phase === 'setup_1' || s.phase === 'setup_2') {
        if (!myTurn) {
          el.innerHTML = `<div style="grid-column: span 2; color:var(--fg-dim); font-size:12px; text-align:center">${esc(s.players[s.turn].name)} is placing</div>`;
          return;
        }
        const needSettle = this.me.settlements.length < (s.phase === 'setup_1' ? 1 : 2);
        const needRoad   = this.me.roads.length < (s.phase === 'setup_1' ? 1 : 2);
        if (needSettle) {
          el.appendChild(btnEl('Place settlement', () => this.pickSettlementSetup(), true));
        } else if (needRoad) {
          el.appendChild(btnEl('Place road', () => this.pickRoadSetup(), true));
        } else {
          el.appendChild(btnEl('Confirm placement', () => Net.send('end_setup'), true));
        }
        return;
      }

      if (s.phase === 'discard') {
        const mustIDiscard = s.pendingDiscards.includes(Net.playerId);
        if (mustIDiscard) el.appendChild(btnEl('Discard half', () => this.openDiscardModal(), true));
        else el.innerHTML = `<div style="grid-column: span 2; color:var(--fg-dim); font-size:12px; text-align:center">Waiting for discards…</div>`;
        return;
      }

      if (s.phase === 'move_robber') {
        if (myTurn) el.appendChild(btnEl('Move robber', () => this.pickRobberHex(), true));
        else el.innerHTML = `<div style="grid-column: span 2; color:var(--fg-dim); font-size:12px; text-align:center">${esc(s.players[s.turn].name)} is moving the robber</div>`;
        return;
      }

      if (s.phase === 'steal') {
        if (myTurn) el.appendChild(btnEl('Choose victim', () => this.openStealModal(), true));
        else el.innerHTML = `<div style="grid-column: span 2; color:var(--fg-dim); font-size:12px; text-align:center">${esc(s.players[s.turn].name)} is choosing a victim</div>`;
        return;
      }

      if (!myTurn) {
        el.innerHTML = `<div style="grid-column: span 2; color:var(--fg-dim); font-size:12px; text-align:center">Waiting for ${esc(s.players[s.turn].name)}…</div>`;
        return;
      }

      if (s.phase === 'roll') {
        const b = btnEl('🎲 Roll dice', () => Net.send('roll'));
        b.className = 'primary'; el.appendChild(b);
        return;
      }

      // phase === 'main' — buttons with cost chips
      const costs = {
        road:   { wood: 1, brick: 1 },
        settle: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
        city:   { wheat: 2, ore: 3 },
        dev:    { sheep: 1, wheat: 1, ore: 1 },
      };
      const canPay = (c) => Object.entries(c).every(([k, v]) => (this.me.hand.r[k] || 0) >= v);
      el.appendChild(actionBtn('Road',       Icons.road,   costs.road,   () => this.pickRoadBuild(), canPay(costs.road)));
      el.appendChild(actionBtn('Settlement', Icons.settle, costs.settle, () => this.pickSettlementBuild(), canPay(costs.settle)));
      el.appendChild(actionBtn('City',       Icons.city,   costs.city,   () => this.pickCityBuild(), canPay(costs.city)));
      el.appendChild(actionBtn('Dev card',   Icons.dev,    costs.dev,    () => Net.send('buy_dev'), canPay(costs.dev)));
      el.appendChild(btnEl('🏦 Bank',          () => this.openBankTradeModal()));
      el.appendChild(btnEl('🤝 Trade',          () => this.openPlayerTradeModal()));
      el.appendChild(btnEl('🎴 Play dev',      () => this.openPlayDevModal(),
                           this.me.devCards && this.me.devCards.length > 0));
      if (s.cnk) {
        el.appendChild(btnEl('Hire knight',   () => this.pickKnightBuild()));
        el.appendChild(btnEl('Promote/Activate knight', () => this.openKnightMenu()));
        el.appendChild(btnEl('Build wall',    () => this.pickWallBuild()));
        el.appendChild(btnEl('Improve city',  () => this.openImproveMenu()));
      }
      const endBtn = btnEl('End turn', () => Net.send('end_turn'));
      endBtn.className = 'primary';
      el.appendChild(endBtn);
    },

    renderLog() {
      const el = document.getElementById('log');
      el.innerHTML = this.state.log.map(l => `<div class="l">${esc(l.msg)}</div>`).join('');
      el.scrollTop = el.scrollHeight;
    },

    renderHand() {
      const el = document.getElementById('hand');
      el.innerHTML = '';
      if (!this.me || !this.me.hand) return;
      for (const r of RES) {
        const n = this.me.hand.r[r] || 0;
        const d = document.createElement('div');
        d.className = `card ${r}${n === 0 ? ' zero' : ''}`;
        d.innerHTML = `<span class="icon">${Icons[r]}</span><span class="n">${n}</span><span class="k">${r}</span>`;
        el.appendChild(d);
      }
      if (this.state.cnk) {
        for (const c of COMM) {
          const n = this.me.hand.c[c] || 0;
          const d = document.createElement('div');
          d.className = `card ${c}${n === 0 ? ' zero' : ''}`;
          d.innerHTML = `<span class="icon">${Icons[c]}</span><span class="n">${n}</span><span class="k">${c}</span>`;
          el.appendChild(d);
        }
      }
      if (this.me.devCards && this.me.devCards.length) {
        const d = document.createElement('div');
        d.className = 'card dev-card';
        d.innerHTML = `<span class="icon">${Icons.dev}</span><span class="n">${this.me.devCards.length}</span><span class="k">dev</span>`;
        d.title = this.me.devCards.join(', ');
        el.appendChild(d);
      }
      // Track previous hand for gain-floats on roll
      if (!this._prevHand) this._prevHand = JSON.parse(JSON.stringify(this.me.hand));
    },

    // --- picker flows ---
    pickSettlementSetup() {
      const s = this.state, topo = s.map.topo;
      const taken = new Set();
      s.players.forEach(p => { p.settlements.forEach(v => taken.add(v)); p.cities.forEach(v => taken.add(v)); });
      const filter = (v) => {
        if (taken.has(v.id)) return false;
        for (const nb of topo.vAdj[v.id]) if (taken.has(nb)) return false;
        return true;
      };
      banner('Pick a vertex for your settlement');
      Render.inst.startPick('vertex', filter, (vId) => {
        Net.send('place_settlement', { vertexId: vId, setup: true });
        banner('');
      });
    },
    pickRoadSetup() {
      const s = this.state;
      const myLastSettle = this.me.settlements[this.me.settlements.length - 1];
      const filter = (e) => {
        if (s.players.some(p => p.roads.includes(e.id))) return false;
        return e.a === myLastSettle || e.b === myLastSettle;
      };
      banner('Pick an edge next to your new settlement');
      Render.inst.startPick('edge', filter, (eId) => {
        Net.send('place_road', { edgeId: eId, setup: true });
        banner('');
      });
    },
    pickSettlementBuild() {
      const s = this.state, topo = s.map.topo;
      const taken = new Set();
      s.players.forEach(p => { p.settlements.forEach(v => taken.add(v)); p.cities.forEach(v => taken.add(v)); });
      const myRoadEdges = new Set(this.me.roads);
      const filter = (v) => {
        if (taken.has(v.id)) return false;
        for (const nb of topo.vAdj[v.id]) if (taken.has(nb)) return false;
        return v.edges.some(e => myRoadEdges.has(e));
      };
      banner('Pick a vertex to build a settlement');
      Render.inst.startPick('vertex', filter, (vId) => {
        Net.send('place_settlement', { vertexId: vId });
        banner('');
      });
    },
    pickRoadBuild() {
      const s = this.state, topo = s.map.topo;
      const takenE = new Set(); s.players.forEach(p => p.roads.forEach(e => takenE.add(e)));
      const myVerts = new Set([...this.me.settlements, ...this.me.cities]);
      const myRoads = new Set(this.me.roads);
      const filter = (e) => {
        if (takenE.has(e.id)) return false;
        if (myVerts.has(e.a) || myVerts.has(e.b)) return true;
        // adjacent to own road, not blocked by opponent
        for (const r of myRoads) {
          const o = topo.edges[r];
          const shared = (o.a === e.a || o.b === e.a) ? e.a
                       : (o.a === e.b || o.b === e.b) ? e.b : null;
          if (shared == null) continue;
          const owner = ownerOf(s, shared);
          if (!owner || owner.id === Net.playerId) return true;
        }
        return false;
      };
      banner('Pick an edge to build a road');
      Render.inst.startPick('edge', filter, (eId) => {
        Net.send('place_road', { edgeId: eId }); banner('');
      });
    },
    pickCityBuild() {
      const filter = (v) => this.me.settlements.includes(v.id);
      banner('Pick your settlement to upgrade');
      Render.inst.startPick('vertex', filter, (vId) => {
        Net.send('build_city', { vertexId: vId }); banner('');
      });
    },
    pickKnightBuild() {
      const s = this.state, topo = s.map.topo;
      const myRoadEdges = new Set(this.me.roads);
      const occupied = new Set();
      s.players.forEach(p => {
        p.settlements.forEach(v => occupied.add(v));
        p.cities.forEach(v => occupied.add(v));
        if (p.ck && p.ck.knights) Object.keys(p.ck.knights).forEach(v => occupied.add(+v));
      });
      const filter = (v) => !occupied.has(v.id) && v.edges.some(e => myRoadEdges.has(e));
      banner('Pick a vertex for your knight');
      Render.inst.startPick('vertex', filter, (vId) => {
        Net.send('ck_knight_build', { vertexId: vId }); banner('');
      });
    },
    pickWallBuild() {
      const filter = (v) => this.me.cities.includes(v.id)
        && !(this.me.ck.cityWalls || []).includes(v.id);
      banner('Pick a city to wall');
      Render.inst.startPick('vertex', filter, (vId) => {
        Net.send('ck_wall', { vertexId: vId }); banner('');
      });
    },
    pickRobberHex() {
      const filter = (h) => h.id !== this.state.robberHex;
      banner('Move the robber to a new hex');
      Render.inst.startPick('hex', filter, (hId) => {
        Net.send('move_robber', { hexId: hId }); banner('');
      });
    },

    // --- modals ---
    openDiscardModal() {
      const total = Object.values(this.me.hand.r).reduce((a, b) => a + b, 0)
                  + Object.values(this.me.hand.c).reduce((a, b) => a + b, 0);
      const need = Math.floor(total / 2);
      const picks = {};
      const all = [...RES, ...COMM];
      for (const k of all) picks[k] = 0;
      const render = () => {
        const used = Object.values(picks).reduce((a, b) => a + b, 0);
        openModal(`
          <h3>Discard ${need} cards (${used}/${need})</h3>
          <div class="row">${all.map(k => {
            const have = RES.includes(k) ? (this.me.hand.r[k] || 0) : (this.me.hand.c[k] || 0);
            return `<button class="chip" data-k="${k}" ${have === 0 ? 'disabled' : ''}>
              ${k}: ${picks[k]}/${have}
            </button>`;
          }).join('')}</div>
          <div class="row" style="justify-content:flex-end;margin-top:20px">
            <button class="chip" id="dCancel">Cancel</button>
            <button class="chip on" id="dConfirm" ${used !== need ? 'disabled' : ''}>Discard</button>
          </div>
        `);
        document.querySelectorAll('.chip[data-k]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const k = btn.dataset.k;
            const have = RES.includes(k) ? (this.me.hand.r[k] || 0) : (this.me.hand.c[k] || 0);
            const used2 = Object.values(picks).reduce((a, b) => a + b, 0);
            if (e.shiftKey && picks[k] > 0) picks[k]--;
            else if (picks[k] < have && used2 < need) picks[k]++;
            render();
          });
        });
        document.getElementById('dCancel').onclick = closeModal;
        document.getElementById('dConfirm').onclick = () => {
          const cards = {};
          for (const [k, v] of Object.entries(picks)) if (v > 0) cards[k] = v;
          Net.send('discard', { cards });
          closeModal();
        };
      };
      render();
    },

    openStealModal() {
      const cands = this.state.pendingSteal.candidates;
      openModal(`
        <h3>Choose a victim</h3>
        <div class="row">
          ${cands.map(id => {
            const p = this.state.players.find(x => x.id === id);
            return `<button class="chip" data-id="${id}">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:6px"></span>
              ${esc(p.name)} (${p.handCount} cards)
            </button>`;
          }).join('')}
        </div>
      `);
      document.querySelectorAll('.chip[data-id]').forEach(b => {
        b.onclick = () => { Net.send('steal', { targetId: b.dataset.id }); closeModal(); };
      });
    },

    openPlayerTradeModal() {
      const give = {}, want = {};
      for (const r of RES) { give[r] = 0; want[r] = 0; }
      const render = () => {
        const canOffer = RES.some(r => give[r] > 0) || RES.some(r => want[r] > 0);
        openModal(`
          <h3>Propose a trade</h3>
          <div style="font-size:11px;color:var(--fg-mute);margin-bottom:14px;letter-spacing:.05em;text-transform:uppercase">You give</div>
          <div class="row">${RES.map(r => `
            <div class="counter-chip-ui" data-side="give" data-r="${r}">
              <span class="icon">${Icons[r]}</span>
              <span class="rbtn" data-op="-" data-side="give" data-r="${r}">−</span>
              <span class="rnum">${give[r]}</span>
              <span class="rbtn" data-op="+" data-side="give" data-r="${r}">+</span>
              <span class="rhave">/ ${this.me.hand.r[r] || 0}</span>
            </div>`).join('')}
          </div>
          <div style="font-size:11px;color:var(--fg-mute);margin:18px 0 10px;letter-spacing:.05em;text-transform:uppercase">You want</div>
          <div class="row">${RES.map(r => `
            <div class="counter-chip-ui" data-side="want" data-r="${r}">
              <span class="icon">${Icons[r]}</span>
              <span class="rbtn" data-op="-" data-side="want" data-r="${r}">−</span>
              <span class="rnum">${want[r]}</span>
              <span class="rbtn" data-op="+" data-side="want" data-r="${r}">+</span>
            </div>`).join('')}
          </div>
          <div class="row" style="justify-content:flex-end;margin-top:20px">
            <button class="chip ghost" id="pCancel">Cancel</button>
            <button class="chip on" id="pSend" ${canOffer ? '' : 'disabled'}>Send offer</button>
          </div>
        `);
        document.querySelectorAll('[data-op]').forEach(b => {
          b.onclick = (e) => {
            e.stopPropagation();
            const r = b.dataset.r, side = b.dataset.side, op = b.dataset.op;
            const bag = side === 'give' ? give : want;
            if (op === '+') {
              if (side === 'give' && bag[r] >= (this.me.hand.r[r] || 0)) return;
              bag[r]++;
            } else if (bag[r] > 0) bag[r]--;
            render();
          };
        });
        document.getElementById('pCancel').onclick = closeModal;
        document.getElementById('pSend').onclick = () => {
          Net.send('trade_offer', { give: strip(give), want: strip(want) });
          closeModal();
        };
      };
      render();
    },

    renderOpenTrade() {
      const t = this.state.openTrade;
      let bar = document.getElementById('tradeBar');
      if (!t) { if (bar) bar.remove(); return; }
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'tradeBar';
        bar.className = 'trade-bar';
        document.getElementById('boardWrap').appendChild(bar);
      }
      const from = this.state.players.find(p => p.id === t.fromId);
      const fmtIcons = (o) => RES.filter(r => (o[r] || 0) > 0)
        .map(r => `<span class="trade-pill ${r}">${o[r]}${Icons[r]}</span>`).join('') || '<span style="color:var(--fg-mute)">—</span>';
      const isMine = t.fromId === Net.playerId;
      const accepters = Object.keys(t.responses).filter(id => t.responses[id] === 'accept');
      const counterers = Object.keys(t.counters || {});
      const myCounter = (t.counters || {})[Net.playerId];
      const already = t.responses[Net.playerId] === 'accept';

      if (isMine) {
        const options = [];
        for (const id of accepters) {
          const p = this.state.players.find(x => x.id === id);
          options.push(`
            <button class="chip on confirm-chip" data-accept="${id}">
              <span style="color:${p.color}">●</span> Confirm with ${esc(p.name)}
            </button>`);
        }
        for (const id of counterers) {
          const p = this.state.players.find(x => x.id === id);
          const c = t.counters[id];
          options.push(`
            <button class="chip confirm-chip counter-chip" data-accept="${id}" title="Accept this counter">
              <span style="color:${p.color}">●</span> ${esc(p.name)}'s counter:
              <span class="mini-trade">${fmtIcons(c.give)} <span class="arrow">→</span> ${fmtIcons(c.want)}</span>
            </button>`);
        }
        bar.innerHTML = `
          <div class="t-head">
            <strong>Your offer</strong>
            <span class="mini-trade">${fmtIcons(t.give)} <span class="arrow">→</span> ${fmtIcons(t.want)}</span>
          </div>
          <div class="t-body">
            ${options.length === 0
              ? '<span style="color:var(--fg-dim); font-size:12px">waiting for responses…</span>'
              : options.join('')}
            <button class="chip ghost" id="tCancelOffer">Cancel</button>
          </div>`;
        bar.querySelectorAll('[data-accept]').forEach(b => {
          b.onclick = () => Net.send('trade_accept', { otherId: b.dataset.accept });
        });
        document.getElementById('tCancelOffer').onclick = () => Net.send('trade_cancel');
      } else {
        const status = already ? 'Accepted'
                     : myCounter ? 'Countered'
                     : '';
        bar.innerHTML = `
          <div class="t-head">
            <strong>${esc(from.name)}</strong> offers
            <span class="mini-trade">${fmtIcons(t.give)} <span class="arrow">→</span> ${fmtIcons(t.want)}</span>
            ${status ? `<span class="status-pill">${status}</span>` : ''}
          </div>
          <div class="t-body">
            <button class="chip on" id="tAccept" ${already ? 'disabled' : ''}>${already ? '✓ Accepted' : 'Accept'}</button>
            <button class="chip" id="tCounter">${myCounter ? 'Edit counter' : 'Counter'}</button>
            <button class="chip ghost" id="tReject">${already || myCounter ? 'Withdraw' : 'Pass'}</button>
          </div>`;
        document.getElementById('tAccept').onclick = () => Net.send('trade_respond', { accept: true });
        document.getElementById('tReject').onclick = () => Net.send('trade_respond', { accept: false });
        document.getElementById('tCounter').onclick = () => this.openCounterModal(t);
      }
    },

    openCounterModal(trade) {
      const give = {}, want = {};
      for (const r of RES) { give[r] = 0; want[r] = 0; }
      // Preseed with inverse of their offer as starting point
      for (const [k, v] of Object.entries(trade.give)) want[k] = v;
      for (const [k, v] of Object.entries(trade.want)) give[k] = v;
      const render = () => {
        const canSend = RES.some(r => give[r] > 0) && RES.some(r => want[r] > 0);
        openModal(`
          <h3>Counter-offer</h3>
          <div style="font-size:11px;color:var(--fg-mute);margin-bottom:14px;letter-spacing:.05em;text-transform:uppercase">
            You give (from your hand)
          </div>
          <div class="row">${RES.map(r => `
            <div class="counter-chip-ui" data-side="give" data-r="${r}">
              <span class="icon">${Icons[r]}</span>
              <span class="rbtn" data-op="-" data-side="give" data-r="${r}">−</span>
              <span class="rnum">${give[r]}</span>
              <span class="rbtn" data-op="+" data-side="give" data-r="${r}">+</span>
              <span class="rhave">/ ${this.me.hand.r[r] || 0}</span>
            </div>`).join('')}
          </div>
          <div style="font-size:11px;color:var(--fg-mute);margin:18px 0 10px;letter-spacing:.05em;text-transform:uppercase">
            You want (from ${esc(this.state.players.find(p => p.id === trade.fromId).name)})
          </div>
          <div class="row">${RES.map(r => `
            <div class="counter-chip-ui" data-side="want" data-r="${r}">
              <span class="icon">${Icons[r]}</span>
              <span class="rbtn" data-op="-" data-side="want" data-r="${r}">−</span>
              <span class="rnum">${want[r]}</span>
              <span class="rbtn" data-op="+" data-side="want" data-r="${r}">+</span>
            </div>`).join('')}
          </div>
          <div class="row" style="justify-content:flex-end;margin-top:20px">
            <button class="chip ghost" id="cCancel">Cancel</button>
            <button class="chip on" id="cSend" ${canSend ? '' : 'disabled'}>Send counter</button>
          </div>
        `);
        document.querySelectorAll('[data-op]').forEach(b => {
          b.onclick = (e) => {
            e.stopPropagation();
            const r = b.dataset.r, side = b.dataset.side, op = b.dataset.op;
            const bag = side === 'give' ? give : want;
            if (op === '+') {
              if (side === 'give' && bag[r] >= (this.me.hand.r[r] || 0)) return;
              bag[r]++;
            } else if (bag[r] > 0) bag[r]--;
            render();
          };
        });
        document.getElementById('cCancel').onclick = closeModal;
        document.getElementById('cSend').onclick = () => {
          Net.send('trade_counter', { give: strip(give), want: strip(want) });
          closeModal();
        };
      };
      render();
    },

    openBankTradeModal() {
      let give = null, take = null;
      const render = () => {
        const rates = {};
        for (const r of RES) rates[r] = this.harborRate(r);
        openModal(`
          <h3>Trade with bank</h3>
          <div style="font-size:12px;color:var(--fg-dim);margin-bottom:8px">Give (rate shown):</div>
          <div class="row">${RES.map(r => `
            <button class="chip ${give === r ? 'on' : ''}" data-g="${r}"
                    ${(this.me.hand.r[r] || 0) < rates[r] ? 'disabled' : ''}>
              ${r} ${rates[r]}:1 (${this.me.hand.r[r] || 0})
            </button>`).join('')}</div>
          <div style="font-size:12px;color:var(--fg-dim);margin:16px 0 8px">Take:</div>
          <div class="row">${RES.map(r => `
            <button class="chip ${take === r ? 'on' : ''}" data-t="${r}">${r}</button>
          `).join('')}</div>
          <div class="row" style="justify-content:flex-end;margin-top:20px">
            <button class="chip" id="tCancel">Cancel</button>
            <button class="chip on" id="tConfirm" ${!give || !take || give === take ? 'disabled' : ''}>Trade</button>
          </div>
        `);
        document.querySelectorAll('.chip[data-g]').forEach(b => b.onclick = () => { give = b.dataset.g; render(); });
        document.querySelectorAll('.chip[data-t]').forEach(b => b.onclick = () => { take = b.dataset.t; render(); });
        document.getElementById('tCancel').onclick = closeModal;
        document.getElementById('tConfirm').onclick = () => {
          Net.send('bank_trade', { give: { [give]: rates[give] }, take: { [take]: 1 } });
          closeModal();
        };
      };
      render();
    },

    openPlayDevModal() {
      openModal(`
        <h3>Play a development card</h3>
        <div class="row">
          ${(this.me.devCards || []).map((c, i) => `<button class="chip" data-c="${c}" data-i="${i}">${c.replace('_', ' ')}</button>`).join('')}
        </div>
      `);
      document.querySelectorAll('.chip[data-c]').forEach(b => {
        b.onclick = () => {
          const c = b.dataset.c;
          closeModal();
          if (c === 'knight') {
            // Server starts robber phase; local picker opens immediately
            Net.send('play_dev', { card: c, args: {} });
          } else if (c === 'year_of_plenty') {
            this.openPickTwoResourcesModal('Year of Plenty — pick 2 resources', (a, b2) => {
              Net.send('play_dev', { card: c, args: { resources: [a, b2] } });
            });
          } else if (c === 'monopoly') {
            this.openPickResourceModal('Monopoly — pick a resource', (r) => {
              Net.send('play_dev', { card: c, args: { resource: r } });
            });
          } else if (c === 'road_building') {
            // Chain two free road picks: pick edge 1 → pick edge 2 → send
            this.pickFreeRoad(1, (e1) => {
              this.pickFreeRoad(2, (e2) => {
                Net.send('play_dev', { card: c, args: { edges: [e1, e2] } });
              });
            });
          } else if (c === 'vp') {
            banner('VP cards stay hidden until you reach 10 total');
            setTimeout(() => banner(''), 2000);
          }
        };
      });
    },

    pickFreeRoad(n, cb) {
      const s = this.state, topo = s.map.topo;
      const takenE = new Set(); s.players.forEach(p => p.roads.forEach(e => takenE.add(e)));
      const myVerts = new Set([...this.me.settlements, ...this.me.cities]);
      const myRoads = new Set(this.me.roads);
      const filter = (e) => {
        if (takenE.has(e.id)) return false;
        if (myVerts.has(e.a) || myVerts.has(e.b)) return true;
        for (const r of myRoads) {
          const o = topo.edges[r];
          if (o.a === e.a || o.b === e.a || o.a === e.b || o.b === e.b) {
            const shared = (o.a === e.a || o.b === e.a) ? e.a : e.b;
            const owner = ownerOf(s, shared);
            if (!owner || owner.id === Net.playerId) return true;
          }
        }
        return false;
      };
      banner(`Road Building — pick free road ${n}/2`);
      Render.inst.startPick('edge', filter, (eId) => {
        banner('');
        cb(eId);
      });
    },

    openPickResourceModal(title, cb) {
      openModal(`
        <h3>${esc(title)}</h3>
        <div class="row">${RES.map(r => `<button class="chip" data-r="${r}">${r}</button>`).join('')}</div>
      `);
      document.querySelectorAll('.chip[data-r]').forEach(b => {
        b.onclick = () => { cb(b.dataset.r); closeModal(); };
      });
    },
    openPickTwoResourcesModal(title, cb) {
      const picks = [];
      const render = () => {
        openModal(`
          <h3>${esc(title)} (${picks.length}/2)</h3>
          <div class="row">${RES.map(r => `<button class="chip ${picks.includes(r) ? 'on' : ''}" data-r="${r}">${r}</button>`).join('')}</div>
          <div class="row" style="justify-content:flex-end;margin-top:20px">
            <button class="chip" id="pCancel">Cancel</button>
            <button class="chip on" id="pConfirm" ${picks.length !== 2 ? 'disabled' : ''}>OK</button>
          </div>
        `);
        document.querySelectorAll('.chip[data-r]').forEach(b => {
          b.onclick = () => { if (picks.length < 2) picks.push(b.dataset.r); render(); };
        });
        document.getElementById('pCancel').onclick = () => { closeModal(); };
        document.getElementById('pConfirm').onclick = () => { cb(picks[0], picks[1]); closeModal(); };
      };
      render();
    },

    openHistoryModal() {
      const history = (this.state && this.state.tradeHistory) || [];
      const players = this.state ? this.state.players : [];
      const nameOf = (id) => {
        const p = players.find(x => x.id === id);
        return p ? p.name : '?';
      };
      const colorOf = (id) => {
        const p = players.find(x => x.id === id);
        return p ? p.color : 'var(--fg-mute)';
      };
      const fmt = (o) => RES.filter(r => (o[r] || 0) > 0)
        .map(r => `<span class="trade-pill ${r}">${o[r]}${Icons[r]}</span>`).join('') || '—';
      const dot = (id) => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colorOf(id)};margin:0 4px -1px 0"></span>`;

      const rows = history.length === 0
        ? '<div style="color:var(--fg-mute);text-align:center;padding:30px 0;font-size:13px">No trades yet</div>'
        : history.slice().reverse().map(h => {
            const time = new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (h.kind === 'bank') {
              return `<div class="hist-row">
                <span class="hist-time">${time}</span>
                <span class="hist-parties">${dot(h.fromId)}${esc(nameOf(h.fromId))} <span class="hist-arrow">⇄ BANK</span></span>
                <span class="hist-trade">${fmt(h.give)}<span class="arrow">→</span>${fmt(h.take)}</span>
              </div>`;
            }
            return `<div class="hist-row">
              <span class="hist-time">${time}</span>
              <span class="hist-parties">${dot(h.fromId)}${esc(nameOf(h.fromId))} <span class="hist-arrow">⇄</span> ${dot(h.toId)}${esc(nameOf(h.toId))}</span>
              <span class="hist-trade">${fmt(h.give)}<span class="arrow">→</span>${fmt(h.take)}</span>
            </div>`;
          }).join('');

      // Simple totals per player: given/received counts
      const totals = {};
      for (const p of players) totals[p.id] = { out: 0, in: 0 };
      for (const h of history) {
        const outCount = Object.values(h.give).reduce((a, b) => a + b, 0);
        const inCount  = Object.values(h.take).reduce((a, b) => a + b, 0);
        if (totals[h.fromId]) { totals[h.fromId].out += outCount; totals[h.fromId].in += inCount; }
        if (h.toId && totals[h.toId]) { totals[h.toId].out += inCount; totals[h.toId].in += outCount; }
      }
      const totalsHtml = players.map(p => `
        <div class="hist-total">
          ${dot(p.id)}<span style="font-weight:600">${esc(p.name)}</span>
          <span class="hist-total-nums">
            <span title="Given">−${totals[p.id].out}</span>
            <span title="Received">+${totals[p.id].in}</span>
          </span>
        </div>`).join('');

      openModal(`
        <h3>Trade history <span style="color:var(--fg-mute);font-weight:500;font-size:13px;margin-left:8px">${history.length} trade${history.length === 1 ? '' : 's'}</span></h3>
        <div class="hist-totals">${totalsHtml}</div>
        <div class="hist-list">${rows}</div>
        <div class="row" style="justify-content:flex-end;margin-top:16px">
          <button class="chip ghost" id="hClose">Close</button>
        </div>
      `);
      document.getElementById('hClose').onclick = closeModal;
    },

    openImproveMenu() {
      openModal(`
        <h3>Improve a city</h3>
        <div class="row">
          <button class="chip" data-t="trade">Trade (paper)</button>
          <button class="chip" data-t="politics">Politics (coin)</button>
          <button class="chip" data-t="science">Science (cloth)</button>
        </div>
      `);
      document.querySelectorAll('.chip[data-t]').forEach(b => {
        b.onclick = () => { Net.send('ck_improve', { track: b.dataset.t }); closeModal(); };
      });
    },
    openKnightMenu() {
      const myKnights = this.me.ck ? Object.entries(this.me.ck.knights) : [];
      openModal(`
        <h3>Your knights</h3>
        <div class="row" style="flex-direction:column">
          ${myKnights.length === 0 ? '<div style="color:var(--fg-dim)">no knights yet</div>'
            : myKnights.map(([vid, k]) => `
              <div class="row" style="align-items:center">
                <span style="flex:1">rank ${k.rank} · ${k.active ? 'active' : 'inactive'}</span>
                <button class="chip" data-promote="${vid}" ${k.rank >= 3 ? 'disabled' : ''}>Promote</button>
                <button class="chip" data-activate="${vid}" ${k.active ? 'disabled' : ''}>Activate</button>
              </div>`).join('')}
        </div>
      `);
      document.querySelectorAll('[data-promote]').forEach(b => {
        b.onclick = () => { Net.send('ck_knight_promote', { vertexId: +b.dataset.promote }); closeModal(); };
      });
      document.querySelectorAll('[data-activate]').forEach(b => {
        b.onclick = () => { Net.send('ck_knight_activate', { vertexId: +b.dataset.activate }); closeModal(); };
      });
    },

    harborRate(res) {
      let rate = 4;
      const myVerts = new Set([...this.me.settlements, ...this.me.cities]);
      for (const h of this.state.map.harbors) {
        const e = this.state.map.topo.edges[h.edgeId];
        if (!myVerts.has(e.a) && !myVerts.has(e.b)) continue;
        if (h.type === '3:1') rate = Math.min(rate, 3);
        else if (h.type === res) rate = Math.min(rate, 2);
      }
      return rate;
    },
  };

  function btnEl(label, onClick, span = false) {
    const b = document.createElement('button');
    b.textContent = label; b.onclick = onClick;
    if (span) b.style.gridColumn = 'span 2';
    return b;
  }
  function actionBtn(label, icon, cost, onClick, affordable) {
    const b = document.createElement('button');
    b.className = 'action-build' + (affordable ? '' : ' broke');
    b.onclick = onClick;
    const costHtml = Object.entries(cost)
      .map(([k, v]) => `<span class="cost ${k}">${v}${Icons[k]}</span>`).join('');
    b.innerHTML = `
      <span class="ab-label">${icon}${label}</span>
      <span class="ab-cost">${costHtml}</span>
    `;
    b.title = Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(' + ');
    return b;
  }
  function esc(s) { return (s || '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function pips(n) {
    // SVG dice face
    const dots = {
      1: [[2,2]],
      2: [[1,1],[3,3]],
      3: [[1,1],[2,2],[3,3]],
      4: [[1,1],[3,1],[1,3],[3,3]],
      5: [[1,1],[3,1],[2,2],[1,3],[3,3]],
      6: [[1,1],[3,1],[1,2],[3,2],[1,3],[3,3]],
    }[n] || [[2,2]];
    const w = 42;
    const cells = dots.map(([x, y]) => `<circle cx="${x * 10}" cy="${y * 10}" r="3.2" fill="currentColor"/>`).join('');
    return `<svg viewBox="0 0 40 40" width="${w}" height="${w}">${cells}</svg>`;
  }
  function strip(o) { const out = {}; for (const [k, v] of Object.entries(o)) if (v > 0) out[k] = v; return out; }
  function ownerOf(s, vId) {
    for (const p of s.players) if (p.settlements.includes(vId) || p.cities.includes(vId)) return p;
    return null;
  }
  function openModal(html) {
    const m = document.getElementById('modal');
    document.getElementById('modalBody').innerHTML = html;
    m.classList.remove('hidden');
  }
  function closeModal() { document.getElementById('modal').classList.add('hidden'); }
  function banner(msg) {
    const b = document.getElementById('banner');
    if (!msg) { b.classList.add('hidden'); b.innerHTML = ''; return; }
    const picking = Render.inst && Render.inst.pick;
    b.innerHTML = `
      ${esc(msg)}
      ${picking ? '<span class="banner-cancel" title="Cancel (Esc)">✕</span>' : ''}
    `;
    b.classList.remove('hidden');
    const cancel = b.querySelector('.banner-cancel');
    if (cancel) cancel.onclick = () => {
      if (Render.inst) Render.inst.cancelPick();
      banner('');
    };
  }

  window.UI = UI;
  window.closeModal = closeModal;
  window.banner = banner;
})();
