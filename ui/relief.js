/* 解压：撕烂废稿 / 卸压泡泡纸。纯前端，不读写作品数据。 */
(function (root) {
  'use strict';
  const MUTE = 'qianzhang:relief-mute', JUNK = ['然后', '突然', '他说', '不知道', '总之', '这一刻', '嘴角勾起', '算了', '重写', '卡文', '？？？', '凑字数', '再想想', '不对'];
  const WORRIES = ['然后呢', '这章怎么收', '读者会不会骂', '今天还没写够', '伏笔忘了', '数据好差', '又卡了', '主角好木', '编辑没回', '断更了', '想换书', '写得像流水账'];
  let ov = null, ac = null, raf = 0;
  const muted = () => localStorage.getItem(MUTE) === 'on';
  const audio = () => { if (muted()) return null; try { ac = ac || new (root.AudioContext || root.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; } catch (e) { return null; } };
  function tearSound(strength) {
    const a = audio(); if (!a) return; const n = Math.floor(a.sampleRate * 0.09), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2) * (Math.random() < 0.3 ? 1 : 0.35);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 2500; f.Q.value = 0.8;
    g.gain.value = Math.min(0.5, 0.12 + strength * 0.04); s.connect(f); f.connect(g); g.connect(a.destination); s.start();
  }
  function popSound() {
    const a = audio(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(700 + Math.random() * 300, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.12);
  }

  // —— 撕烂废稿：纸 = 一张离屏画布切成小格；拖过的格子脱落、旋转、下落 ——
  function paperMode(host) {
    const cv = document.createElement('canvas'); cv.className = 'rl-canvas'; host.appendChild(cv);
    const ctx = cv.getContext('2d'), dpr = root.devicePixelRatio || 1, W = host.clientWidth, H = host.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.scale(dpr, dpr);
    const T = 18, pw = Math.min(520, W - 60), ph = Math.min(680, H - 60), px = (W - pw) / 2, py = (H - ph) / 2, cols = Math.ceil(pw / T), rows = Math.ceil(ph / T);
    let sheet, cells, bits, last = null, torn = 0;
    function fresh() {
      sheet = document.createElement('canvas'); sheet.width = pw; sheet.height = ph; const s = sheet.getContext('2d');
      s.fillStyle = '#fbf7ee'; s.fillRect(0, 0, pw, ph); s.strokeStyle = 'rgba(80,110,160,.18)';
      for (let y = 56; y < ph; y += 26) { s.beginPath(); s.moveTo(20, y); s.lineTo(pw - 20, y); s.stroke(); }
      s.fillStyle = '#c0392b'; s.font = 'bold 22px serif'; s.fillText('废稿 · 第 ' + (1 + Math.floor(Math.random() * 999)) + ' 版', 24, 38);
      s.fillStyle = '#5a5550'; s.font = '15px serif';
      for (let y = 78; y < ph - 10; y += 26) { let line = ''; while (line.length < pw / 16) line += JUNK[Math.floor(Math.random() * JUNK.length)] + (Math.random() < 0.3 ? '，' : ''); s.fillText(line.slice(0, Math.floor((pw - 48) / 15)), 24, y); if (Math.random() < 0.25) { s.save(); s.strokeStyle = '#5a5550'; s.beginPath(); s.moveTo(24, y - 5); s.lineTo(24 + Math.random() * (pw - 60), y - 5); s.stroke(); s.restore(); } }
      cells = new Uint8Array(cols * rows); bits = []; torn = 0; host.dataset.torn = '0';
    }
    function rip(x, y) {
      const c = Math.floor((x - px) / T), r = Math.floor((y - py) / T); let n = 0;
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= cols || rr >= rows || cells[rr * cols + cc] || (Math.abs(dc) + Math.abs(dr) === 2 && Math.random() < 0.5)) continue;
        cells[rr * cols + cc] = 1; n++; bits.push({ sx:cc * T, sy:rr * T, x:px + cc * T, y:py + rr * T, vx:(Math.random() - 0.5) * 3, vy:-Math.random() * 2, a:0, va:(Math.random() - 0.5) * 0.3, life:1 });
        for (let k = 0; k < 2; k++) bits.push({ fiber:true, x:px + cc * T + T / 2, y:py + rr * T + T / 2, vx:(Math.random() - 0.5) * 4, vy:-Math.random() * 3, life:1 }); }
      if (n) { torn += n; host.dataset.torn = String(torn); tearSound(n); }
    }
    function drag(e) { const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      if (last) { const d = Math.hypot(x - last[0], y - last[1]), steps = Math.max(1, Math.ceil(d / (T / 2))); for (let i = 1; i <= steps; i++) rip(last[0] + (x - last[0]) * i / steps, last[1] + (y - last[1]) * i / steps); } else rip(x, y); last = [x, y]; }
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); last = null; drag(e); });
    cv.addEventListener('pointermove', e => { if (e.buttons) drag(e); });
    cv.addEventListener('pointerup', () => { last = null; });
    function frame() {
      ctx.clearRect(0, 0, W, H); ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 24; ctx.fillStyle = '#fbf7ee'; if (!torn) ctx.fillRect(px, py, pw, ph); ctx.restore();
      ctx.drawImage(sheet, px, py); if (torn) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (cells[r * cols + c]) ctx.clearRect(px + c * T, py + r * T, T, T);
      bits = bits.filter(b => b.life > 0 && b.y < H + 40);
      bits.forEach(b => { b.vy += 0.25; b.x += b.vx; b.y += b.vy;
        if (b.fiber) { b.life -= 0.03; ctx.fillStyle = 'rgba(240,232,215,' + b.life + ')'; ctx.fillRect(b.x, b.y, 2, 2); return; }
        b.a += b.va; b.life -= 0.004; ctx.save(); ctx.translate(b.x + T / 2, b.y + T / 2); ctx.rotate(b.a); ctx.globalAlpha = Math.max(0, b.life); ctx.drawImage(sheet, b.sx, b.sy, T, T, -T / 2, -T / 2, T, T); ctx.restore(); });
      raf = requestAnimationFrame(frame);
    }
    fresh(); frame(); return { fresh };
  }

  // —— 卸压泡泡纸 ——
  function bubbleMode(host) {
    const g = document.createElement('div'); g.className = 'rl-bubbles'; host.appendChild(g);
    function fresh() { g.innerHTML = ''; for (let i = 0; i < 30; i++) { const b = document.createElement('button'); b.className = 'rl-bub'; b.textContent = WORRIES[i % WORRIES.length]; b.setAttribute('aria-label', '戳破：' + b.textContent);
      b.onclick = () => { if (b.classList.contains('pop')) return; b.classList.add('pop'); popSound(); host.dataset.popped = String(g.querySelectorAll('.pop').length); }; g.appendChild(b); } host.dataset.popped = '0'; }
    fresh(); return { fresh };
  }

  function close() { if (!ov) return; cancelAnimationFrame(raf); ov.remove(); ov = null; document.removeEventListener('keydown', onKey, true); if (ov0) { try { ov0.focus(); } catch (e) {} } }
  let ov0 = null;
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
  function open(mode) {
    close(); ov0 = document.activeElement; mode = mode === 'bubble' ? 'bubble' : 'paper';
    ov = document.createElement('div'); ov.className = 'relief'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', '解压');
    ov.innerHTML = '<div class="rl-bar"><div class="seg"><button data-m="paper" class="' + (mode === 'paper' ? 'on' : '') + '">撕烂废稿</button><button data-m="bubble" class="' + (mode === 'bubble' ? 'on' : '') + '">卸压泡泡纸</button></div>'
      + '<span class="rl-tip">' + (mode === 'paper' ? '按住鼠标划过去，随便撕。' : '一个个戳破它们。') + '正文不会被改动。</span>'
      + '<button class="btn ghost sm" data-r="new">再来一张</button><button class="btn ghost sm" data-r="mute">' + (muted() ? '开声音' : '静音') + '</button><button class="btn primary sm" data-r="close">回去写（Esc）</button></div><div class="rl-stage"></div>';
    document.body.appendChild(ov); const stage = ov.querySelector('.rl-stage'); ov.dataset.mode = mode;
    const m = mode === 'paper' ? paperMode(stage) : bubbleMode(stage);
    ov.querySelector('[data-r=new]').onclick = () => m.fresh();
    ov.querySelector('[data-r=close]').onclick = close;
    ov.querySelector('[data-r=mute]').onclick = e => { localStorage.setItem(MUTE, muted() ? 'off' : 'on'); e.target.textContent = muted() ? '开声音' : '静音'; };
    ov.querySelectorAll('[data-m]').forEach(b => b.onclick = () => open(b.dataset.m));
    document.addEventListener('keydown', onKey, true); ov.querySelector('[data-r=close]').focus();
  }
  root.QZRelief = { open, close, WORRIES };
})(typeof window !== 'undefined' ? window : globalThis);
