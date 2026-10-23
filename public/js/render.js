// Canvas board renderer. Minimalist hex art + visual harbors + zoom/pan.
(function () {
  const PI = Math.PI;
  const colors = {
    wood:  { base: '#4F8C3F', dark: '#2F5F26', ink: '#1E3C18' },
    brick: { base: '#C9603A', dark: '#974327', ink: '#5C2814' },
    sheep: { base: '#B9D96A', dark: '#8EB54A', ink: '#4F6B1A' },
    wheat: { base: '#EBB03C', dark: '#C58A17', ink: '#754F08' },
    ore:   { base: '#9FA9B2', dark: '#6F7881', ink: '#2D343A' },
    desert:{ base: '#E8CB82', dark: '#B9985A', ink: '#6B5024' },
  };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.state = null;
      this.hitVertex = null; this.hitEdge = null; this.hitHex = null;
      this.hover = null;
      this.pick = null;
      this.scale = 60; this.offset = { x: 0, y: 0 };
      this.minScale = 20; this.maxScale = 200;
      this.dragging = null; this.dragMoved = 0;
      this.resize();
      window.addEventListener('resize', () => this.resize());

      canvas.addEventListener('mousemove', (e) => this.onMove(e));
      canvas.addEventListener('mousedown', (e) => this.onDown(e));
      canvas.addEventListener('mouseup',   (e) => this.onUp(e));
      canvas.addEventListener('mouseleave',() => { this.dragging = null; this.hideTip(); });
      canvas.addEventListener('wheel',     (e) => this.onWheel(e), { passive: false });
      canvas.addEventListener('click',     (e) => this.onClick(e));

      // Touch: pinch-zoom + 1-finger pan
      let touchStart = null, pinchStart = null;
      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          touchStart = { x: t.clientX, y: t.clientY, ox: this.offset.x, oy: this.offset.y, moved: 0 };
        } else if (e.touches.length === 2) {
          const [a, b] = e.touches;
          pinchStart = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale: this.scale };
        }
      });
      canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && touchStart) {
          const t = e.touches[0];
          const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
          touchStart.moved += Math.hypot(dx, dy);
          this.offset.x = touchStart.ox + dx; this.offset.y = touchStart.oy + dy;
          this.draw();
        } else if (e.touches.length === 2 && pinchStart) {
          const [a, b] = e.touches;
          const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          this.scale = Math.max(this.minScale, Math.min(this.maxScale, pinchStart.scale * (d / pinchStart.dist)));
          this.draw();
        }
      }, { passive: false });
      canvas.addEventListener('touchend', (e) => {
        if (touchStart && touchStart.moved < 10 && e.changedTouches.length === 1) {
          const t = e.changedTouches[0];
          this.onClick({ clientX: t.clientX, clientY: t.clientY });
        }
        touchStart = null; pinchStart = null;
      });
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = r.width * dpr;
      this.canvas.height = r.height * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = r.width; this.H = r.height;
      this.fit();
      this.draw();
    }

    fit() {
      if (!this.state) return;
      if (this.W < 50 || this.H < 50) return;
      const hexes = this.state.map.topo.hexes;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const h of hexes) {
        minX = Math.min(minX, h.x); maxX = Math.max(maxX, h.x);
        minY = Math.min(minY, h.y); maxY = Math.max(maxY, h.y);
      }
      const spanX = (maxX - minX) + 2.5, spanY = (maxY - minY) + 2.5;
      const pad = 60;
      const sx = (this.W - pad * 2) / spanX, sy = (this.H - pad * 2) / spanY;
      this.scale = Math.max(this.minScale, Math.min(sx, sy));
      this.offset = {
        x: this.W / 2 - ((minX + maxX) / 2) * this.scale,
        y: this.H / 2 - ((minY + maxY) / 2) * this.scale,
      };
    }

    setState(state) {
      const first = !this.state;
      this.state = state;
      if (first) this.fit();
      this.draw();
    }

    toScreen(x, y) {
      return { x: x * this.scale + this.offset.x, y: y * this.scale + this.offset.y };
    }

    draw() {
      const { ctx } = this;
      ctx.clearRect(0, 0, this.W, this.H);
      if (!this.state) return;
      if (this.scale <= 0 || !isFinite(this.scale)) return;
      const s = this.state;
      const topo = s.map.topo;

      // Subtle island glow
      ctx.save();
      for (const h of topo.hexes) {
        const p = this.toScreen(h.x, h.y);
        const r = this.scale * 1.3;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.08)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, PI * 2); ctx.fill();
      }
      ctx.restore();

      // Hexes
      for (const h of topo.hexes) {
        const p = this.toScreen(h.x, h.y);
        const r = this.scale * 0.98;
        drawHex(ctx, p.x, p.y, r, h.res, h.id === s.robberHex);
        if (h.num !== null && h.num !== undefined) {
          drawNumber(ctx, p.x, p.y, r * 0.3, h.num);
        }
        if (this.pick && this.pick.kind === 'hex' && this.pick.filter(h)) {
          ctx.save();
          ctx.strokeStyle = (this.hover && this.hover.kind === 'hex' && this.hover.id === h.id)
            ? '#FFD166' : 'rgba(255,255,255,0.65)';
          ctx.lineWidth = (this.hover && this.hover.kind === 'hex' && this.hover.id === h.id) ? 3 : 2;
          strokeHex(ctx, p.x, p.y, r);
          ctx.restore();
        }
      }

      // Harbors — visible docks on the water
      for (const harbor of s.map.harbors) {
        drawHarbor(ctx, topo, harbor, this);
      }

      // Edges (roads + pickable)
      for (const e of topo.edges) {
        const owner = this.ownerOfEdge(e.id);
        const va = topo.vertices[e.a], vb = topo.vertices[e.b];
        const pa = this.toScreen(va.x, va.y), pb = this.toScreen(vb.x, vb.y);
        if (owner) {
          // Road shadow
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = this.scale * 0.19; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(pa.x + 1, pa.y + 2); ctx.lineTo(pb.x + 1, pb.y + 2); ctx.stroke();
          // Road body
          ctx.strokeStyle = owner.color;
          ctx.lineWidth = this.scale * 0.16;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        }
        if (this.pick && this.pick.kind === 'edge' && this.pick.filter(e)) {
          const isHover = this.hover && this.hover.kind === 'edge' && this.hover.id === e.id;
          ctx.strokeStyle = isHover ? '#FFD166' : 'rgba(255,255,255,0.5)';
          ctx.lineWidth = isHover ? this.scale * 0.14 : this.scale * 0.1;
          ctx.setLineDash(isHover ? [] : [this.scale * 0.1, this.scale * 0.08]);
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Vertices (settlements, cities, knights + pickable)
      for (const v of topo.vertices) {
        const p = this.toScreen(v.x, v.y);
        const owner = this.ownerOfVertex(v.id);
        const kOwner = this.knightOnVertex(v.id);
        const sizeFactor = this.scale / 60;
        if (owner) {
          const isCity = owner.cities.includes(v.id);
          drawPiece(ctx, p.x, p.y, isCity ? 'city' : 'settlement', owner.color, null, sizeFactor);
          if (isCity && owner.ck && owner.ck.cityWalls && owner.ck.cityWalls.includes(v.id)) {
            ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(p.x, p.y, 18 * sizeFactor, 0, PI * 2); ctx.stroke();
          }
        } else if (kOwner) {
          drawPiece(ctx, p.x, p.y, 'knight', kOwner.player.color, kOwner.knight, sizeFactor);
        }
        if (this.pick && this.pick.kind === 'vertex' && this.pick.filter(v)) {
          const isHover = this.hover && this.hover.kind === 'vertex' && this.hover.id === v.id;
          ctx.fillStyle = isHover ? '#FFD166' : 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, isHover ? 10 : 6, 0, PI * 2); ctx.fill();
        }
      }

      // Robber
      const rh = s.map.topo.hexes[s.robberHex];
      if (rh) {
        const p = this.toScreen(rh.x, rh.y);
        const r = this.scale * 0.22;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y + r + 6, r * 0.9, r * 0.3, 0, 0, PI * 2); ctx.fill();
        ctx.fillStyle = '#1A1A1A';
        ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - r * 0.7, p.y + r); ctx.quadraticCurveTo(p.x - r, p.y, p.x, p.y - r);
        ctx.quadraticCurveTo(p.x + r, p.y, p.x + r * 0.7, p.y + r); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }

    ownerOfVertex(vId) {
      for (const p of this.state.players) {
        if (p.settlements.includes(vId) || p.cities.includes(vId)) return p;
      }
      return null;
    }
    ownerOfEdge(eId) {
      for (const p of this.state.players) if (p.roads.includes(eId)) return p;
      return null;
    }
    knightOnVertex(vId) {
      for (const p of this.state.players) {
        if (p.ck && p.ck.knights && p.ck.knights[vId]) {
          return { player: p, knight: p.ck.knights[vId] };
        }
      }
      return null;
    }

    // ---------------- Zoom / Pan ----------------
    zoom(factor, pivotX, pivotY) {
      pivotX = pivotX ?? this.W / 2;
      pivotY = pivotY ?? this.H / 2;
      const wx = (pivotX - this.offset.x) / this.scale;
      const wy = (pivotY - this.offset.y) / this.scale;
      this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
      this.offset.x = pivotX - wx * this.scale;
      this.offset.y = pivotY - wy * this.scale;
      this.draw();
    }
    recenter() { this.fit(); this.draw(); }

    onWheel(e) {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom(factor, mx, my);
    }

    onDown(e) {
      if (this.pick) return;
      this.dragging = { x: e.clientX, y: e.clientY, ox: this.offset.x, oy: this.offset.y };
      this.dragMoved = 0;
    }
    onUp() { this.dragging = null; }

    // ---------------- Hover / Click ----------------
    onMove(e) {
      if (this.dragging) {
        const dx = e.clientX - this.dragging.x, dy = e.clientY - this.dragging.y;
        this.dragMoved = Math.hypot(dx, dy);
        this.offset.x = this.dragging.ox + dx;
        this.offset.y = this.dragging.oy + dy;
        this.draw(); return;
      }
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      this.showHexTooltip(e.clientX, e.clientY, x, y);
      if (!this.pick) { this.hover = null; this.draw(); return; }
      this.hover = this.hitAt(x, y);
      this.draw();
    }

    showHexTooltip(px, py, x, y) {
      const tip = document.getElementById('hexTip');
      if (!tip || !this.state) return;
      let found = null;
      for (const h of this.state.map.topo.hexes) {
        const p = this.toScreen(h.x, h.y);
        if (Math.hypot(p.x - x, p.y - y) < this.scale * 0.85) { found = h; break; }
      }
      if (!found) { tip.classList.add('hidden'); return; }
      const prob = { 2:1,12:1,3:2,11:2,4:3,10:3,5:4,9:4,6:5,8:5 }[found.num] || 0;
      tip.innerHTML = `
        <div class="tip-head">${found.res.toUpperCase()}</div>
        ${found.num ? `<div class="tip-num ${(found.num === 6 || found.num === 8) ? 'red' : ''}">${found.num}
          <span class="tip-dots">${'●'.repeat(prob)}</span></div>` : '<div class="tip-num muted">desert</div>'}
      `;
      tip.style.left = (px + 14) + 'px';
      tip.style.top  = (py + 14) + 'px';
      tip.classList.remove('hidden');
    }
    hideTip() { const t = document.getElementById('hexTip'); if (t) t.classList.add('hidden'); }

    onClick(e) {
      if (this.dragMoved > 5) { this.dragMoved = 0; return; } // dragged, not clicked
      if (!this.pick) return;
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const h = this.hitAt(x, y);
      if (!h) return;
      const pick = this.pick;
      this.pick = null; this.hover = null;
      this.canvas.classList.remove('clickable');
      pick.onPick(h.id);
      this.draw();
    }

    hitAt(x, y) {
      const s = this.state; if (!s) return null;
      const topo = s.map.topo;
      if (this.pick.kind === 'vertex') {
        let best = null, bestD = 24;
        for (const v of topo.vertices) {
          if (!this.pick.filter(v)) continue;
          const p = this.toScreen(v.x, v.y);
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < bestD) { best = v; bestD = d; }
        }
        return best ? { kind: 'vertex', id: best.id } : null;
      }
      if (this.pick.kind === 'edge') {
        let best = null, bestD = 18;
        for (const e of topo.edges) {
          if (!this.pick.filter(e)) continue;
          const va = topo.vertices[e.a], vb = topo.vertices[e.b];
          const pa = this.toScreen(va.x, va.y), pb = this.toScreen(vb.x, vb.y);
          const d = distToSeg(x, y, pa.x, pa.y, pb.x, pb.y);
          if (d < bestD) { best = e; bestD = d; }
        }
        return best ? { kind: 'edge', id: best.id } : null;
      }
      if (this.pick.kind === 'hex') {
        for (const h of topo.hexes) {
          if (!this.pick.filter(h)) continue;
          const p = this.toScreen(h.x, h.y);
          if (Math.hypot(p.x - x, p.y - y) < this.scale * 0.9) return { kind: 'hex', id: h.id };
        }
        return null;
      }
      return null;
    }

    startPick(kind, filter, onPick) {
      this.pick = { kind, filter, onPick };
      this.canvas.classList.add('clickable');
      this.draw();
    }
    cancelPick() { this.pick = null; this.hover = null; this.canvas.classList.remove('clickable'); this.draw(); }
  }

  // ============ Draw helpers ============

  function distToSeg(x, y, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    const px = x1 + t * dx, py = y1 + t * dy;
    return Math.hypot(x - px, y - py);
  }

  function hexPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (PI / 180) * (60 * i);
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function strokeHex(ctx, cx, cy, r) { hexPath(ctx, cx, cy, r); ctx.stroke(); }

  function drawHex(ctx, cx, cy, r, res, hasRobber) {
    ctx.save();
    const c = colors[res] || colors.desert;
    hexPath(ctx, cx, cy, r);
    const grad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    grad.addColorStop(0, lighten(c.base, 10));
    grad.addColorStop(0.6, c.base);
    grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();

    // minimal resource glyph in the background
    ctx.save();
    hexPath(ctx, cx, cy, r);
    ctx.clip();
    drawResourceGlyph(ctx, cx, cy, r, res);
    ctx.restore();

    if (hasRobber) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); }
    ctx.restore();
  }

  // Minimalist resource glyph — single symbol per hex, subtle, geometric
  function drawResourceGlyph(ctx, cx, cy, r, res) {
    const c = colors[res] || colors.desert;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = c.ink;
    ctx.fillStyle = c.ink;
    switch (res) {
      case 'wood': {
        // small pine centred
        drawTree(ctx, cx - r * 0.3, cy + r * 0.1, r * 0.38, c.ink);
        drawTree(ctx, cx + r * 0.25, cy - r * 0.05, r * 0.32, c.ink);
        break;
      }
      case 'brick': {
        // two tidy rows
        ctx.fillStyle = c.ink;
        for (let i = 0; i < 2; i++) {
          const y = cy + r * (-0.05 + i * 0.22);
          for (let j = 0; j < 3; j++) {
            const x = cx + r * (-0.4 + j * 0.4 + (i % 2 ? 0.1 : 0));
            roundRect(ctx, x, y, r * 0.28, r * 0.14, 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'sheep': {
        drawSheep(ctx, cx - r * 0.2, cy + r * 0.05, r * 0.22, c.ink);
        drawSheep(ctx, cx + r * 0.25, cy + r * 0.2, r * 0.18, c.ink);
        break;
      }
      case 'wheat': {
        ctx.strokeStyle = c.ink; ctx.lineWidth = r * 0.03;
        for (let i = 0; i < 4; i++) {
          const x = cx + r * (-0.35 + i * 0.23);
          ctx.beginPath(); ctx.moveTo(x, cy + r * 0.35); ctx.lineTo(x, cy - r * 0.2); ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(x, cy - r * 0.3, r * 0.09, r * 0.14, 0, 0, PI * 2);
          ctx.fillStyle = c.ink; ctx.fill();
        }
        break;
      }
      case 'ore': {
        // two triangular mountains
        ctx.fillStyle = c.ink;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5, cy + r * 0.3);
        ctx.lineTo(cx - r * 0.15, cy - r * 0.2);
        ctx.lineTo(cx + r * 0.15, cy + r * 0.3);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.05, cy + r * 0.3);
        ctx.lineTo(cx + r * 0.3, cy - r * 0.05);
        ctx.lineTo(cx + r * 0.55, cy + r * 0.3);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'desert': {
        // small cactus
        ctx.fillStyle = '#5a803f'; ctx.strokeStyle = c.ink; ctx.lineWidth = r * 0.03;
        roundRect(ctx, cx - r * 0.08, cy - r * 0.3, r * 0.16, r * 0.5, r * 0.06);
        ctx.fill(); ctx.stroke();
        roundRect(ctx, cx - r * 0.3, cy - r * 0.1, r * 0.08, r * 0.22, r * 0.03); ctx.fill(); ctx.stroke();
        roundRect(ctx, cx + r * 0.22, cy - r * 0.15, r * 0.08, r * 0.27, r * 0.03); ctx.fill(); ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  function drawTree(ctx, x, y, size, ink) {
    ctx.save();
    ctx.fillStyle = ink;
    ctx.fillRect(x - size * 0.08, y + size * 0.25, size * 0.16, size * 0.4);
    ctx.fillStyle = '#1F4F1A';
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const r2 = size * (1 - i * 0.2);
      const yOff = y - size * 0.2 + i * size * 0.3;
      ctx.beginPath();
      ctx.moveTo(x - r2 * 0.55, yOff + r2 * 0.3);
      ctx.lineTo(x, yOff - r2 * 0.5);
      ctx.lineTo(x + r2 * 0.55, yOff + r2 * 0.3);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawSheep(ctx, x, y, size, ink) {
    ctx.save();
    ctx.fillStyle = '#F2EFE4';
    ctx.strokeStyle = ink; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(x, y, size * 1.1, size * 0.82, 0, 0, PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2A2A2A';
    ctx.beginPath();
    ctx.ellipse(x + size * 0.8, y - size * 0.08, size * 0.36, size * 0.3, 0, 0, PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawNumber(ctx, cx, cy, r, num) {
    ctx.save();
    // Soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.arc(cx + 0.5, cy + 1.5, r, 0, PI * 2); ctx.fill();
    // Disc
    ctx.fillStyle = '#F5EDD6';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, PI * 2); ctx.stroke();
    // Number
    const red = (num === 6 || num === 8);
    ctx.fillStyle = red ? '#C62828' : '#1A1A1A';
    ctx.font = `800 ${Math.round(r * 1.15)}px Inter, system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(num), cx, cy - r * 0.08);
    // Dots
    const dots = { 2:1,12:1,3:2,11:2,4:3,10:3,5:4,9:4,6:5,8:5 }[num] || 0;
    for (let i = 0; i < dots; i++) {
      ctx.beginPath();
      ctx.arc(cx - (dots - 1) * 2.1 + i * 4.2, cy + r * 0.55, 1.3, 0, PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPiece(ctx, cx, cy, kind, color, knight, s = 1) {
    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 10 * s, 10 * s, 2.5 * s, 0, 0, PI * 2); ctx.fill();
    const ink = '#141414';
    const dark = shadeHex(color, -22);
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5;

    if (kind === 'settlement') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - 9*s, cy + 7*s); ctx.lineTo(cx - 9*s, cy - 2*s);
      ctx.lineTo(cx + 9*s, cy - 2*s); ctx.lineTo(cx + 9*s, cy + 7*s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(cx - 11*s, cy - 2*s); ctx.lineTo(cx, cy - 11*s); ctx.lineTo(cx + 11*s, cy - 2*s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (kind === 'city') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - 12*s, cy + 8*s); ctx.lineTo(cx - 12*s, cy);
      ctx.lineTo(cx - 4*s, cy); ctx.lineTo(cx - 4*s, cy - 5*s);
      ctx.lineTo(cx + 4*s, cy - 5*s); ctx.lineTo(cx + 4*s, cy - 1*s);
      ctx.lineTo(cx + 12*s, cy - 1*s); ctx.lineTo(cx + 12*s, cy + 8*s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(cx - 5*s, cy - 5*s); ctx.lineTo(cx, cy - 12*s); ctx.lineTo(cx + 5*s, cy - 5*s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (kind === 'knight') {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(cx, cy, 11*s, 0, PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = knight && knight.active ? '#FFD166' : '#F2EFE4';
      ctx.beginPath(); ctx.arc(cx, cy, 7*s, 0, PI * 2); ctx.fill();
      ctx.fillStyle = ink;
      ctx.font = `800 ${11*s}px Inter, system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(knight ? knight.rank : 1), cx, cy + s);
    }
    ctx.restore();
  }

  // ========= Harbors: visible docks on water + pier lines =========
  function drawHarbor(ctx, topo, harbor, renderer) {
    const e = topo.edges[harbor.edgeId];
    const va = topo.vertices[e.a], vb = topo.vertices[e.b];
    const pa = renderer.toScreen(va.x, va.y), pb = renderer.toScreen(vb.x, vb.y);
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
    // outward normal (away from the hex)
    const hex = topo.hexes[e.hexes[0]];
    const hp = renderer.toScreen(hex.x, hex.y);
    let nx = mx - hp.x, ny = my - hp.y;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;

    const dockDist = renderer.scale * 0.55;
    const hx = mx + nx * dockDist, hy = my + ny * dockDist;
    const size = renderer.scale * 0.28;

    // Pier lines from harbor to the two serviced vertices
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pb.x, pb.y); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.setLineDash([]);

    // Boat shape — simple hull
    const angle = Math.atan2(ny, nx);
    ctx.translate(hx, hy); ctx.rotate(angle + PI / 2);
    // hull
    ctx.fillStyle = '#8B5A3A';
    ctx.strokeStyle = '#3E2817'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-size, -size * 0.2);
    ctx.lineTo(-size * 0.7, size * 0.5);
    ctx.lineTo( size * 0.7, size * 0.5);
    ctx.lineTo( size, -size * 0.2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // sail
    ctx.fillStyle = '#F2EFE4';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.3);
    ctx.lineTo(0, -size * 1.1);
    ctx.lineTo(size * 0.6, -size * 0.3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // mast
    ctx.strokeStyle = '#3E2817';
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.1); ctx.lineTo(0, -size * 0.3); ctx.stroke();
    ctx.rotate(-(angle + PI / 2));

    // Trade rate label on sail (keep text upright regardless of boat orientation)
    const label = harbor.type === '3:1' ? '3:1' : `2:1`;
    ctx.fillStyle = '#1A1A1A';
    ctx.font = `800 ${Math.max(9, renderer.scale * 0.15)}px Inter, system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // place label slightly above the boat
    const labelDx = -ny * (size * 0.9);
    const labelDy =  nx * (size * 0.9);
    ctx.fillText(label, labelDx, labelDy);

    // Resource dot (for resource-specific harbors)
    if (harbor.type !== '3:1') {
      const dotR = Math.max(5, renderer.scale * 0.1);
      const col = {
        wood: '#4F8C3F', brick: '#C9603A', sheep: '#B9D96A',
        wheat: '#EBB03C', ore: '#9FA9B2',
      }[harbor.type] || '#999';
      const ddx = -ny * (size * 1.6), ddy = nx * (size * 1.6);
      ctx.fillStyle = col; ctx.strokeStyle = '#1A1A1A'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ddx, ddy, dotR, 0, PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // Color utils
  function shadeHex(hex, pct) {
    const n = parseInt(hex.replace('#', ''), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = pct / 100;
    r = Math.max(0, Math.min(255, Math.round(r + 255 * f)));
    g = Math.max(0, Math.min(255, Math.round(g + 255 * f)));
    b = Math.max(0, Math.min(255, Math.round(b + 255 * f)));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function lighten(hex, pct) { return shadeHex(hex, pct); }

  window.Render = { Renderer };
})();
