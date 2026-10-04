/* =====================================================================
   タブラー学習機能：レッスン／練習（採点）／耳トレ
   index.html の後に読み込む（E, tabla, boot, Player, TAALS などを利用）
   ===================================================================== */
(function () {
  'use strict';

  // ---------- 保存（使えない環境でも動くように） ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };

  // ---------- 判定用：ボル → 打ち方の組み合わせ ----------
  // テとラはどちらも「右手の閉じた音」として同じ扱い、ゲー↑もゲーと同じ扱い
  const NORM = { ra: 'te', ghe: 'ge', ta: 'na' }; // ター（開放）もナーのキーでOK
  const partsOf = key => (IM.BOLS[key] ? IM.BOLS[key].parts : []).map(p => p.replace('+', '')).map(p => NORM[p] || p);
  const STROKE_JA = { na: 'ナー（右手・縁）', tin: 'ティン（右手・中間）', tun: 'トゥン（右手・中央）', te: 'テ／ラ（右手・閉じた音）',
    ge: 'ゲー（左手）', ke: 'ケ（左手・閉じた音）', clap: '手拍子', wave: '手を振る', any: '打音' };
  const JUDGE = {
    perfect: ['ぴったり！', 1], good: ['よい', .85], ok: ['ずれ', .6], partial: ['片手だけ', .4], wrong: ['音違い', 0], miss: ['抜け', 0]
  };
  const starsOf = acc => acc >= 90 ? 3 : acc >= 75 ? 2 : acc >= 60 ? 1 : 0;
  const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);

  // 数えるだけの「練習用ターラ」（4拍ずつ区切る）
  function countTaal(n) {
    const vib = []; let r = n;
    while (r > 0) { vib.push(Math.min(4, r)); r -= 4; }
    let acc = 0;
    return { name: `練習（${n}拍）`, beats: n, vib, marks: vib.map(v => { const m = String(acc + 1); acc += v; return m; }) };
  }
  function normEx(ex) {
    const beats = typeof ex.beats === 'string' ? W(ex.beats) : ex.beats;
    return Object.assign({ cycles: 1, expect: 'bols' }, ex, { beats, taal: ex.taal || countTaal(beats.length) });
  }

  // =====================================================================
  // マイク（タイミングだけを判定。机を指で叩く／本物のタブラーで）
  // =====================================================================
  const Mic = {
    sens: .03,
    async enable() {
      if (this.proc) return true;
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (e) {
        alert('マイクが使えませんでした。ブラウザの許可設定を確認してください。');
        return false;
      }
      const ctx = E.ensure();
      const src = ctx.createMediaStreamSource(this.stream);
      const proc = this.proc = ctx.createScriptProcessor(512, 1, 1);
      const mute = ctx.createGain(); mute.gain.value = 0;
      src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      let floor = .002, last = -1, prev = 0;
      proc.onaudioprocess = e => {
        const x = e.inputBuffer.getChannelData(0), sr = ctx.sampleRate;
        const base = e.playbackTime - 2 * 512 / sr;
        for (let i = 0; i + 64 <= x.length; i += 64) {
          let s = 0; for (let j = 0; j < 64; j++) s += x[i + j] * x[i + j];
          const rms = Math.sqrt(s / 64), t = base + i / sr, thr = Math.max(this.sens, floor * 5);
          if (rms > thr && prev <= thr && t - last > .07) {
            last = t;
            if (Practice.active && Practice.inputMode === 'mic') { Practice.input(['any'], t, true); flashPad('mic'); }
          }
          floor = floor * .995 + Math.min(rms, thr) * .005; prev = rms;
        }
      };
      return true;
    }
  };

  // =====================================================================
  // 練習（採点）エンジン
  // =====================================================================
  const Practice = {
    active: false, ex: null, bpm: 60, guide: 'on', inputMode: 'keys',
    selfSound: store.get('tablaSelfSound', true), offset: store.get('tablaLatOffset', 0),
    onDone: null, lessonBpm: null,

    start() {
      const ex = this.ex; if (!ex) return;
      boot(); Player.stop(true); this.stop(true);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const ctx = E.ctx, spb = 60 / this.bpm, taal = ex.taal;
      const t0 = ctx.currentTime + .35;
      for (let i = 0; i < 4; i++) tabla.tick(t0 + i * spb, i === 0);
      const start = this.start0 = t0 + 4 * spb;
      this.spb = spb;
      this.events = []; this.beatTimes = []; this.inputs = []; this.judged = 0;
      const N = ex.beats.length, marks = beatMarks(taal);
      for (let c = 0; c < ex.cycles; c++) {
        for (let b = 0; b < N; b++) {
          const bt = start + (c * N + b) * spb, beat = ex.beats[b], n = Math.max(1, beat.length);
          this.beatTimes.push({ t: bt, b, c });
          beat.forEach((tok, k) => {
            const tt = bt + k * spb / n;
            if (!tok.key || !IM.BOLS[tok.key]) return;
            if (ex.expect === 'bols') {
              this.events.push({ t: tt, parts: partsOf(tok.key), key: tok.key, disp: tok.disp, b, k, c });
              if (this.guide !== 'off') tabla.bol(tok.key, tt, this.guide === 'soft' ? .28 : .9);
            } else tabla.bol(tok.key, tt, k === 0 && b % taal.beats === 0 ? 1 : .8); // 伴奏としてのテーカ
          });
          const pos = b % taal.beats, m = marks[pos];
          if (ex.expect === 'claps' && m) {
            const wave = markType(m) === 'khali' || m === 'X/0';
            this.events.push({ t: bt, parts: [wave ? 'wave' : 'clap'], b, k: 0, c, clap: true });
          }
          if (ex.expect === 'sam' && pos === 0) this.events.push({ t: bt, parts: ['clap'], b, k: 0, c, clap: true });
        }
      }
      this.events.sort((a, b) => a.t - b.t);
      this.events.forEach((e, i, a) => {
        const gp = i > 0 ? e.t - a[i - 1].t : 1, gn = i < a.length - 1 ? a[i + 1].t - e.t : 1;
        e.w = Math.min(.13, .48 * Math.min(gp || 1, gn || 1));
      });
      this.endT = start + ex.cycles * N * spb + .35;
      this.active = true; this.lastBeat = -1; this.lastCycle = -1;
      drawWheel(taal); $('#grid').innerHTML = '';
      $('#nowSec').textContent = '🎯 練習中：' + ex.title;
      $('#nowDesc').textContent = ex.blind ? '目を閉じて、耳だけでサムを感じよう' : 'カウント4つのあとに始まります';
      pb.res.innerHTML = ''; pb.judge.textContent = '';
      renderGrid(); renderPads();
      pb.start.disabled = true;
      const loop = () => { if (!this.active) return; this.tick(); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    },

    stop(silent) {
      const was = this.active;
      this.active = false; cancelAnimationFrame(this.raf);
      if (pb) { pb.start.disabled = false; pb.count.textContent = ''; }
      if (was && !silent) { pb.judge.textContent = '中断しました'; $('#nowSec').textContent = '停止中'; }
    },

    input(parts, t, raw) {
      if (!this.active) return;
      const ctx = E.ctx;
      let tt = t == null ? ctx.currentTime : t;
      if (!raw) tt -= (ctx.outputLatency || ctx.baseLatency || 0);
      tt -= this.offset / 1000;
      parts.forEach(s => this.inputs.push({ s, t: tt, used: false }));
    },

    tick() {
      const now = E.ctx.currentTime, ex = this.ex;
      // カウントイン表示
      if (now < this.start0) pb.count.textContent = Math.max(1, Math.ceil((this.start0 - now) / this.spb - .001));
      else pb.count.textContent = '';
      // 現在の拍
      let bi = -1;
      for (let i = 0; i < this.beatTimes.length; i++) if (this.beatTimes[i].t <= now) bi = i; else break;
      if (bi !== this.lastBeat && bi >= 0) {
        this.lastBeat = bi;
        const bt = this.beatTimes[bi];
        if (bt.c !== this.lastCycle) { this.lastCycle = bt.c; clearGridMarks(); }
        if (!ex.blind) { wheelBeat(bt.b % ex.taal.beats); highlightBeat(bt.b); }
      }
      // 判定（各音の受付時間が過ぎたら確定）
      while (this.judged < this.events.length && now > this.events[this.judged].t + this.events[this.judged].w + .03) {
        this.judge(this.events[this.judged++]);
      }
      if (now > this.endT) this.finish();
    },

    judge(e) {
      const cands = this.inputs.filter(x => !x.used && Math.abs(x.t - e.t) <= e.w);
      const timingOnly = this.inputMode === 'mic';
      let res, off = null;
      if (timingOnly) {
        if (cands.length) {
          cands.sort((a, b) => Math.abs(a.t - e.t) - Math.abs(b.t - e.t));
          cands[0].used = true; off = cands[0].t - e.t;
        }
      } else {
        const found = [], missing = [];
        for (const p of e.parts) {
          const c = cands.filter(x => !x.used && x.s === p).sort((a, b) => Math.abs(a.t - e.t) - Math.abs(b.t - e.t))[0];
          if (c) { c.used = true; found.push(c); } else missing.push(p);
        }
        if (!missing.length) off = found.reduce((s, c) => s + c.t - e.t, 0) / found.length;
        else if (found.length) { res = 'partial'; e.missing = missing; }
        else if (cands.length) { res = 'wrong'; e.got = [...new Set(cands.map(c => c.s))]; }
        else res = 'miss';
      }
      if (off != null) { const a = Math.abs(off); res = a <= .045 ? 'perfect' : a <= .09 ? 'good' : 'ok'; }
      else if (!res) res = 'miss';
      e.res = res; e.off = off;
      markToken(e);
      pb.judge.textContent = JUDGE[res][0] + (off != null && res !== 'perfect' ? (off > 0 ? '（遅い）' : '（早い）') : '');
      pb.judge.style.color = { perfect: '#7fe3a0', good: '#b6e37f', ok: '#e3d27f', partial: '#f0a868', wrong: '#ff7b7b', miss: '#ff7b7b' }[res];
    },

    finish() {
      this.stop(true);
      $('#nowSec').textContent = '練習おわり'; $('#nowDesc').textContent = '結果は下に表示されています';
      const evs = this.events, n = evs.length || 1;
      const score = evs.reduce((s, e) => s + JUDGE[e.res][1], 0);
      const acc = Math.round(score / n * 100);
      const cnt = {}; evs.forEach(e => cnt[e.res] = (cnt[e.res] || 0) + 1);
      const offs = evs.filter(e => e.off != null).map(e => e.off);
      const mean = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
      const sd = offs.length > 1 ? Math.sqrt(offs.reduce((a, b) => a + (b - mean) ** 2, 0) / offs.length) : 0;
      const tempoOk = !this.lessonBpm || this.bpm >= this.lessonBpm * .9;
      const stars = tempoOk ? starsOf(acc) : 0;
      // アドバイス
      const tips = [];
      if (acc >= 95) tips.push('すばらしい！ 次は「お手本音」を「小さく」→「なし」にして、自分の力だけで挑戦してみよう。');
      const miss = (cnt.miss || 0) / n;
      if (miss > .3) tips.push('抜けた音が多めです。テンポを10〜20下げ、ボルを口で唱えながら叩いてみよう。');
      const missTally = {}; evs.filter(e => e.missing).forEach(e => e.missing.forEach(p => missTally[p] = (missTally[p] || 0) + 1));
      if ((missTally.ge || 0) >= 2) tips.push(`ダー／ディンで<b>左手（ゲー）</b>が${missTally.ge}回抜けています。右手と左手を「同時に」押す意識で（キーなら S と J を一緒に、または G）。`);
      for (const [p, c] of Object.entries(missTally)) if (p !== 'ge' && c >= 2) tips.push(`<b>${STROKE_JA[p]}</b>が${c}回足りませんでした。`);
      const wrong = {}; evs.filter(e => e.res === 'wrong').forEach(e => { const k = e.parts.join('+') + '→' + e.got.join('+'); wrong[k] = (wrong[k] || 0) + 1; });
      const topWrong = Object.entries(wrong).sort((a, b) => b[1] - a[1])[0];
      if (topWrong && topWrong[1] >= 2) {
        const [exp, got] = topWrong[0].split('→');
        tips.push(`<b>${exp.split('+').map(p => STROKE_JA[p]).join('＋')}</b>のところで<b>${got.split('+').map(p => STROKE_JA[p]).join('＋')}</b>を叩いていることが多いです（${topWrong[1]}回）。`);
      }
      if (offs.length >= 4 && mean > .035) tips.push(`全体的に少し<b>遅れ気味</b>です（平均 +${Math.round(mean * 1000)}ms）。音を待たずに、拍の頭で叩くイメージで。`);
      if (offs.length >= 4 && mean < -.035) tips.push(`全体的に<b>走り気味（早い）</b>です（平均 ${Math.round(mean * 1000)}ms）。落ち着いて、拍を感じてから。`);
      if (offs.length >= 4 && sd > .05) tips.push('タイミングのばらつきが大きめです。手拍子や足踏みで拍を感じながら練習すると安定します。');
      if (!tempoOk) tips.push(`合格にはテンポ${Math.ceil(this.lessonBpm * .9)}以上が必要です。慣れたらテンポを上げて再挑戦しよう。`);
      const cal = offs.length >= 6 && Math.abs(mean) > .02;
      pb.res.innerHTML = `<div class="res">
        <div class="row"><div><div class="small">正確さ</div><div class="big">${acc}%</div></div>
        <div><div class="small">評価</div><div class="stars">${starStr(stars)}</div></div>
        <div class="small">平均のずれ：${offs.length ? (mean >= 0 ? '+' : '') + Math.round(mean * 1000) + 'ms' : '–'}<br>ばらつき：${offs.length > 1 ? Math.round(sd * 1000) + 'ms' : '–'}</div></div>
        <div class="cnts">${Object.keys(JUDGE).filter(k => cnt[k]).map(k => `<span class="j-${k}">${JUDGE[k][0]} ${cnt[k]}</span>`).join('')}</div>
        ${tips.length ? '<ul class="steps">' + tips.map(t => `<li>${t}</li>`).join('') + '</ul>' : ''}
        ${cal ? `<button class="sec" id="pCal">⚙ 平均のずれ（${Math.round(mean * 1000)}ms）を「機器の遅れ」として補正する</button><div class="small">いつも同じ方向にずれる場合、スピーカーやBluetoothの遅れが原因のことがあります。</div>` : ''}
      </div>`;
      const calBtn = document.getElementById('pCal');
      if (calBtn) calBtn.onclick = () => {
        this.offset = Math.round(this.offset + mean * 1000); store.set('tablaLatOffset', this.offset);
        pb.off.value = this.offset; pb.offV.textContent = this.offset + 'ms';
        calBtn.textContent = `補正しました（${this.offset}ms）`; calBtn.disabled = true;
      };
      if (this.onDone) this.onDone({ acc, stars });
    }
  };
  window.Practice = Practice;

  // 鍵盤・太鼓・ボタンからの入力を受け取る（index.html の playBol から呼ばれる）
  window.PracticeHook = key => {
    flashPad(key);
    if (!Practice.active || Practice.ex.expect !== 'bols' || Practice.inputMode !== 'keys') return false;
    Practice.input(partsOf(key));
    return !Practice.selfSound;
  };
  document.addEventListener('keydown', e => {
    if (!Practice.active || e.repeat) return;
    const ex = Practice.ex;
    if (ex.expect === 'bols') return;
    if (e.code === 'Space' || e.key.toLowerCase() === 'w') {
      e.preventDefault();
      const p = e.code === 'Space' ? 'clap' : 'wave';
      clapInput(p);
    }
  });
  function clapInput(p) {
    if (Practice.inputMode === 'keys') Practice.input([p]);
    if (p === 'clap' && Practice.selfSound) tabla.clap(E.ctx.currentTime + .003, .9);
    flashPad(p);
  }

  // =====================================================================
  // 練習パネル（1つだけ作り、レッスン画面と練習タブの間で付け替える）
  // =====================================================================
  let pb = null;
  function buildPBox() {
    const box = document.createElement('div'); box.className = 'pbox';
    box.innerHTML = `
      <div><b id="pTitle" style="font-size:1rem"></b> <span class="small" id="pDesc"></span></div>
      <div class="row" style="margin-top:6px">
        <label class="ctl">テンポ <span><input type="range" id="pBpm" min="30" max="200"> <b id="pBpmV"></b></span></label>
        <label class="ctl">お手本音 <select id="pGuide"><option value="on">あり</option><option value="soft">小さく</option><option value="off">なし（実力テスト）</option></select></label>
        <label class="ctl">入力 <select id="pInput"><option value="keys">キーボード／タッチ（音の種類も判定）</option><option value="mic">マイク（タイミングだけ判定）</option></select></label>
        <label class="chk"><input type="checkbox" id="pSelf">自分の音を鳴らす</label>
      </div>
      <details style="margin-top:4px"><summary class="small" style="cursor:pointer">詳細設定（ずれ補正・マイク感度）</summary>
        <div class="row" style="margin-top:6px">
          <label class="ctl">判定のずれ補正 <span><input type="range" id="pOff" min="-200" max="200" step="5"> <b id="pOffV"></b></span></label>
          <label class="ctl">マイク感度（右ほど敏感） <input type="range" id="pSens" min="1" max="100" value="70"></label>
        </div>
        <p class="small">マイク入力のときは、お手本の音を拾わないようイヤホン推奨（または「お手本音：なし」）。机を指で叩いても、本物のタブラーでもOK。</p>
      </details>
      <div class="row" style="margin-top:8px">
        <button id="pStart">▶ スタート（採点）</button>
        <button class="sec" id="pListen">🔊 お手本を聴く</button>
        <button class="stop" id="pStop">■ やめる</button>
      </div>
      <div class="pcount" id="pCount"></div>
      <div class="judge" id="pJudge"></div>
      <div class="pgrid" id="pGrid"></div>
      <div class="small" id="pKeys"></div>
      <div class="pads" id="pPads"></div>
      <div id="pRes"></div>`;
    const q = s => box.querySelector(s);
    pb = { box, title: q('#pTitle'), desc: q('#pDesc'), bpm: q('#pBpm'), bpmV: q('#pBpmV'), guide: q('#pGuide'), input: q('#pInput'),
      self: q('#pSelf'), off: q('#pOff'), offV: q('#pOffV'), sens: q('#pSens'), start: q('#pStart'), listen: q('#pListen'), stop: q('#pStop'),
      count: q('#pCount'), judge: q('#pJudge'), grid: q('#pGrid'), keys: q('#pKeys'), pads: q('#pPads'), res: q('#pRes') };
    pb.bpm.oninput = () => { Practice.bpm = +pb.bpm.value; pb.bpmV.textContent = pb.bpm.value; };
    pb.guide.onchange = () => { Practice.guide = pb.guide.value; };
    pb.input.onchange = async () => {
      Practice.inputMode = pb.input.value;
      if (pb.input.value === 'mic') {
        boot();
        const ok = await Mic.enable();
        if (!ok) { pb.input.value = 'keys'; Practice.inputMode = 'keys'; }
        else if (Practice.guide === 'on') { pb.guide.value = 'soft'; Practice.guide = 'soft'; }
      }
      renderPads();
    };
    pb.self.checked = Practice.selfSound;
    pb.self.onchange = () => { Practice.selfSound = pb.self.checked; store.set('tablaSelfSound', pb.self.checked); };
    pb.off.value = Practice.offset; pb.offV.textContent = Practice.offset + 'ms';
    pb.off.oninput = () => { Practice.offset = +pb.off.value; pb.offV.textContent = pb.off.value + 'ms'; store.set('tablaLatOffset', Practice.offset); };
    pb.sens.oninput = () => { Mic.sens = .2 * Math.pow(.02, pb.sens.value / 100); };
    pb.sens.oninput();
    pb.start.onclick = () => Practice.start();
    pb.stop.onclick = () => Practice.stop();
    pb.listen.onclick = () => {
      const ex = Practice.ex; if (!ex) return;
      Practice.stop(true);
      Player.start({ taal: ex.taal, segments: [{ title: '🔊 お手本：' + ex.title, desc: 'よく聴いて、口でボルを唱えてみよう', bpm: Practice.bpm, beats: ex.beats }] });
    };
    return box;
  }

  function setExercise(ex, opts) {
    opts = opts || {};
    if (!pb) buildPBox();
    Practice.stop(true);
    Practice.ex = normEx(ex);
    Practice.onDone = opts.onDone || null;
    Practice.lessonBpm = opts.lesson ? Practice.ex.bpm : null;
    Practice.bpm = Practice.ex.bpm;
    pb.bpm.value = Practice.ex.bpm; pb.bpmV.textContent = Practice.ex.bpm;
    pb.title.textContent = Practice.ex.title;
    pb.desc.textContent = { bols: '音の種類とタイミングを採点', claps: '手拍子（ターリー）と手振り（カーリー）を採点', sam: 'サムだけを採点（拍の表示なし）' }[Practice.ex.expect];
    pb.listen.style.display = Practice.ex.expect === 'bols' ? '' : 'none';
    pb.res.innerHTML = ''; pb.judge.textContent = ''; pb.count.textContent = '';
    renderGrid(); renderPads();
    return pb.box;
  }

  function renderGrid() {
    const ex = Practice.ex, taal = ex.taal, marks = beatMarks(taal);
    pb.grid.classList.toggle('blind', !!ex.blind);
    pb.grid.innerHTML = ex.beats.map((beat, b) => {
      const pos = b % taal.beats, m = marks[pos];
      let toks = beat.map((t, k) => `<span id="pt-${b}-${k}" class="${t.key ? '' : 'rest'}">${t.disp}</span>`).join('');
      let clap = '';
      if (ex.expect === 'claps' && m) clap = `<span id="pc-${b}">${markType(m) === 'khali' || m === 'X/0' ? '👋' : '👏'}</span>`;
      if (ex.expect === 'sam' && pos === 0) clap = `<span id="pc-${b}">👏</span>`;
      return `<div class="pb" id="pbb-${b}"><div class="mk ${m ? markType(m) : ''}">${clap || m || ''}</div><div class="tk">${toks}</div><div class="no">${pos + 1}</div></div>`;
    }).join('');
  }
  function clearGridMarks() {
    pb.grid.querySelectorAll('[class*="j-"]').forEach(el => el.className = el.className.replace(/\bj-\w+/g, '').trim());
  }
  function highlightBeat(b) {
    pb.grid.querySelectorAll('.pb.cur').forEach(x => x.classList.remove('cur'));
    const el = document.getElementById('pbb-' + b); if (el) el.classList.add('cur');
  }
  function markToken(e) {
    const el = document.getElementById(e.clap ? 'pc-' + e.b : `pt-${e.b}-${e.k}`);
    if (el) { el.className = el.className.replace(/\bj-\w+/g, '').trim(); el.classList.add('j-' + e.res); }
  }

  const PADS = [
    { key: 'Ge', lbl: 'ゲー', kb: 'S', cls: 'left' }, { key: 'Ke', lbl: 'ケ', kb: 'A', cls: 'left' },
    { key: 'Na', lbl: 'ナー', kb: 'J' }, { key: 'Tin', lbl: 'ティン', kb: 'K' }, { key: 'Tun', lbl: 'トゥン', kb: 'L' },
    { key: 'Te', lbl: 'テ', kb: 'U' }, { key: 'Ra', lbl: 'ラ', kb: 'I' },
    { key: 'Dha', lbl: 'ダー', kb: 'G', cls: 'both' }, { key: 'Dhin', lbl: 'ディン', kb: 'H', cls: 'both' },
    { key: 'Kra', lbl: 'クラ', kb: 'T', cls: 'both', opt: true }, { key: 'Dhet', lbl: 'デット', kb: '', cls: 'both', opt: true }
  ];
  function renderPads() {
    const ex = Practice.ex; if (!ex) return;
    pb.pads.innerHTML = '';
    const mk = (label, sub, cls, data, on) => {
      const b = document.createElement('button'); b.className = 'pad ' + (cls || ''); b.dataset.p = data;
      b.innerHTML = `${label}<small>${sub}</small>`;
      b.addEventListener('pointerdown', ev => { ev.preventDefault(); boot(); on(); });
      pb.pads.appendChild(b); return b;
    };
    if (Practice.inputMode === 'mic') {
      pb.keys.innerHTML = '🎤 マイクに向かって叩いてください（机を指で叩いてもOK）。音の種類は判定せず、タイミングだけを見ます。';
      mk('🎤', '叩くと光ります', 'both', 'mic', () => { });
      return;
    }
    if (ex.expect === 'bols') {
      const used = new Set(), usedBols = new Set();
      const keyList = [];
      ex.beats.flat().forEach(t => { if (t.key && IM.BOLS[t.key]) { usedBols.add(t.key); partsOf(t.key).forEach(p => used.add(p)); } });
      PADS.forEach(p => {
        if (p.opt && !usedBols.has(p.key)) return;
        const pp = partsOf(p.key);
        const relevant = pp.length > 1 ? usedBols.has(p.key) : pp.every(x => used.has(x));
        mk(p.lbl, `${p.key}${p.kb ? '・' + p.kb : ''}`, p.cls + (relevant ? '' : ' dim'), p.key, () => playBol(p.key));
        if (relevant && p.kb) keyList.push(`${p.lbl}=<kbd>${p.kb}</kbd>`);
      });
      pb.keys.innerHTML = 'キーボード：' + keyList.join(' ') + '　💡 ダーは S と J を同時に（または G）。ティラキタは U I A U。';
    } else {
      mk('👏', 'ターリー／サム（Space）', 'both', 'clap', () => clapInput('clap'));
      if (ex.expect === 'claps') mk('👋', 'カーリー＝手を振る（W）', 'left', 'wave', () => clapInput('wave'));
      pb.keys.innerHTML = ex.expect === 'claps' ? '👏 は Space、👋 は W キーでもOK。' : 'サム（周期の1拍目）が来たら 👏（Space）。';
    }
  }
  function flashPad(key) {
    if (!pb) return;
    pb.pads.querySelectorAll(`[data-p="${key}"]`).forEach(b => { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 110); });
  }

  // =====================================================================
  // 耳トレ・クイズ
  // =====================================================================
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (pool, n, must) => shuffle([must, ...shuffle(pool.filter(x => x !== must)).slice(0, n - 1)]);
  function stopAll() { Player.stop(true); Practice.stop(true); }
  function playTheka(taal) {
    boot(); stopAll();
    const spb = 60 / Math.min(taal.bpm, 110), t0 = E.ctx.currentTime + .1, beats = thekaBeats(taal, 1);
    beats.forEach((beat, b) => beat.forEach((tok, k) => { if (tok.key && IM.BOLS[tok.key]) tabla.bol(tok.key, t0 + (b + k / beat.length) * spb, b === 0 && k === 0 ? 1.05 : .85); }));
    const last = beats[0][0]; if (last.key) tabla.bol(last.key, t0 + beats.length * spb, 1.1);
  }
  function playPhrase(words, bpm) {
    boot(); stopAll();
    const spb = 60 / bpm, t0 = E.ctx.currentTime + .1;
    for (let i = 0; i < 4; i++) tabla.tick(t0 + i * spb, i === 0);
    words.forEach((w, b) => { const toks = IM.parseWord(w); toks.forEach((tok, k) => { if (tok.key && IM.BOLS[tok.key]) tabla.bol(tok.key, t0 + (4 + b + k / toks.length) * spb, k ? .85 : 1); }); });
  }
  const DICT_WORDS = ['Dha', 'Dhin', 'Na', 'Tin', 'DhaGe', 'TinNa', 'TiRaKiTa', 'DhaDha', 'S', 'NaNa'];
  const QUIZ = {
    'bol-basic': { title: 'ボル当て（基本）', desc: '鳴った音はどのボル？', pool: ['Na', 'Tin', 'Tun', 'Te', 'Ge', 'Ke', 'Dha', 'Dhin'] },
    'bol-adv': { title: 'ボル当て（応用）', desc: '似た音も混ざります', pool: ['Na', 'Tin', 'Tun', 'Te', 'Ge', 'Ghe', 'Ke', 'Dha', 'Dhin', 'Dhet', 'Kra'] },
    'taal': { title: 'ターラ当て', desc: 'テーカを1周聴いて、どのターラか当てよう（最後の音はサム）' },
    'dict': { title: 'リズム聞き取り', desc: 'カウント4つのあとの4拍を聴いて、正しい譜を選ぼう' }
  };
  function genQ(kind) {
    if (kind.startsWith('bol')) {
      const pool = QUIZ[kind].pool, ans = pool[(Math.random() * pool.length) | 0];
      return { ans, opts: pick(pool, 4, ans), label: k => `${k}<small>${IM.BOLS[k].kana}</small>`,
        play: k => { boot(); stopAll(); tabla.bol(k, E.ctx.currentTime + .05, .95); } };
    }
    if (kind === 'taal') {
      const keys = Object.keys(TAALS), ans = keys[(Math.random() * keys.length) | 0];
      return { ans, opts: pick(keys, 4, ans), label: k => `${TAALS[k].name}<small>${TAALS[k].vib.join('+')}</small>`, play: k => playTheka(TAALS[k]) };
    }
    // dict
    const words = [DICT_WORDS[(Math.random() * 8) | 0]];
    for (let i = 1; i < 4; i++) words.push(DICT_WORDS[(Math.random() * DICT_WORDS.length) | 0]);
    const key = w => w.join(' '), opts = [key(words)];
    let guard = 0;
    while (opts.length < 3 && guard++ < 50) {
      const v = words.slice(), i = (Math.random() * 4) | 0;
      v[i] = DICT_WORDS[(Math.random() * DICT_WORDS.length) | 0];
      if (i === 0 && v[0] === 'S') continue;
      if (!opts.includes(key(v))) opts.push(key(v));
    }
    return { ans: key(words), opts: shuffle(opts), label: k => k.split(' ').map(w => w === 'S' ? 'ऽ' : w).join(' ｜ '), play: k => playPhrase(k.split(' '), 72) };
  }
  function runQuiz(container, kind, n, onDone) {
    let qi = 0, score = 0, q = null, answered = false;
    const next = () => {
      if (qi >= n) {
        const acc = Math.round(score / n * 100), stars = starsOf(acc);
        container.innerHTML = `<div class="res"><div class="small">${QUIZ[kind].title} の結果</div><div class="big">${score} / ${n}</div><div class="stars">${starStr(stars)}</div>
          <p class="small">${stars >= 1 ? '合格！' : 'もう少し。「▶ もう一度聴く」や、答えのあと選択肢を押して聴き比べると耳が育ちます。'}</p>
          <button id="qAgain">もう一度</button></div>`;
        container.querySelector('#qAgain').onclick = () => runQuiz(container, kind, n, onDone);
        if (onDone) onDone({ acc, stars });
        return;
      }
      q = genQ(kind); answered = false;
      container.innerHTML = `<div class="small">${QUIZ[kind].desc}</div>
        <div class="prog"><i style="width:${qi / n * 100}%"></i></div>
        <div class="row"><b>第${qi + 1}問 / ${n}</b><button id="qPlay">▶ もう一度聴く</button></div>
        <div class="qopts" style="${kind === 'dict' ? 'grid-template-columns:repeat(auto-fill,minmax(260px,1fr))' : ''}">${q.opts.map((o, i) => `<button class="qopt" data-i="${i}">${q.label(o)}</button>`).join('')}</div>
        <div id="qFb" class="small"></div>`;
      container.querySelector('#qPlay').onclick = () => q.play(q.ans);
      container.querySelectorAll('.qopt').forEach(b => b.onclick = () => {
        const o = q.opts[+b.dataset.i];
        if (answered) { q.play(o); return; } // 答えたあとは聴き比べ
        answered = true;
        const ok = o === q.ans; if (ok) score++;
        container.querySelectorAll('.qopt').forEach(x => { const xo = q.opts[+x.dataset.i]; if (xo === q.ans) x.classList.add('ok'); else if (x === b) x.classList.add('ng'); });
        const fb = container.querySelector('#qFb');
        fb.innerHTML = `${ok ? '⭕ 正解！' : '❌ ざんねん。正解は緑のボタン。'}　選択肢を押すと、それぞれの音を聴き比べられます。 <button id="qNext">次へ ▶</button>`;
        fb.querySelector('#qNext').onclick = () => { qi++; next(); };
      });
      setTimeout(() => q.play(q.ans), 250);
    };
    next();
  }

  // =====================================================================
  // レッスンのデータ
  // =====================================================================
  const T = TAALS;
  const LESSONS = [
    { unit: 'ステップ1：タブラーの音を知る', id: 'na', title: 'ナー（Na）― 右手のキラッとした音',
      steps: ['上の太鼓の絵で、右の太鼓（ダーヤーン）の<b>縁（ナー）</b>をクリックして音を聴こう。', '「🔊 お手本を聴く」で練習フレーズを聴き、<b>「ナー・ウン・ナー・ウン」</b>と口で唱えてみよう（ऽ は休み）。', '「▶ スタート」→ カウント4つのあと、ナーのところで <kbd>J</kbd>（または画面の「ナー」ボタン）を押そう。'],
      tip: 'タブラーの世界では、まず口で唱えられること（パダント）が大切。唱えられるリズムは叩けます。',
      ex: { title: 'ナーの練習', beats: 'Na S Na S Na Na Na S', bpm: 60, cycles: 2 } },
    { unit: 'ステップ1：タブラーの音を知る', id: 'tin', title: 'ティン（Tin）― よく響く音',
      steps: ['絵の<b>中間（ティン）</b>をクリック。ナーより丸く、太鼓の「音程」がよく聞こえます。', 'ナー（キラッ）とティン（ポーン）の違いを聴き比べよう。', 'ナー＝<kbd>J</kbd>、ティン＝<kbd>K</kbd> で練習。'],
      tip: '実際のタブラーでは、ティンは人差し指で打ってすぐ離す「開放音」。', ex: { title: 'ナーとティン', beats: 'Tin S Tin S Na S Tin S Na Tin Na Tin Na Na Tin S', bpm: 60 } },
    { unit: 'ステップ1：タブラーの音を知る', id: 'te', title: 'テ（Te）― 響かない「閉じた音」',
      steps: ['絵の<b>黒い円（テ）</b>をクリック。すぐ止まる短い音です。', 'タブラーは<b>響く音（開放）</b>と<b>止める音（閉じた音）</b>の組み合わせで表情を作ります。', 'テ＝<kbd>U</kbd>。'],
      tip: '開放と閉じた音のコントラストを耳で意識しよう。', ex: { title: '開く音と閉じる音', beats: 'Te S Te S Na Te Na Te Tin S Te Te Na S S S', bpm: 60 } },
    { unit: 'ステップ1：タブラーの音を知る', id: 'ge', title: 'ゲー（Ge）とケ（Ke）― 左手の低音',
      steps: ['左の大きな太鼓（バーヤーン）をクリック → 深い<b>ゲー</b>。黒い部分 → 止める<b>ケ</b>。', 'ゲーを押したまま右へドラッグすると音程が上がります（本物は手首で押す）。', 'ゲー＝<kbd>S</kbd>、ケ＝<kbd>A</kbd>。'],
      tip: 'ゲーの「ウォン」という表情はタブラーらしさの源。', ex: { title: '左手の練習', beats: 'Ge S Ge S Ke S Ke S Ge Ge Ke S Ge S Ke S', bpm: 60 } },
    { unit: 'ステップ1：タブラーの音を知る', id: 'dha', title: 'ダー（Dha）＝ナー＋ゲー ― 両手で',
      steps: ['<b>ダー</b>は右手のナーと左手のゲーを<b>同時に</b>。最も大切なボル。', 'キーボードなら <kbd>S</kbd> と <kbd>J</kbd> を一緒に押す（または <kbd>G</kbd>）。スマホなら2本の指で「ゲー」「ナー」を同時に、または「ダー」ボタン。', '左手が遅れると「片手だけ」と判定されます。'],
      tip: 'ダーとナーの違い ＝ 左手の低音があるかないか。この違いがあとで「カーリー」の理解につながります。',
      ex: { title: 'ダーとナー', beats: 'Dha S Dha S Na S Dha S Dha Na Dha Na Dha Dha Na S', bpm: 60 } },
    { unit: 'ステップ1：タブラーの音を知る', id: 'dhin', title: 'ディン（Dhin）＝ティン＋ゲー',
      steps: ['<b>ディン</b>は ティン＋ゲー。ダーより丸く豊かな響き。', 'キーなら <kbd>S</kbd>＋<kbd>K</kbd>（または <kbd>H</kbd>）。', '最後の行「ダー・ディン・ディン・ダー」は、次のステップで学ぶティーンタールの形！'],
      tip: '「ダー」と「ディン」を口で唱え分けよう。', ex: { title: 'ディンの練習', beats: 'Dhin S Dhin S Dha Dhin Dha Dhin Dha Dhin Dhin Dha Dha S S S', bpm: 60 } },
    { unit: 'ステップ1：タブラーの音を知る', id: 'trkt', title: 'ティラキタ（TiRaKiTa）― 速い4つ打ち',
      steps: ['<b>ティ・ラ・キ・タ</b>の4音を1拍に詰めて速く。テ（右）・ラ（右）・ケ（左）・テ（右）の順。', 'キーは <kbd>U</kbd> <kbd>I</kbd> <kbd>A</kbd> <kbd>U</kbd>。指の順番を口で「ティラキタ」と唱えながら。', '最初はテンポを40くらいに下げてもOK（合格にはテンポ45以上）。'],
      tip: 'ティラキタはカーイダやエークタールで大活躍する、最重要フレーズ。', ex: { title: 'ティラキタ', beats: 'TiRaKiTa S TiRaKiTa S TiRaKiTa Dha TiRaKiTa Dha', bpm: 50, cycles: 2 } },
    { unit: 'ステップ1：タブラーの音を知る', id: 'q1', title: '🎧 耳テスト：ボル当て（基本）', quiz: 'bol-basic', n: 10,
      steps: ['鳴った音がどのボルか当てよう。10問中6問で合格。', '答えたあと、選択肢を押すと聴き比べできます。'] },

    { unit: 'ステップ2：ティーンタールを身につける', id: 'clap', title: '唱えて手で数える（パダント）',
      steps: ['インド音楽では、周期を<b>手で数えます</b>。ティーンタール16拍では、1拍目（サム）・5拍目で<b>👏手拍子</b>、9拍目で<b>👋手を振る</b>（カーリー）、13拍目で<b>👏手拍子</b>。', 'タブラーのテーカが流れるので、ボルを唱えながら、印のところで 👏（Space）／👋（W）を押そう。', '<b>実際に手を叩いて声に出しながら</b>ボタンを押すと効果的です。'],
      tip: 'この「手で数える」感覚が、どんなに複雑な曲でも周期を見失わない土台になります。',
      ex: { title: 'ティーンタールを手で数える', taal: T.teentaal, beats: thekaBeats(T.teentaal, 1), bpm: 60, cycles: 2, expect: 'claps' } },
    { unit: 'ステップ2：ティーンタールを身につける', id: 'th1', title: 'テーカ前半（1〜8拍）',
      steps: ['ティーンタールのテーカ前半：<b>ダー ディン ディン ダー｜ダー ディン ディン ダー</b>', 'まず「🔊 お手本を聴く」で唱えてから。', 'ダー＝<kbd>G</kbd>（または S+J）、ディン＝<kbd>H</kbd>（または S+K）。'],
      ex: { title: 'テーカ前半', beats: 'Dha Dhin Dhin Dha Dha Dhin Dhin Dha', bpm: 60, cycles: 2 } },
    { unit: 'ステップ2：ティーンタールを身につける', id: 'th2', title: 'テーカ後半（9〜16拍）とカーリー',
      steps: ['後半：<b>ダー ティン ティン ター｜ター ディン ディン ダー</b>', '9〜12拍目は<b>カーリー</b>。ディン→ティン、ダー→ターと<b>左手（ゲー）を抜きます</b>。', '13拍目からまた左手が戻り、サムへ向かいます。'],
      tip: 'カーリーで音が軽くなることで、聴き手は「今どこか」がわかる。うまくできた仕組みです。',
      ex: { title: 'テーカ後半', beats: 'Dha Tin Tin Ta Ta Dhin Dhin Dha', bpm: 60, cycles: 2 } },
    { unit: 'ステップ2：ティーンタールを身につける', id: 'th3', title: 'ティーンタールのテーカ（16拍）',
      steps: ['いよいよ16拍まるごと。円の図で、今どこかを確認しながら。', '慣れたらお手本音を「小さく」→「なし」に。'],
      ex: { title: 'ティーンタール', taal: T.teentaal, beats: T.teentaal.theka, bpm: 70, cycles: 2 } },
    { unit: 'ステップ2：ティーンタールを身につける', id: 'sam', title: '👂 目隠しでサムを感じる',
      steps: ['拍の表示が消えます。テーカを<b>耳だけ</b>で聴いて、<b>サム（1拍目）</b>が来たら 👏（Space）。', 'ヒント：カーリー（軽い音）が終わって4拍後がサム。'],
      tip: '演奏家も聴衆も、サムを感じて一緒に頷きます。これができれば周期が体に入っています。',
      ex: { title: '目隠しサム当て', taal: T.teentaal, beats: thekaBeats(T.teentaal, 1), bpm: 80, cycles: 4, expect: 'sam', blind: true } },

    { unit: 'ステップ3：作品に挑戦', id: 'dugun', title: 'ドゥグン ― 同じテンポで2倍の密度',
      steps: ['テンポはそのままで、1拍に2つずつボルを入れます（ラヤカーリー）。', '拍の速さは変わらないのに、音楽は速く聞こえる。タブラー独奏で何度も使われる考え方です。'],
      ex: { title: 'ティーンタール（ドゥグン）', taal: T.teentaal, beats: thekaBeats(T.teentaal, 2), bpm: 45, cycles: 1 } },
    { unit: 'ステップ3：作品に挑戦', id: 'qa1', title: 'カーイダの主題（前半）',
      steps: ['デリー派の有名な<b>カーイダ</b>（伝統曲）の主題：ダーティ・ダーゲ・ナーダー・ティラキタ…', '1拍に2つ、ティラキタだけ1拍に4つ。', 'ティ＝閉じた音（<kbd>U</kbd>）、ゲ＝<kbd>S</kbd>。'],
      tip: '📜 伝統的な主題です。前半の終わり「ティンナー・キナー」は低音が抜けて、後半（カーリー）への合図になります。',
      ex: { title: 'カーイダ前半', beats: 'DhaTi DhaGe NaDha TiRaKiTa DhaTi DhaGe TinNa KiNa', bpm: 45, cycles: 2 } },
    { unit: 'ステップ3：作品に挑戦', id: 'qa2', title: 'カーイダの主題（全体）',
      steps: ['後半は低音を抜いた形（ターティ・ターケ…）で始まり、最後の4拍で低音が戻ります。', 'バリー（低音あり）とカーリー（低音なし）の対比を意識して。'],
      ex: { title: 'カーイダ主題', taal: T.teentaal, beats: QAIDA_MUKH, bpm: 50, cycles: 1 } },
    { unit: 'ステップ3：作品に挑戦', id: 'tihai', title: 'ティハーイー ― 3回くり返してサムに着地',
      steps: ['テーカ12拍のあと、<b>ティラキタ・ダー</b>を3回。3回目の「ダー」が次の周期の<b>サム（1拍目）</b>にぴったり着地します。', '着地の「ダー」を、強くはっきり。'],
      tip: 'ティハーイーは、即興や作品の締めくくりに必ずと言っていいほど使われます。',
      ex: { title: 'ティハーイー', taal: T.teentaal, beats: 'Dha Dhin Dhin Dha Dha Dhin Dhin Dha Dha Tin Tin Ta TiRaKiTa DhaS TiRaKiTa DhaS TiRaKiTa Dha', bpm: 55, cycles: 1 } },
    { unit: 'ステップ3：作品に挑戦', id: 'q2', title: '🎧 耳テスト：リズム聞き取り', quiz: 'dict', n: 8,
      steps: ['カウント4つのあとの4拍を聴いて、正しい譜を選ぼう。8問中5問で合格。'] },
    { unit: 'ステップ3：作品に挑戦', id: 'jhap', title: 'ジャプタール（10拍）',
      steps: ['2+3+2+3 の非対称な10拍：<b>ディ ナ｜ディ ディ ナ｜ティ ナ｜ディ ディ ナ</b>', '6拍目（カーリー）の「ティ」は左手なし。'],
      ex: { title: 'ジャプタール', taal: T.jhaptaal, beats: T.jhaptaal.theka, bpm: 70, cycles: 2 } },
    { unit: 'ステップ3：作品に挑戦', id: 'q3', title: '🎧 卒業テスト：ターラ当て', quiz: 'taal', n: 8,
      steps: ['テーカを聴いて、どのターラか当てよう。8問中5問で合格。', '数えるコツ：最後の音（サム）まで何拍あるか、カーリーの位置はどこか。'] }
  ];

  // =====================================================================
  // レッスン画面
  // =====================================================================
  const progress = store.get('tablaLessons', {});
  const saveStars = (id, stars) => { if ((progress[id] || 0) < stars) { progress[id] = stars; store.set('tablaLessons', progress); } };
  const lessonRoot = $('#lessonRoot');
  function lessonList() {
    stopAll(); curLesson = -1;
    const done = LESSONS.filter(l => (progress[l.id] || 0) >= 1).length;
    const nextL = LESSONS.find(l => !(progress[l.id] >= 1));
    let html = `<div class="panel"><h2>📚 はじめてのタブラー・レッスン</h2>
      <p style="font-size:.88rem">音を知る → 唱える → 叩いて採点、の順に1つずつ進むコースです。各レッスンは数分。★1つ以上で合格（進み具合はこの端末に保存されます）。</p>
      <div class="prog"><i style="width:${done / LESSONS.length * 100}%"></i></div><div class="small">${done} / ${LESSONS.length} レッスン合格</div>
      <div class="tip">⚠ このアプリでは<b>手の形・指の使い方</b>は身につきません。それは先生や動画で。ここでは<b>耳・リズム感・唱え方・理論</b>を鍛えます。</div>`;
    let unit = '';
    LESSONS.forEach((l, i) => {
      if (l.unit !== unit) { html += (unit ? '</div>' : '') + `<h3>${l.unit}</h3><div class="lessons">`; unit = l.unit; }
      const st = progress[l.id] || 0;
      html += `<button class="lcard ${st ? 'done' : ''} ${l === nextL ? 'next' : ''}" data-i="${i}"><span class="st">${st ? starStr(st) : ''}</span><div class="ln">レッスン ${i + 1}${l === nextL ? '　👉 次はここ' : ''}</div>${l.title}</button>`;
    });
    html += '</div>';
    if (done === LESSONS.length) html += `<div class="tip" style="margin-top:12px">🎓 全レッスン合格おめでとう！ 次は「🎼 演奏の流れ」で独奏全体を聴き込み、「🎯 練習」でカーイダの変奏などに挑戦してみよう。</div>`;
    html += '</div>';
    lessonRoot.innerHTML = html;
    lessonRoot.querySelectorAll('.lcard').forEach(b => b.onclick = () => openLesson(+b.dataset.i));
  }
  let curLesson = -1;
  function openLesson(i) {
    stopAll(); curLesson = i;
    const l = LESSONS[i];
    lessonRoot.innerHTML = `<div class="panel">
      <button class="backlink" id="lBack">← レッスン一覧へ</button>
      <h2 style="margin-top:6px">レッスン ${i + 1}：${l.title}</h2>
      <ol class="steps">${l.steps.map(s => `<li>${s}</li>`).join('')}</ol>
      ${l.tip ? `<div class="tip">💡 ${l.tip}</div>` : ''}
      <div id="lBody"></div>
      <div id="lNext" style="margin-top:10px"></div></div>`;
    $('#lBack').onclick = lessonList;
    const body = $('#lBody');
    const done = r => {
      saveStars(l.id, r.stars);
      if (r.stars >= 1) {
        const nx = LESSONS[i + 1];
        $('#lNext').innerHTML = `<div class="tip">🎉 合格！ ${nx ? '' : '全レッスン修了です。'}</div>` + (nx ? `<button id="lGo">次のレッスンへ ▶（${nx.title}）</button>` : `<button id="lGo">レッスン一覧へ</button>`);
        $('#lGo').onclick = () => nx ? openLesson(i + 1) : lessonList();
      }
    };
    if (l.quiz) runQuiz(body, l.quiz, l.n, done);
    else body.appendChild(setExercise(l.ex, { lesson: true, onDone: done }));
    window.scrollTo({ top: lessonRoot.getBoundingClientRect().top + window.scrollY - 10, behavior: 'smooth' });
  }

  // =====================================================================
  // 練習タブ
  // =====================================================================
  const practiceRoot = $('#practiceRoot');
  const EXLIST = [];
  LESSONS.filter(l => l.ex).forEach(l => EXLIST.push(['レッスンの課題', l.ex.title, l.ex]));
  Object.values(TAALS).forEach(t => {
    EXLIST.push(['テーカ', t.name, { title: t.name, taal: t, beats: thekaBeats(t, 1), bpm: Math.min(t.bpm, 80), cycles: 2 }]);
    EXLIST.push(['手で数える（パダント）', t.name, { title: t.name + ' を手で数える', taal: t, beats: thekaBeats(t, 1), bpm: Math.min(t.bpm, 70), cycles: 2, expect: 'claps' }]);
  });
  EXLIST.push(['作品', 'カーイダ 変奏1（このアプリ作）', { title: 'カーイダ 変奏1', taal: T16, beats: QAIDA_P1, bpm: 50 }]);
  EXLIST.push(['作品', 'ペーシュカール（このアプリ作）', { title: 'ペーシュカール', taal: T16, beats: PESHKAR, bpm: 50 }]);
  EXLIST.push(['作品', 'レーラ（このアプリ作）', { title: 'レーラ', taal: T16, beats: RELA, bpm: 50 }]);
  practiceRoot.innerHTML = `<div class="panel"><h2>🎯 練習（採点つき）</h2>
    <p style="font-size:.86rem">課題を選んで「▶ スタート」。カウント4つのあと、楽譜に合わせてキーボード・画面のボタン・太鼓の絵を叩くと、<b>タイミング</b>と<b>音の種類（右手・左手が合っているか）</b>を判定します。終わると苦手なところのアドバイスが出ます。</p>
    <div class="row"><label class="ctl">課題 <select id="exSel"></select></label>
    <button class="sec" id="exFromComp">✍️「自分で作る」の譜を練習する</button></div>
    <div id="practiceSlot"></div></div>`;
  const exSel = $('#exSel');
  let grp = null, gname = '';
  EXLIST.forEach(([g, name], i) => {
    if (g !== gname) { grp = document.createElement('optgroup'); grp.label = g; exSel.appendChild(grp); gname = g; }
    grp.appendChild(new Option(name, i));
  });
  const mountPractice = (ex) => { $('#practiceSlot').innerHTML = ''; $('#practiceSlot').appendChild(setExercise(ex)); };
  exSel.onchange = () => mountPractice(EXLIST[+exSel.value][2]);
  $('#exFromComp').onclick = () => {
    const beats = W($('#compText').value);
    if (!beats.length) return;
    mountPractice({ title: '自作の譜', taal: TAALS[$('#compTaal').value], beats, bpm: Math.min(+$('#compBpm').value || 60, 120) });
  };
  // 他の画面から「練習」を開く
  window.openPractice = ex => {
    document.querySelector('#tabs [data-t="practice"]').click();
    mountPractice(ex);
    window.scrollTo({ top: practiceRoot.getBoundingClientRect().top + window.scrollY - 10, behavior: 'smooth' });
  };

  // =====================================================================
  // 耳トレタブ
  // =====================================================================
  const earRoot = $('#earRoot');
  const EARS = [
    ['bol-basic', '🥁 ボル当て（基本）', 'ナー・ティン・ゲー・ダーなど8種類'],
    ['bol-adv', '🥁 ボル当て（応用）', 'ゲー↑・クラ・デットなども'],
    ['taal', '🔄 ターラ当て', 'テーカを聴いてターラを当てる'],
    ['dict', '📝 リズム聞き取り', '聴いたリズムの譜を選ぶ'],
    ['sam', '🙈 目隠しサム当て', '耳だけでサムに手拍子']
  ];
  const earBest = store.get('tablaEar', {});
  function earList() {
    stopAll();
    earRoot.innerHTML = `<div class="panel"><h2>👂 耳トレ</h2><p style="font-size:.86rem">タブラーは耳で覚える楽器。音を聴き分ける力、周期を感じる力を鍛えます。</p>
      <div class="lessons">${EARS.map(([k, t, d]) => `<button class="lcard" data-k="${k}"><span class="st">${earBest[k] ? starStr(earBest[k]) : ''}</span>${t}<div class="ln">${d}</div></button>`).join('')}</div>
      <div id="earBody" style="margin-top:12px"></div></div>`;
    earRoot.querySelectorAll('.lcard').forEach(b => b.onclick = () => openEar(b.dataset.k));
  }
  function openEar(k) {
    stopAll();
    const body = $('#earBody'); body.innerHTML = '';
    const done = r => { if ((earBest[k] || 0) < r.stars) { earBest[k] = r.stars; store.set('tablaEar', earBest); } };
    if (k === 'sam') {
      const t = TAALS.teentaal;
      body.appendChild(setExercise({ title: '目隠しサム当て（ティーンタール）', taal: t, beats: thekaBeats(t, 1), bpm: 80, cycles: 4, expect: 'sam', blind: true }, { onDone: done }));
    } else runQuiz(body, k, k === 'taal' || k === 'dict' ? 8 : 10, done);
    body.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  lessonList();
  earList();
  mountPractice(EXLIST[0][2]);
  // タブを切り替えたら、表示中でない練習は止める
  // 練習パネルは1つを共有しているので、タブを戻ったときに付け直す
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
    Practice.stop(true);
    const t = b.dataset.t, inBox = el => pb && el.contains(pb.box);
    if (t === 'practice' && !inBox(practiceRoot)) mountPractice(EXLIST[+exSel.value][2]);
    if (t === 'lesson' && curLesson >= 0 && LESSONS[curLesson].ex && !inBox(lessonRoot)) openLesson(curLesson);
    if (t === 'ear' && $('#earBody') && $('#earBody').querySelector('.pgrid') === null && !inBox(earRoot) && $('#earBody').innerHTML.includes('pbox')) earList();
  }));
})();
