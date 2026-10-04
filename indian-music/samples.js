/* =====================================================================
   本物のタブラーの録音（サンプル）を読み込んで使う
   - 打ち方ごとに音声ファイルを登録 → 合成音の代わりに使用
   - 先頭の無音を自動カット・音量をそろえる
   - この端末（ブラウザ）の中に保存し、次回も自動で読み込む
   ===================================================================== */
(function () {
  'use strict';
  const SLOTS = [
    ['na', 'ナー／ター', '右手・縁を弾く。キラッと金属的に響く音', 'na, ta'],
    ['tin', 'ティン', '右手・中間。太鼓の音程がよく響く音', 'tin, tinn'],
    ['tun', 'トゥン', '右手・中央。低く「ウーン」と長く響く音', 'tun, tu, thun'],
    ['te', 'テ／ティ', '右手・中央を押さえる。響かない短い音', 'te, ti, tit, tete'],
    ['ra', 'ラ／レ（なくてもOK）', '右手・人差し指で閉じる。無ければ「テ」で代用', 'ra, re'],
    ['ge', 'ゲー', '左手・開放の深い低音', 'ge, ghe, ga, gi'],
    ['ghe', 'ゲー↑（なくてもOK）', '左手・音程が上がる音。無ければゲーから自動で作る', 'ghen, gemeend, gheup'],
    ['ke', 'ケ／カ', '左手・手のひらで押さえる。響かない「カッ」', 'ke, ka, kat, ki']
  ];
  const ALIAS = { na: 'na', ta: 'na', tin: 'tin', tinn: 'tin', tun: 'tun', tu: 'tun', thun: 'tun', toon: 'tun',
    te: 'te', ti: 'te', tit: 'te', tete: 'te', ra: 'ra', re: 'ra', ge: 'ge', ghe: 'ge', ga: 'ge', gi: 'ge', gha: 'ge',
    ghen: 'ghe', gemeend: 'ghe', gheup: 'ghe', ke: 'ke', ka: 'ke', kat: 'ke', ki: 'ke', kath: 'ke' };

  // ---------- IndexedDB（使えない環境では保存せずに動く） ----------
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('tablaSamples', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  async function dbAll() {
    try { const d = await db(); return await new Promise((res, rej) => { const q = d.transaction('files').objectStore('files').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
    catch (e) { return []; }
  }
  async function dbPut(rec) {
    try { const d = await db(); await new Promise((res, rej) => { const t = d.transaction('files', 'readwrite'); t.objectStore('files').add(rec); t.oncomplete = res; t.onerror = () => rej(t.error); }); return true; }
    catch (e) { return false; }
  }
  async function dbDeleteStroke(stroke) {
    try {
      const d = await db(), all = await dbAll();
      await new Promise((res, rej) => { const t = d.transaction('files', 'readwrite'); const st = t.objectStore('files'); all.filter(r => r.stroke === stroke).forEach(r => st.delete(r.id)); t.oncomplete = res; t.onerror = () => rej(t.error); });
    } catch (e) { }
  }

  // ---------- 音声の下ごしらえ ----------
  const LEVEL = { na: .85, tin: .8, tun: .85, te: .7, ra: .6, ge: 1, ghe: 1, ke: .85 };
  function prepare(ab, stroke) {
    const sr = ab.sampleRate, n = ab.length, mono = new Float32Array(n);
    for (let c = 0; c < ab.numberOfChannels; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ab.numberOfChannels; }
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(mono[i]));
    if (pk < 1e-4) return null;
    // 叩いた瞬間の少し前から使う（先頭の無音をカット）
    let st = 0; while (st < n && Math.abs(mono[st]) < pk * .08) st++;
    st = Math.max(0, st - Math.floor(sr * .002));
    // 長すぎる録音は4秒まで、最後に複数の音が入っていても最初の1打を中心に
    const len = Math.min(n - st, Math.floor(sr * 4));
    const out = new Float32Array(len);
    const k = (LEVEL[stroke] || .8) / pk;
    for (let i = 0; i < len; i++) out[i] = mono[st + i] * k;
    const att = Math.floor(sr * .0015); for (let i = 0; i < Math.min(att, len); i++) out[i] *= i / att;
    const fade = Math.min(Math.floor(len * .3), Math.floor(sr * .25)); // 短い音（ケなど）は短く for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    const b = E.ctx.createBuffer(1, len, sr); b.getChannelData(0).set(out);
    return b;
  }
  const loaded = {}; // stroke -> [{name, buf}]
  async function decodeRec(rec) {
    try {
      const ab = await E.ctx.decodeAudioData(rec.data.slice(0));
      const b = prepare(ab, rec.stroke);
      if (b) (loaded[rec.stroke] = loaded[rec.stroke] || []).push({ name: rec.name, buf: b });
      return !!b;
    } catch (e) { return false; }
  }
  // 標準音源（アプリに同梱した本物の録音）。自分で登録した録音があればそちらを優先
  const builtin = {};
  async function loadBuiltin() {
    const B = window.TABLA_BUILTIN; if (!B) return;
    for (const f of B.files) {
      try {
        const bin = atob(f.b64), u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const ab = await E.ctx.decodeAudioData(u8.buffer);
        const b = prepare(ab, f.stroke);
        if (!b) continue;
        if (['na', 'tin', 'tun', 'te', 'ra'].includes(f.stroke)) b._pitchHz = B.dayanHz; // 調に合わせて自動で音程を変える
        (builtin[f.stroke] = builtin[f.stroke] || []).push({ name: f.name, buf: b });
      } catch (e) { }
    }
  }
  const sourceOf = s => (loaded[s] || []).length ? 'user' : (builtin[s] || []).length ? 'builtin' : 'synth';
  function apply() {
    SLOTS.forEach(([s]) => {
      const src = sourceOf(s);
      tabla.setCustom(s, !enabled || src === 'synth' ? [] : (src === 'user' ? loaded[s] : builtin[s]).map(x => x.buf));
    });
    render();
  }
  let enabled = true, started = false;
  try { enabled = localStorage.getItem('tablaUseSamples') !== '0'; } catch (e) { }
  async function loadSaved() {
    if (started) return; started = true;
    await loadBuiltin();
    apply();
    const recs = await dbAll();
    for (const r of recs) await decodeRec(r);
    apply();
  }
  async function addFiles(stroke, files) {
    boot();
    let ok = 0, bad = [];
    for (const f of files) {
      const data = await f.arrayBuffer();
      const rec = { stroke, name: f.name, data };
      if (await decodeRec(rec)) { ok++; await dbPut(rec); } else bad.push(f.name);
    }
    apply();
    return { ok, bad };
  }
  // ファイル名から打ち方を推測（例：tabla_na_01.wav → ナー）
  function guess(name) {
    const toks = name.toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[^a-z]+/).filter(Boolean);
    for (const t of toks) if (ALIAS[t]) return ALIAS[t];
    for (const t of toks) for (const k of Object.keys(ALIAS).sort((a, b) => b.length - a.length)) if (k.length >= 3 && t.includes(k)) return ALIAS[k];
    return null;
  }

  // 起動（最初のタップ）時に保存済みの録音を読み込む
  const _boot = window.boot;
  window.boot = function () { const first = !E.ctx; _boot(); if (first || !started) loadSaved(); };

  // ---------- 画面 ----------
  const root = document.getElementById('sampleRoot');
  function render() {
    if (!root) return; // シタールのページなど、画面なしで録音だけ使う場合
    const total = SLOTS.reduce((s, [k]) => s + (loaded[k] || []).length, 0);
    const need = ['na', 'tin', 'tun', 'te', 'ge', 'ke'], have = need.filter(k => (loaded[k] || []).length).length;
    const B = window.TABLA_BUILTIN;
    root.innerHTML = `<h2>🎙 音源（本物の録音）</h2>
      <p style="font-size:.86rem">標準では<b>本物のタブラーの録音</b>${B ? `（録音：<a href="${B.url}" target="_blank" rel="noopener">mmiron「tabla bols」</a>・CC0）` : ''}で鳴ります。ダー（ナー＋ゲー）のような組み合わせは自動で合成。選んだ調に合わせて右の太鼓の音程も自動で変わります。自分の録音を登録すると、その打ち方はそちらに置き換わります。</p>
      <div class="row"><label class="chk"><input type="checkbox" id="smpOn" ${enabled ? 'checked' : ''}>録音を使う（オフにすると計算で作った合成音）</label>
        <span class="small">自分で登録した録音：${total}ファイル</span></div>
      <div class="row" style="margin-top:8px">
        <label class="sec" style="display:inline-block;padding:9px 15px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);cursor:pointer;font-weight:700">📂 まとめて読み込む（ファイル名から自動で振り分け）<input type="file" id="smpBulk" accept="audio/*" multiple style="display:none"></label>
      </div>
      <div class="small" id="smpMsg" style="min-height:1.3em;margin:4px 0"></div>
      <table><thead><tr><th>打ち方</th><th>どんな音か</th><th>状態</th><th></th></tr></thead><tbody>
      ${SLOTS.map(([k, lbl, desc, names]) => `<tr><td><b>${lbl}</b><div class="small">ファイル名の例：${names}</div></td><td class="small">${desc}</td>
        <td>${{ user: `✅ あなたの録音 ${(loaded[k] || []).length}個`, builtin: `🎙 標準の録音 ${(builtin[k] || []).length}個`, synth: '<span class="small">合成音</span>' }[sourceOf(k)]}</td>
        <td style="white-space:nowrap"><label class="play-mini" style="display:inline-block;background:var(--accent);color:#1d1208;border-radius:10px;padding:3px 9px;font-size:.75rem;font-weight:700;cursor:pointer">＋追加<input type="file" data-k="${k}" accept="audio/*" multiple style="display:none"></label>
        <button class="play-mini sec" data-play="${k}">▶</button>${(loaded[k] || []).length ? `<button class="play-mini sec" data-del="${k}" title="あなたの録音を消して標準に戻す">消す</button>` : ''}</td></tr>`).join('')}
      </tbody></table>
      <div class="row" style="margin-top:10px">
        <label class="ctl">録音の音程調整：右の太鼓（半音） <span><input type="range" id="smpD" min="-6" max="6" step="1" value="${Math.round(12 * Math.log2(tabla.sampleRate ? tabla.sampleRate.d : 1))}"> <b id="smpDV"></b></span></label>
        <label class="ctl">左の太鼓（半音） <span><input type="range" id="smpB" min="-6" max="6" step="1" value="${Math.round(12 * Math.log2(tabla.sampleRate ? tabla.sampleRate.b : 1))}"> <b id="smpBV"></b></span></label>
      </div>
      <details style="margin-top:10px"><summary style="cursor:pointer;color:var(--accent2)">録音ファイルの手に入れ方（無料）</summary>
        <ol class="steps">
          <li><b>Freesound</b>（freesound.org・無料の効果音サイト。ダウンロードには無料登録が必要）で「tabla na」「tabla tin」「tabla ge」「bayan」などと検索。</li>
          <li>検索結果の絞り込み（ライセンス）で <b>Creative Commons 0（CC0）</b> を選ぶと、自由に使える録音だけが表示されます。CC-BY のものは作者名の表記が必要です。</li>
          <li>「1打だけ」の短い録音（one-shot）を選んでダウンロード。タブラーの打ち方ごとにまとめた「パック」もあります。</li>
          <li>このページの「＋追加」でそれぞれの打ち方に登録（またはファイル名に na / tin / ge などが入っていれば「まとめて読み込む」で自動振り分け）。</li>
        </ol>
        <p class="small">・WAV / MP3 / M4A / OGG など、ブラウザで再生できる形式ならOK。1つの打ち方に複数ファイルを登録すると、ランダムに使い分けて機械っぽさが減ります。<br>
        ・録音は<b>この端末のブラウザの中だけ</b>に保存され、どこにも送信されません（ブラウザのデータを消すと消えます）。<br>
        ・知り合いや先生のタブラーをスマホで1打ずつ録音してもOK。静かな場所で、1ファイル1打で。</p>
      </details>`;
    root.querySelector('#smpOn').onchange = e => { enabled = e.target.checked; try { localStorage.setItem('tablaUseSamples', enabled ? '1' : '0'); } catch (er) { } apply(); };
    root.querySelectorAll('input[type=file][data-k]').forEach(inp => inp.onchange = async () => {
      const r = await addFiles(inp.dataset.k, [...inp.files]);
      msg(r.bad.length ? `読み込めなかったファイル：${r.bad.join(', ')}` : `${r.ok}個を登録しました。`);
    });
    root.querySelector('#smpBulk').onchange = async e => {
      const files = [...e.target.files], groups = {}, skipped = [];
      files.forEach(f => { const g = guess(f.name); if (g) (groups[g] = groups[g] || []).push(f); else skipped.push(f.name); });
      let ok = 0; const bad = [];
      for (const [k, fs] of Object.entries(groups)) { const r = await addFiles(k, fs); ok += r.ok; bad.push(...r.bad); }
      msg(`${ok}個を登録しました。` + (skipped.length ? `　ファイル名から打ち方が分からず飛ばしたもの：${skipped.join(', ')}（表の「＋追加」から個別に登録してください）` : '') + (bad.length ? `　読み込めなかったもの：${bad.join(', ')}` : ''));
    };
    root.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { boot(); tabla.stroke(b.dataset.play, E.ctx.currentTime + .02, 1); });
    root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('この打ち方のあなたの録音を消して、標準の音に戻しますか？')) return;
      await dbDeleteStroke(b.dataset.del); delete loaded[b.dataset.del]; apply(); msg('消しました。');
    });
    const setRate = () => {
      const d = +root.querySelector('#smpD').value, bb = +root.querySelector('#smpB').value;
      tabla.sampleRate = { d: Math.pow(2, d / 12), b: Math.pow(2, bb / 12) };
      root.querySelector('#smpDV').textContent = (d > 0 ? '+' : '') + d; root.querySelector('#smpBV').textContent = (bb > 0 ? '+' : '') + bb;
      try { localStorage.setItem('tablaSampleRate', JSON.stringify([d, bb])); } catch (e) { }
    };
    root.querySelector('#smpD').oninput = setRate; root.querySelector('#smpB').oninput = setRate;
    setRate();
  }
  function msg(t) { const m = root.querySelector('#smpMsg'); if (m) m.textContent = t; }
  try { const r = JSON.parse(localStorage.getItem('tablaSampleRate') || 'null'); if (r) tabla.sampleRate = { d: Math.pow(2, r[0] / 12), b: Math.pow(2, r[1] / 12) }; } catch (e) { }
  render();
  window.TablaSamples = { guess, loaded };
})();
