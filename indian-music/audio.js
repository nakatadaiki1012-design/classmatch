/* =====================================================================
   インド古典音楽シミュレーター 共通サウンドエンジン
   - 外部音源ファイルなし。すべて Web Audio API 上で物理的特徴をもとに合成。
   - タブラー：モード合成（太鼓膜の固有振動）＋ノイズによるアタック
   - シタール／タンプーラ：倍音加算合成＋ジャワーリー（駒の「ビーン」といううなり）
   - ハルモニウム（レヘラー用）：リード楽器風の発振器
   ===================================================================== */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------
  // 小さなDSPユーティリティ（純粋関数・ブラウザ外でもテスト可能）
  // ---------------------------------------------------------------
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function biquadCoeffs(type, f, q, sr) {
    const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr;
    const cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; } // bandpass (0dB peak)
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }

  function filterInPlace(x, c) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const x0 = x[i];
      const y0 = c[0] * x0 + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0; x[i] = y0;
    }
    return x;
  }

  function normalize(buf, peakTo) {
    let p = 0;
    for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > p) p = v; }
    if (p > 0) { const k = peakTo / p; for (let i = 0; i < buf.length; i++) buf[i] *= k; }
    return buf;
  }

  function fadeTail(buf, sr, sec) {
    const n = Math.min(buf.length, Math.floor(sr * sec));
    for (let i = 0; i < n; i++) buf[buf.length - 1 - i] *= i / n;
  }

  // ---------------------------------------------------------------
  // タブラー：ストローク（打ち方）の物理パラメータ
  //   modes: [周波数比, 振幅, 減衰時間(秒)]
  //   右のダーヤーンは中央の黒い「シャーヒー（スヤーヒー）」のおかげで
  //   倍音が整数倍に揃い、音程のある太鼓になる。
  // ---------------------------------------------------------------
  const STROKES = {
    // ナー／ター：人差し指で縁(キナール)を弾き、薬指でシャーヒーの縁を押さえる → 基音が消え、倍音がキラッと鳴る
    na: {
      drum: 'd', dur: 2.2, gain: 0.85,
      modes: [[1, .16, .1], [2, 1, .3], [3, .62, .24], [4, .4, .18], [5, .24, .14], [6, .13, .1], [7, .07, .07],
              [2.93, .14, .05], [4.27, .1, .04], [5.62, .07, .035]],
      noise: [['highpass', 3200, .7, .3, .005], ['bandpass', 1600, 1.4, .22, .014]],
      pitch: { type: 'settle', amt: .012, t: .05 }
    },
    // ティン：人差し指でシャーヒーと縁の間(スール)を打ち、すぐ離す → 基音と倍音が豊かに響く
    tin: {
      drum: 'd', dur: 3.0, gain: 0.8,
      modes: [[1, .85, .42], [2, .62, .34], [3, .36, .25], [4, .18, .18], [5, .1, .13], [2.93, .08, .05], [4.27, .05, .03]],
      noise: [['bandpass', 2100, 1, .22, .008]],
      pitch: { type: 'settle', amt: .01, t: .05 }
    },
    // トゥン：人差し指でシャーヒーの中央を打って離す → 太く長い基音
    tun: {
      drum: 'd', dur: 3.8, gain: 0.85,
      modes: [[1, 1, .55], [2, .3, .32], [3, .1, .18], [4, .04, .12]],
      noise: [['bandpass', 700, 1, .25, .012]],
      pitch: { type: 'settle', amt: .015, t: .06 }
    },
    // テ（ティ）：中指・薬指でシャーヒー中央を打ち、そのまま押さえる → 短い閉じた音
    te: {
      drum: 'd', dur: .25, gain: 0.7,
      modes: [[1, .5, .05], [2, .35, .035], [3, .2, .025]],
      noise: [['bandpass', 1100, .9, .8, .02], ['highpass', 3000, .7, .2, .004]]
    },
    // ラ（レ）：人差し指でシャーヒーを閉じて打つ → テより軽く明るい
    ra: {
      drum: 'd', dur: .22, gain: 0.6,
      modes: [[1, .3, .04], [2, .3, .03], [3, .2, .02]],
      noise: [['bandpass', 1900, .9, .6, .015], ['highpass', 3500, .7, .22, .004]]
    },
    // ゲー：左手の中指・人差し指でバーヤーンの膜を弾き、離す → 深い低音
    ge: {
      drum: 'b', dur: 2.8, gain: 1,
      modes: [[1, 1, .4], [2, .3, .22], [3, .12, .14], [2.6, .08, .12], [3.9, .05, .08]],
      noise: [['lowpass', 350, .7, .45, .02]],
      pitch: { type: 'settle', amt: .05, t: .04 }
    },
    // ゲー（ミーンド）：叩いたあと手首を押し出して膜の張力を上げる → 音程が「ウォン↑」と上がる
    ghe: {
      drum: 'b', dur: 3.2, gain: 1,
      modes: [[1, 1, .48], [2, .3, .26], [3, .12, .15], [2.6, .08, .12]],
      noise: [['lowpass', 350, .7, .45, .02]],
      pitch: { type: 'meend', amt: .38, t: .38, delay: .07 }
    },
    // ケー／カ：左手のひらを平らに置いて叩く → 響かない「カッ」
    ke: {
      drum: 'b', dur: .25, gain: 0.85,
      modes: [[1, .45, .05], [1.6, .2, .03]],
      noise: [['lowpass', 520, .8, .9, .035], ['bandpass', 2500, 1, .25, .006]]
    }
  };

  function renderStroke(name, baseHz, sr, seed) {
    const def = STROKES[name];
    const r = rng(seed || 1);
    const vary = (v, p) => v * (1 + (r() * 2 - 1) * p);
    const n = Math.floor(def.dur * sr);
    const out = new Float32Array(n);
    const f0 = vary(baseHz, .003);

    // 音程エンベロープ
    const pm = new Float32Array(n).fill(1);
    if (def.pitch) {
      const p = def.pitch;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        if (p.type === 'settle') pm[i] = 1 + p.amt * Math.exp(-t / p.t);
        else {
          let u = (t - (p.delay || 0)) / p.t; u = u < 0 ? 0 : u > 1 ? 1 : u;
          pm[i] = 1 + p.amt * (u * u * (3 - 2 * u));
        }
      }
    }
    // 膜の固有振動（モード）
    for (const [ratio, amp0, dec0] of def.modes) {
      const f = f0 * vary(ratio, .002);
      if (f * 1.5 > sr / 2) continue;
      const amp = vary(amp0, .1), dec = vary(dec0, .1);
      const k = Math.exp(-1 / (dec * sr));
      let a = amp, ph = 0;
      const w = 2 * Math.PI * f / sr;
      for (let i = 0; i < n; i++) {
        out[i] += a * Math.sin(ph);
        ph += w * pm[i];
        a *= k;
        if (a < 1e-5) break;
      }
    }
    // 打撃のノイズ成分
    for (const [type, fc, q, amp0, dec0] of def.noise || []) {
      const m = Math.min(n, Math.floor(sr * dec0 * 8));
      const nz = new Float32Array(m);
      const k = Math.exp(-1 / (vary(dec0, .15) * sr));
      let a = vary(amp0, .1);
      for (let i = 0; i < m; i++) { nz[i] = (r() * 2 - 1) * a; a *= k; }
      filterInPlace(nz, biquadCoeffs(type, vary(fc, .08), q, sr));
      filterInPlace(nz, biquadCoeffs(type, fc, q, sr)); // 2段で輪郭をはっきり
      for (let i = 0; i < m; i++) out[i] += nz[i] * 3;
    }
    // 立ち上がりの角を少しだけ丸める（デジタル的なクリック防止）
    const att = Math.floor(sr * 0.0008);
    for (let i = 0; i < att; i++) out[i] *= i / att;
    filterInPlace(out, biquadCoeffs('highpass', 30, .7, sr)); // 耳に聞こえない超低域を除去
    normalize(out, def.gain);
    fadeTail(out, sr, Math.min(.4, def.dur * .15));
    return out;
  }

  // 手拍子（ターリー）：数ミリ秒ずれた複数の手のひらの破裂音
  function renderClap(sr, seed) {
    const r = rng(seed || 5), n = Math.floor(sr * .25), out = new Float32Array(n);
    [0, .006, .013, .021].forEach((off, k) => {
      const i0 = Math.floor(off * sr), a0 = k === 3 ? 1 : .55;
      for (let i = i0; i < n; i++) out[i] += (r() * 2 - 1) * a0 * Math.exp(-(i - i0) / (sr * (k === 3 ? .03 : .004)));
    });
    filterInPlace(out, biquadCoeffs('bandpass', 1300, .8, sr));
    filterInPlace(out, biquadCoeffs('highpass', 500, .7, sr));
    normalize(out, .8); fadeTail(out, sr, .05);
    return out;
  }
  // カウント用のクリック音
  function renderTick(sr, hz) {
    const n = Math.floor(sr * .08), out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.sin(2 * Math.PI * hz * i / sr) * Math.exp(-i / (sr * .012));
    normalize(out, .6);
    return out;
  }

  // ---------------------------------------------------------------
  // 撥弦（シタール／タンプーラ）：倍音加算合成＋ジャワーリー
  //   ジャワーリー＝平らな駒に弦が触れたり離れたりして生まれる独特の「ビーン」。
  //   ここでは強調される倍音の帯域が時間とともに高→低へ移動する現象として再現。
  // ---------------------------------------------------------------
  function renderPluck(f0, sr, o) {
    o = Object.assign({
      dur: 3, decay: 2.6, tilt: .75, pluckPos: .13, jawari: 3, jw: 3.5,
      jc0: 30, jc1: 5, jtau: .9, maxH: 48, soft: 0, click: .25, seed: 1, inharm: .00004, hdamp: .075
    }, o || {});
    const r = rng(o.seed);
    const n = Math.floor(o.dur * sr);
    const out = new Float32Array(n);
    const maxH = Math.max(1, Math.min(o.maxH, Math.floor(Math.min(sr * .45, 12000) / f0)));
    const BLK = 64;
    const nb = Math.ceil(n / BLK) + 1;
    const center = new Float32Array(nb);
    for (let b = 0; b < nb; b++) center[b] = o.jc1 + (o.jc0 - o.jc1) * Math.exp(-(b * BLK / sr) / o.jtau);
    for (let h = 1; h <= maxH; h++) {
      const fh = f0 * h * Math.sqrt(1 + o.inharm * h * h);
      if (fh > sr * .45) break;
      const a0 = (Math.abs(Math.sin(Math.PI * h * o.pluckPos)) + .05) / Math.pow(h, o.tilt);
      const tau = o.decay / (1 + o.hdamp * Math.pow(h, 1.25)); // 高い倍音ほど早く減衰（実際の弦と同じ）
      const w = 2 * Math.PI * fh / sr;
      const c = Math.cos(w), s = Math.sin(w);
      const phi = r() * 2 * Math.PI;
      let x = Math.cos(phi), y = Math.sin(phi);
      const ampAt = (b) => {
        const t = b * BLK / sr;
        const d = h - center[b];
        return a0 * Math.exp(-t / tau) * (1 + o.jawari * Math.exp(-(d * d) / (2 * o.jw * o.jw)));
      };
      let aPrev = ampAt(0);
      for (let b = 0; b * BLK < n; b++) {
        const aNext = ampAt(b + 1);
        if (aPrev < 1e-6 && aNext < 1e-6 && b * BLK / sr > .2) break;
        const i0 = b * BLK, i1 = Math.min(n, i0 + BLK);
        const da = (aNext - aPrev) / BLK;
        let a = aPrev;
        for (let i = i0; i < i1; i++) {
          out[i] += a * y;
          const nx = x * c - y * s; y = x * s + y * c; x = nx;
          a += da;
        }
        const g = 1 / Math.sqrt(x * x + y * y); x *= g; y *= g;
        aPrev = aNext;
      }
    }
    // ミズラーブ（金属の爪）のアタック
    if (o.click > 0) {
      const m = Math.floor(sr * .012);
      const nz = new Float32Array(m);
      for (let i = 0; i < m; i++) nz[i] = (r() * 2 - 1) * Math.exp(-i / (sr * .0025));
      filterInPlace(nz, biquadCoeffs('highpass', 1800, .7, sr));
      let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(out[i]));
      for (let i = 0; i < m; i++) out[i] += nz[i] * o.click * pk;
    }
    if (o.soft > 0) { // 共鳴弦などのふわっとした立ち上がり
      for (let i = 0; i < n; i++) out[i] *= 1 - Math.exp(-(i / sr) / o.soft);
    } else {
      const att = Math.floor(sr * .001);
      for (let i = 0; i < att; i++) out[i] *= i / att;
    }
    normalize(out, .9);
    fadeTail(out, sr, Math.min(1.2, o.dur * .2));
    return out;
  }

  // ---------------------------------------------------------------
  // 作曲ヘルパー：ティハーイー（3回くり返してサム＝1拍目に着地）
  // ---------------------------------------------------------------
  // units: トークン配列（'S' は休符／のばし）
  function tihai(phrase, gap) {
    const g = new Array(gap).fill('S');
    return [...phrase, ...g, ...phrase, ...g, ...phrase];
  }
  // body+tihai の最後のトークンがちょうど「次のサム」に来るよう、前にフィラーを詰める。
  // 返り値: { units: サムの直前までのトークン列（周期の倍数長）, landing: サムで鳴るトークン }
  function placeOnSam(body, tih, cycleUnits, filler) {
    const all = [...body, ...tih];
    const landing = all.pop();
    const k = Math.max(1, Math.ceil(all.length / cycleUnits));
    const need = k * cycleUnits - all.length;
    const pre = [];
    for (let i = 0; i < need; i++) pre.push(filler[i % filler.length]);
    return { units: [...pre, ...all], landing };
  }
  function chunk(units, size) {
    const out = [];
    for (let i = 0; i < units.length; i += size) out.push(units.slice(i, i + size));
    return out;
  }

  // ---------------------------------------------------------------
  // ブラウザ用オーディオエンジン
  // ---------------------------------------------------------------
  class Engine {
    constructor() { this.ctx = null; }
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
      const AC = global.AudioContext || global.webkitAudioContext;
      const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
      this.sr = ctx.sampleRate;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4;
      comp.attack.value = .004; comp.release.value = .2;
      this.master = ctx.createGain(); this.master.gain.value = .8;
      this.master.connect(comp); comp.connect(ctx.destination);
      // 部屋の響き（インパルス応答を合成）
      this.verb = ctx.createConvolver();
      this.verb.buffer = this._impulse(2.2, 2.8);
      this.verbIn = ctx.createGain(); this.verbIn.gain.value = 1;
      const wet = ctx.createGain(); wet.gain.value = .22;
      this.verbIn.connect(this.verb); this.verb.connect(wet); wet.connect(this.master);
      return ctx;
    }
    setReverb(v) { if (this.verbIn) this.verbIn.gain.value = v; }
    _impulse(sec, decay) {
      const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
      const b = ctx.createBuffer(2, n, ctx.sampleRate), r = rng(7);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (let i = 0; i < n; i++) {
          const t = i / n;
          d[i] = (r() * 2 - 1) * Math.pow(1 - t, decay) * (i < ctx.sampleRate * .01 ? i / (ctx.sampleRate * .01) : 1);
        }
        filterInPlace(d, biquadCoeffs('lowpass', 5000, .7, ctx.sampleRate));
      }
      return b;
    }
    bus(pan, gain, send) {
      const ctx = this.ensure();
      const g = ctx.createGain(); g.gain.value = gain == null ? 1 : gain;
      let node = g;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan || 0; g.connect(p); node = p; }
      node.connect(this.master);
      const s = ctx.createGain(); s.gain.value = send == null ? .5 : send;
      node.connect(s); s.connect(this.verbIn);
      return g;
    }
    toBuffer(f32) {
      const b = this.ctx.createBuffer(1, f32.length, this.sr);
      b.copyToChannel ? b.copyToChannel(f32, 0) : b.getChannelData(0).set(f32);
      return b;
    }
    play(buffer, when, dest, gain, rate) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      if (rate) src.playbackRate.value = rate;
      const g = ctx.createGain(); g.gain.value = gain == null ? 1 : gain;
      src.connect(g); g.connect(dest);
      src.start(Math.max(when, ctx.currentTime));
      src._gain = g;
      return src;
    }
    now() { return this.ensure().currentTime; }
  }

  // ---------------------------------------------------------------
  // ボル（口唱歌）→ 実際のストローク
  // ---------------------------------------------------------------
  const BOLS = {
    Dha:  { parts: ['na', 'ge'], kana: 'ダー', hand: '両手', type: 'open', desc: '右のナー＋左のゲーを同時に。いちばん基本の「重い」音。サム（1拍目）によく置かれる。' },
    Dhin: { parts: ['tin', 'ge'], kana: 'ディン', hand: '両手', type: 'open', desc: '右のティン＋左のゲーを同時に。豊かに響く。ティーンタールのテーカの主役。' },
    Dhi:  { parts: ['tin', 'ge'], kana: 'ディ', hand: '両手', type: 'open', desc: 'ディンとほぼ同じ（ジャプタールなどでの表記）。' },
    Ta:   { parts: ['na'], kana: 'ター', hand: '右手', type: 'open', desc: 'ナーと同じ打ち方。人差し指で縁（キナール）を弾く。左手は鳴らさない。' },
    Na:   { parts: ['na'], kana: 'ナー', hand: '右手', type: 'open', desc: '人差し指で縁（キナール）を鋭く弾き、薬指はシャーヒーの縁に軽く置く。キラッとした金属的な響き。' },
    Tin:  { parts: ['tin'], kana: 'ティン', hand: '右手', type: 'open', desc: '人差し指でシャーヒーと縁の間（スール）を打ってすぐ離す。ダーヤーンの音程がよく聞こえる。' },
    Tun:  { parts: ['tun'], kana: 'トゥン', hand: '右手', type: 'open', desc: '人差し指でシャーヒーの中央を打ってすぐ離す。低く長く「ウーン」と響く。' },
    Tu:   { parts: ['tun'], kana: 'トゥ', hand: '右手', type: 'open', desc: 'トゥンと同じ。' },
    Te:   { parts: ['te'], kana: 'テ', hand: '右手', type: 'closed', desc: '中指と薬指（＋小指）でシャーヒー中央を打ち、押さえたまま。響かない短い音。' },
    Ti:   { parts: ['te'], kana: 'ティ', hand: '右手', type: 'closed', desc: 'テと同じ閉じた音（ティラキタ等の中）。単独で書かれたときは開いた音（ティン寄り）。' },
    Tit:  { parts: ['te'], kana: 'ティト', hand: '右手', type: 'closed', desc: 'テと同じ閉じた音。' },
    Ra:   { parts: ['ra'], kana: 'ラ', hand: '右手', type: 'closed', desc: '人差し指でシャーヒーを閉じて打つ。テとセットで「ティラ」「テレ」と速く交互に。' },
    Re:   { parts: ['ra'], kana: 'レ', hand: '右手', type: 'closed', desc: 'ラと同じ。' },
    Ge:   { parts: ['ge'], kana: 'ゲー', hand: '左手', type: 'open', desc: '左の中指・人差し指でバーヤーンを弾き離す。深い低音。手首の位置で音程が変わる。' },
    Ghe:  { parts: ['ghe'], kana: 'ゲー↑', hand: '左手', type: 'open', desc: '打ったあと手首を押し出し、膜を張って音程を上げる（ミーンド）。タブラーらしい「ウォン」。' },
    Ga:   { parts: ['ge'], kana: 'ガ', hand: '左手', type: 'open', desc: 'ゲーと同じ。' },
    Gi:   { parts: ['ge'], kana: 'ギ', hand: '左手', type: 'open', desc: 'ゲーと同じ。' },
    Ke:   { parts: ['ke'], kana: 'ケ', hand: '左手', type: 'closed', desc: '左手のひらを平らにして膜を叩き、押さえたまま。響かない「カッ」。' },
    Ka:   { parts: ['ke'], kana: 'カ', hand: '左手', type: 'closed', desc: 'ケと同じ。' },
    Ki:   { parts: ['ke'], kana: 'キ', hand: '左手', type: 'closed', desc: 'ケと同じ（ティラキタの「キ」）。' },
    Kat:  { parts: ['ke'], kana: 'カト', hand: '左手', type: 'closed', vel: 1.2, desc: 'ケを強めに。エークタールのテーカなど。' },
    Dhet: { parts: ['te', 'ge'], kana: 'デット', hand: '両手', type: 'mixed', desc: '右のテ（閉）＋左のゲー（開）を同時に。' },
    Dhe:  { parts: ['te', 'ge'], kana: 'デー', hand: '両手', type: 'mixed', desc: 'デットと同じ。' },
    Kra:  { parts: ['ke', '+na'], kana: 'クラ', hand: '両手', type: 'mixed', desc: '左のケのすぐ後に右のナー（フラム）。「ク・ラッ」と2音がわずかにずれる。' },
    Kran: { parts: ['ke', '+na'], kana: 'クラン', hand: '両手', type: 'mixed', desc: 'クラと同じ。' },
    // 文脈で決まる内部用
    _TaC: { parts: ['te'], kana: 'タ', hand: '右手', type: 'closed', hidden: true, desc: 'ティラキタの最後の「タ」。閉じた音。' },
    _TiO: { parts: ['tin'], kana: 'ティ', hand: '右手', type: 'open', hidden: true, desc: '単独の「ティ」。ディ（Dhi）から左手を抜いた開いた音。' },
    _DhiC: { parts: ['te', 'ge'], kana: 'ディ', hand: '両手', type: 'mixed', hidden: true, desc: 'ディラの「ディ」。手のひら側で閉じて打つ＋ゲー。' }
  };
  const REST = new Set(['S', 'ऽ', '-', 'Ss']);

  // 1拍ぶんの語（例 "TiRaKiTa"）→ 表示名とボルキーの配列
  function parseWord(word) {
    if (!word) return [];
    let w = word.trim();
    if (!w) return [];
    if (w === 'ऽ' || w === '-') return [{ disp: 'ऽ', key: null }];
    w = w.replace(/ऽ/g, 'S').replace(/-/g, 'S');
    w = w[0].toUpperCase() + w.slice(1);
    const toks = w.split(/(?=[A-Z])/).filter(Boolean);
    const res = toks.map(t => ({ disp: t, key: t }));
    for (let i = 0; i < res.length; i++) {
      const t = res[i].disp;
      if (REST.has(t)) { res[i] = { disp: 'ऽ', key: null }; continue; }
      if (t === 'Ta' && i > 0 && res[i - 1].disp === 'Ki') res[i].key = '_TaC';
      else if (t === 'Ti' && toks.length === 1) res[i].key = '_TiO';
      else if (t === 'Dhi' && i + 1 < res.length && toks[i + 1] === 'Ra') res[i].key = '_DhiC';
      else if (!BOLS[t]) res[i].key = '?' + t;
    }
    return res;
  }
  // "Dha Dhin | Dhin Dha" → [[{disp,key}], ...]（1語=1拍）
  function parseBeats(str) {
    return str.replace(/[|｜]/g, ' ').split(/\s+/).filter(Boolean).map(parseWord);
  }
  function beatsFromUnits(units, sub) {
    return chunk(units, sub).map(u => parseWord(u.join('')));
  }

  // ---------------------------------------------------------------
  // タブラー楽器
  // ---------------------------------------------------------------
  class Tabla {
    constructor(engine, opts) {
      this.e = engine; this.opts = Object.assign({ gain: 1, pan: .25 }, opts || {});
      this.dayanHz = 277.18; this.bayanHz = 98;
      this.buffers = {}; this.listeners = []; this.lastGe = null;
    }
    init() {
      this.e.ensure();
      if (!this.dBus) {
        this.dBus = this.e.bus(this.opts.pan, this.opts.gain, .45);
        this.bBus = this.e.bus(-this.opts.pan, this.opts.gain * 1.05, .35);
      }
      if (!this.ready) this.render();
    }
    setTuning(dayanHz, bayanHz) {
      this.dayanHz = dayanHz; this.bayanHz = bayanHz;
      if (this.e.ctx) this.render();
    }
    render() {
      const sr = this.e.sr;
      for (const name of Object.keys(STROKES)) {
        const base = STROKES[name].drum === 'd' ? this.dayanHz : this.bayanHz;
        this.buffers[name] = [0, 1, 2].map(v => this.e.toBuffer(renderStroke(name, base, sr, 11 + v * 97 + name.length * 13)));
      }
      this.clapBufs = [1, 2, 3].map(k => this.e.toBuffer(renderClap(sr, k)));
      this.tickBufs = [this.e.toBuffer(renderTick(sr, 1760)), this.e.toBuffer(renderTick(sr, 1175))];
      this.ready = true;
    }
    clap(when, vel) {
      if (!this.clapBufs) return;
      this.e.play(this.clapBufs[(Math.random() * 3) | 0], when, this.dBus, (vel || 1) * .7);
    }
    tick(when, accent) {
      if (!this.tickBufs) return;
      this.e.play(this.tickBufs[accent ? 0 : 1], when, this.dBus, accent ? .7 : .5);
    }
    stroke(name, when, vel) {
      const vars = this.buffers[name]; if (!vars) return null;
      const buf = vars[(Math.random() * vars.length) | 0];
      const bus = STROKES[name].drum === 'd' ? this.dBus : this.bBus;
      const src = this.e.play(buf, when, bus, vel == null ? 1 : vel);
      if (name === 'ge' || name === 'ghe') this.lastGe = src;
      return src;
    }
    // bolKey: BOLS のキー
    bol(bolKey, when, vel) {
      const b = BOLS[bolKey]; if (!b) return;
      const v = (vel == null ? 1 : vel) * (b.vel || 1);
      for (const p of b.parts) {
        if (p[0] === '+') this.stroke(p.slice(1), when + .028, v);
        else this.stroke(p, when, v * (STROKES[p].drum === 'b' ? .95 : 1));
      }
      const delay = Math.max(0, (when - this.e.ctx.currentTime) * 1000);
      setTimeout(() => this.listeners.forEach(f => f(bolKey, b)), delay);
    }
    bendGe(amount) { // 0..1 手首で押す量
      if (!this.lastGe) return;
      try { this.lastGe.playbackRate.setTargetAtTime(1 + amount * .45, this.e.ctx.currentTime, .02); } catch (e) { }
    }
    onBol(f) { this.listeners.push(f); }
  }

  // ---------------------------------------------------------------
  // タンプーラ（持続音のドローン）
  // ---------------------------------------------------------------
  class Tanpura {
    constructor(engine) { this.e = engine; this.on = false; this.sa = 138.59; this.first = 7; this.cache = {}; }
    setSa(hz) { this.sa = hz; this.cache = {}; }
    setFirst(semi) { this.first = semi; this.cache = {}; }
    _buf(hz, k) {
      const key = hz.toFixed(2) + '_' + k;
      if (!this.cache[key]) this.cache[key] = this.e.toBuffer(renderPluck(hz, this.e.sr, {
        dur: 8, decay: 2.6, jawari: 3.5, jw: 4, jc0: 26, jc1: 7, jtau: 2.2, maxH: 60, tilt: .6, click: .05, soft: .01, seed: k + 3
      }));
      return this.cache[key];
    }
    start() {
      const ctx = this.e.ensure();
      if (this.on) return;
      this.on = true;
      if (!this.bus) this.bus = this.e.bus(0, .45, .7);
      // 第1弦はパ（ラーガにパが無いときはマなど）、2・3弦は中央のサ、4弦は低いサ
      const strings = () => [this.sa * Math.pow(2, (this.first - 12) / 12), this.sa, this.sa, this.sa / 2];
      let next = ctx.currentTime + .1, idx = 0;
      const tick = () => {
        if (!this.on) return;
        while (next < ctx.currentTime + .5) {
          const s = strings();
          this.e.play(this._buf(s[idx], idx), next, this.bus, idx === 3 ? 1 : .8);
          next += idx === 3 ? 1.9 : 1.15;
          idx = (idx + 1) % 4;
        }
        this.timer = setTimeout(tick, 120);
      };
      tick();
    }
    stop() { this.on = false; clearTimeout(this.timer); }
  }

  // ---------------------------------------------------------------
  // ハルモニウム（タブラー独奏のレヘラー＝周期を示す伴奏旋律）
  // ---------------------------------------------------------------
  class Harmonium {
    constructor(engine) { this.e = engine; }
    note(hz, when, dur, vel) {
      const ctx = this.e.ensure();
      if (!this.bus) this.bus = this.e.bus(-.1, .3, .5);
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = .5;
      const peak = .32 * (vel || 1);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(peak, when + .03);
      g.gain.setValueAtTime(peak, when + Math.max(.04, dur - .04));
      g.gain.linearRampToValueAtTime(0, when + dur + .06);
      lp.connect(g); g.connect(this.bus);
      const oscs = [['sawtooth', 1, 0, .5], ['sawtooth', 1, 6, .35], ['square', 2, -4, .12]];
      for (const [type, mul, det, amp] of oscs) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz * mul; o.detune.value = det;
        const og = ctx.createGain(); og.gain.value = amp;
        o.connect(og); og.connect(lp);
        o.start(when); o.stop(when + dur + .1);
      }
    }
  }

  // ---------------------------------------------------------------
  // シタール
  // ---------------------------------------------------------------
  class Sitar {
    constructor(engine) {
      this.e = engine; this.sa = 138.59; this.cache = {}; this.taraf = []; this.listeners = [];
    }
    init() {
      this.e.ensure();
      if (!this.bus) { this.bus = this.e.bus(.05, .9, .6); this.tBus = this.e.bus(-.15, .5, .9); }
    }
    setSa(hz) { this.sa = hz; this.cache = {}; }
    hz(semi) { return this.sa * Math.pow(2, semi / 12); }
    _buf(hz, kind) {
      const key = kind + hz.toFixed(2);
      if (this.cache[key]) return this.cache[key];
      let o;
      if (kind === 'da') o = { dur: 5, decay: 1.3, tilt: .72, jawari: 3.2, jc0: 26, jc1: 6, jtau: .7, click: .3, seed: Math.round(hz) };
      else if (kind === 'ra') o = { dur: 4.5, decay: 1.1, tilt: .9, jawari: 2.6, jc0: 22, jc1: 5, jtau: .6, click: .18, seed: Math.round(hz) + 5 };
      else if (kind === 'chik') o = { dur: 2.2, decay: .45, tilt: .7, jawari: 3, jc0: 18, jc1: 4, jtau: .3, click: .35, maxH: 24, seed: Math.round(hz) + 9 };
      else o = { dur: 4.5, decay: 1.3, tilt: .9, jawari: 2.5, jc0: 20, jc1: 4, jtau: .8, click: 0, soft: .07, maxH: 20, seed: Math.round(hz) + 2 };
      return (this.cache[key] = this.e.toBuffer(renderPluck(hz, this.e.sr, o)));
    }
    prerender(semis) { // 先に作っておくと弾いたときに遅れない
      const list = semis.slice();
      const step = () => {
        const s = list.shift(); if (s == null) return;
        this._buf(this.hz(s), 'da');
        setTimeout(step, 5);
      };
      step();
    }
    setTaraf(semis) { this.taraf = semis.slice(); }
    // 主弦を弾く。meend: [{at:秒(相対), to:半音, dur:秒}]
    pluck(semi, when, opts) {
      opts = opts || {};
      const kind = opts.stroke === 'Ra' ? 'ra' : 'da';
      // 主弦は1本なので、新しく弾くと前の音は止まる
      if (this.lastMain) {
        try { this.lastMain._gain.gain.setTargetAtTime(0, Math.max(when, this.e.ctx.currentTime), .015); } catch (e) { }
      }
      const src = this.lastMain =this.e.play(this._buf(this.hz(semi), kind), when, this.bus, (opts.vel || 1) * (kind === 'ra' ? .8 : 1));
      if (opts.meend) {
        for (const m of opts.meend) {
          const t0 = when + m.at, ratio = Math.pow(2, (m.to - semi) / 12);
          src.playbackRate.setValueAtTime(src.playbackRate.value, t0);
          src.playbackRate.linearRampToValueAtTime(ratio, t0 + m.dur);
        }
      }
      if (opts.mute) {
        src._gain.gain.setValueAtTime(src._gain.gain.value, when + opts.mute);
        src._gain.gain.setTargetAtTime(0, when + opts.mute, .05);
      }
      // 共鳴弦（タラフ）：同じ音名の弦が勝手に鳴り出す
      const pc = ((semi % 12) + 12) % 12;
      const finalPc = opts.meend && opts.meend.length ? (((opts.meend[opts.meend.length - 1].to % 12) + 12) % 12) : pc;
      this.taraf.forEach((ts, i) => {
        const tpc = ((ts % 12) + 12) % 12;
        if (tpc === pc || tpc === finalPc) {
          const delay = tpc === pc ? .02 : (opts.meend[opts.meend.length - 1].at + .1);
          this.e.play(this._buf(this.hz(ts), 'taraf'), when + delay, this.tBus, .22 * (opts.vel || 1));
          this._emit('taraf', i, when + delay);
        }
      });
      this._emit('note', { semi, stroke: opts.stroke || 'Da', meend: opts.meend }, when);
      return src;
    }
    chikari(when, vel) {
      const v = vel || .7;
      this.e.play(this._buf(this.hz(24), 'chik'), when, this.bus, v * .6);
      this.e.play(this._buf(this.hz(12), 'chik'), when + .004, this.bus, v * .45);
      this._emit('chikari', null, when);
    }
    _emit(type, data, when) {
      const delay = Math.max(0, (when - this.e.ctx.currentTime) * 1000);
      setTimeout(() => this.listeners.forEach(f => f(type, data)), delay);
    }
    on(f) { this.listeners.push(f); }
  }

  // ---------------------------------------------------------------
  // ラーガで使う音名（サルガム）
  // ---------------------------------------------------------------
  const SARGAM = {
    'S': 0, 'r': 1, 'R': 2, 'g': 3, 'G': 4, 'M': 5, 'M#': 6, 'P': 7, 'd': 8, 'D': 9, 'n': 10, 'N': 11
  };
  const SWARA_INFO = {
    0: ['Sa', 'サ'], 1: ['re', 'レ(コーマル)'], 2: ['Re', 'レ'], 3: ['ga', 'ガ(コーマル)'], 4: ['Ga', 'ガ'], 5: ['Ma', 'マ'],
    6: ['Ma′', 'マ(ティーヴラ)'], 7: ['Pa', 'パ'], 8: ['dha', 'ダ(コーマル)'], 9: ['Dha', 'ダ'], 10: ['ni', 'ニ(コーマル)'], 11: ['Ni', 'ニ']
  };
  function swaraName(semi, short) {
    const pc = ((semi % 12) + 12) % 12, oct = Math.floor(semi / 12);
    const [rom, kana] = SWARA_INFO[pc];
    const mark = oct < 0 ? '.'.repeat(-oct) : oct > 0 ? "'".repeat(oct) : '';
    return short ? rom + mark : { rom: rom + mark, kana, low: oct < 0, high: oct > 0 };
  }
  // "N. R G R ~S - P'" のようなサルガム表記を解析
  //   . = 低いオクターブ、' = 高いオクターブ、- = のばす、A~B = AからBへミーンド
  function parseSargam(str) {
    const out = [];
    for (const tok of str.trim().split(/\s+/)) {
      if (tok === '-') { if (out.length) out[out.length - 1].len += 1; continue; }
      const parts = tok.split('~');
      const semis = parts.map(p => {
        const m = p.match(/^(M#|[SrRgGMPdDnN])([.']*)$/);
        if (!m) return null;
        let s = SARGAM[m[1]];
        for (const ch of m[2]) s += ch === '.' ? -12 : 12;
        return s;
      });
      if (semis.some(s => s == null)) continue;
      out.push({ semi: semis[0], to: semis.length > 1 ? semis[semis.length - 1] : null, len: 1 });
    }
    return out;
  }

  global.IM = {
    rng, biquadCoeffs, filterInPlace, renderStroke, renderPluck, renderClap, renderTick, STROKES, BOLS,
    parseWord, parseBeats, beatsFromUnits, tihai, placeOnSam, chunk,
    Engine, Tabla, Tanpura, Harmonium, Sitar, SARGAM, SWARA_INFO, swaraName, parseSargam
  };
})(typeof window !== 'undefined' ? window : globalThis);
