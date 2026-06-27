// classmatch_local v1.3 管理ページ
// 変更: かぎ型ブラケット線, クラスピッカー, バージョンログ, クラス数制限を撤廃
(function () {
  const el = (id) => document.getElementById(id);
  const statusBar = el("statusBar");

  // ── Toast通知 ─────────────────────────────────────────────
  // alert() の代わりにスライドイン型のトースト通知を表示する
  let _toastContainer = document.getElementById('toastContainer');
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'toastContainer';
    document.body.appendChild(_toastContainer);
  }

  function toast(message, type = 'success', durationMs = 3000) {
    const icons = { success: '✅', info: 'ℹ️', warn: '⚠️', error: '❌' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${icons[type] || ''}</span><span>${escapeHtml(message)}</span>`;
    _toastContainer.appendChild(t);
    setTimeout(() => {
      t.classList.add('removing');
      setTimeout(() => t.remove(), 350);
    }, durationMs);
  }

  // ── バージョンログ ──────────────────────────────────────────
  const CHANGELOG = [
    {
      version: "1.5.0",
      date: "2026-03-22",
      changes: [
        "トースト通知システム導入（alertの代わりに非侵入型通知）",
        "タイムテーブルのステータスバッジ改善（招集中/試合中/確定/待機）",
        "イベント一覧に進行状況バッジ＆プログレスバー追加",
        "キーボードショートカット対応（Escape/Ctrl+Z）",
        "3位決定戦の追加機能",
        "バグ修正：競技保存時のcheckSetup未定義エラー"
      ]
    },
    {
      version: "1.4.0",
      date: "2026-02-28",
      changes: [
        "参加チーム数に応じたブラケット情報バナーをリアルタイム表示",
        "BYEを標準的なトーナメント形式（対称配置）に改善",
        "シード設定機能を追加（先頭Nチームを有利な枠に固定配置）",
        "ラウンド名を改善（決勝/準決勝/準々決勝/R○回戦）",
        "BYEマッチのビジュアルを刷新"
      ]
    },
    {
      version: "1.3.0",
      date: "2026-02-25",
      changes: [
        "ブラケット接続線をかぎ型（直角）コネクターに変更",
        "クラス一括生成ピッカーを追加（学年×クラス数×形式）",
        "UIデザインを全面刷新（Noto Sans JP / カード型）",
        "クラス数の「24固定」制限を撤廃（2〜128クラスに対応）",
        "ブラケットのデフォルト幅を縮小（クラス名がコンパクトに表示）",
        "バージョンログを追加"
      ]
    },
    {
      version: "1.2.0",
      date: "2025-12-01",
      changes: [
        "モーダルによるダブルクリック結果入力に対応",
        "共有リンク機能（#share= / 共有コード）を追加",
        "表示調整スライダーを追加（文字サイズ・幅・高さ等）"
      ]
    },
    {
      version: "1.1.0",
      date: "2025-11-10",
      changes: [
        "タイムテーブル表示に対応",
        "勝敗のみ（winlose）モードを追加",
        "BYE自動進出ロジックを実装"
      ]
    },
    {
      version: "1.0.0",
      date: "2025-10-20",
      changes: [
        "初回リリース（Firebase不要、localStorage利用）",
        "16チーム5ラウンドシングルエリミネーション"
      ]
    }
  ];

  function renderVersionLog() {
    const body = el("versionLogBody");
    if (!body) return;
    body.innerHTML = "";
    for (const entry of CHANGELOG) {
      const div = document.createElement("div");
      div.className = "vlEntry";
      div.innerHTML = `
        <span class="vlVer">v${entry.version}</span>
        <span class="vlDate">${entry.date}</span>
        <span class="vlChanges">${entry.changes.map(c => "• " + c).join("<br/>")}</span>
      `;
      body.appendChild(div);
    }
  }

  // ── Navigation ──────────────────────────────────────────────
  function show(viewId) {
    for (const id of ["setupView", "shareView", "eventView"]) {
      const e = el(id);
      if (e) e.classList.add("hidden");
    }
    const target = el(viewId);
    if (target) target.classList.remove("hidden");
  }
  function setDebug(msg) { const d = el("debugBar"); if (d) d.textContent = msg; }

  // ── Utilities ───────────────────────────────────────────────
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function fmtTime(d) {
    if (!d) return "";
    const dt = new Date(d);
    return String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0");
  }
  function parseLines(text) {
    return (text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }
  function formatTeamName(name) {
    if (!name) return name;
    if (name.startsWith("__L|") && name.endsWith("__")) {
      const content = name.replaceAll("__L|", "").replaceAll("__", "");
      // "R1-0|A v B" のような形式を想定
      const parts = content.split("|");
      if (parts.length >= 2) {
        return `${parts[1]}\nの負け`; // "A v B\nの負け"
      }
      return `${parts[0]}\nの負け`; // Fallback (旧形式など)
    }
    return name;
  }
  function updateHeaderMeta(extra = "") {
    const t = state.tournament || {};
    const meta = el("headerMeta");
    if (meta) meta.textContent = (t.name || "クラスマッチ") + (t.date ? " / " + t.date : "") + (extra ? " / " + extra : "");
  }

  // ── Class Picker ────────────────────────────────────────────
  const ALPHA = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

  function generateClassNames(grades, perGrade, format) {
    const result = [];
    for (let g = 1; g <= grades; g++) {
      for (let c = 1; c <= perGrade; c++) {
        if (format === "alpha") result.push(`${g}-${ALPHA[c - 1] || c}`);
        else if (format === "num") result.push(`${g}-${c}`);
        else if (format === "kumi") result.push(`${g}年${c}組`);
        else if (format === "num0") result.push(String((g - 1) * perGrade + c));
        else result.push(`${g}-${c}`);
      }
    }
    return result;
  }

  function assignDefaultClassColors(classes) {
    if (!state.tournament) return;
    if (!state.tournament.classColors) state.tournament.classColors = {};
    const colors = state.tournament.classColors;

    // 既存の色設定がないクラスに対して、先頭の数字(学年)で色を自動設定
    const gradeColors = {
      "1": "#ef4444", // Read / 赤
      "2": "#3b82f6", // Blue / 青
      "3": "#10b981", // Green / 緑
    };

    classes.forEach(c => {
      if (colors[c]) return; // 既に設定されていればスキップ

      const match = String(c).match(/^(\d)/); // 先頭の数字を抽出
      if (match && gradeColors[match[1]]) {
        colors[c] = gradeColors[match[1]];
      }
    });
  }

  function bindClassPicker(gradesId, perGradeId, formatId, previewId, applyId, targetTextareaId, countId) {
    const update = () => {
      const g = Math.max(1, Math.min(6, Number(el(gradesId)?.value || 3)));
      const p = Math.max(1, Math.min(12, Number(el(perGradeId)?.value || 8)));
      const fmt = el(formatId)?.value || "num";
      const names = generateClassNames(g, p, fmt);
      const prev = el(previewId);
      if (prev) prev.textContent = names.join("  ") + `  （計 ${names.length} クラス）`;
    };

    const apply = () => {
      const g = Math.max(1, Math.min(6, Number(el(gradesId)?.value || 3)));
      const p = Math.max(1, Math.min(12, Number(el(perGradeId)?.value || 8)));
      const fmt = el(formatId)?.value || "num";
      const names = generateClassNames(g, p, fmt);
      const ta = el(targetTextareaId);
      if (ta) ta.value = names.join("\n");
      const cnt = el(countId);
      if (cnt) cnt.textContent = names.length + " クラス";
      update();
    };

    for (const id of [gradesId, perGradeId, formatId]) {
      const e = el(id);
      if (e) e.addEventListener("input", update);
    }
    const btn = el(applyId);
    if (btn) btn.onclick = apply;

    update();
  }

  // ── State ────────────────────────────────────────────────────
  const STORAGE_KEY = "classmatch_local_v2_state";
  const DEFAULT_CLASSES = generateClassNames(3, 8, "num"); // 24クラス

  const DEFAULT_SPORTS = [
    { name: "バレー", matchMinutes: 10, turnoverMinutes: 2, courts: "A,B", startTime: "09:00", participants: 24 },
    { name: "ドッジ", matchMinutes: 8, turnoverMinutes: 2, courts: "A,B", startTime: "09:00", participants: 24 }
  ];

  function makeNewState() {
    const today = new Date();
    return {
      tournament: {
        name: "クラスマッチ",
        date: today.toISOString().slice(0, 10),
        place: "",
        adminPin: "1234",
        classes: [...DEFAULT_CLASSES],
        sports: [...DEFAULT_SPORTS]
      },
      events: []
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  let state = loadState() || makeNewState();
  normalizeState();

  let currentEvent = null;
  let selectedMatchKey = null;

  // ── Undo Stack ──
  const undoStack = []; // stores serialized snapshots of currentEvent

  function pushUndoState() {
    if (!currentEvent) return;
    undoStack.push(JSON.stringify(currentEvent));
    if (undoStack.length > 20) undoStack.shift();
    updateUndoUI();
  }

  function updateUndoUI() {
    const btnUndo = el("btnUndo");
    if (!btnUndo) return;
    if (undoStack.length > 0) {
      btnUndo.classList.remove("hidden");
    } else {
      btnUndo.classList.add("hidden");
    }
  }

  function performUndo() {
    if (undoStack.length === 0 || !currentEvent) return;
    const lastStateStr = undoStack.pop();
    const lastState = JSON.parse(lastStateStr);

    // Replace currentEvent within state.events
    const idx = state.events.findIndex(e => e.id === currentEvent.id);
    if (idx !== -1) {
      state.events[idx] = lastState;
    }
    currentEvent = lastState;
    saveState();
    renderEventDetail(currentEvent.id);
    updateUndoUI();
  }

  const btnUndo = el("btnUndo");
  if (btnUndo) btnUndo.onclick = performUndo;

  function normalizeState() {
    state.tournament = state.tournament || {};
    const ui = state.tournament.bracketUI || {};
    state.tournament.bracketUI = {
      fontSize: Number(ui.fontSize ?? 13),
      totalW: Number(ui.totalW ?? 130),
      boxH: Number(ui.boxH ?? 38),
      liveZoom: Number(ui.liveZoom ?? 100),
      gapX: Number(ui.gapX ?? 8),
      roundGapY: Number(ui.roundGapY ?? 130),
      midGap: Number(ui.midGap ?? 12),
      branchLen: Number(ui.branchLen ?? 40),
      showTime: ui.showTime !== false,
      timeFontSize: Number(ui.timeFontSize ?? 9),
      timeY: Number(ui.timeY ?? 0),
      // 縦型: 段ごとのY間隔（0=自動）
      gapY1: Number(ui.gapY1 ?? 0),
      gapY2: Number(ui.gapY2 ?? 0),
      gapY3: Number(ui.gapY3 ?? 0),
      gapY4: Number(ui.gapY4 ?? 0),
      // 横型: 段ごとのX間隔（0=自動）
      gapX1: Number(ui.gapX1 ?? 0),
      gapX2: Number(ui.gapX2 ?? 0),
      gapX3: Number(ui.gapX3 ?? 0),
      gapX4: Number(ui.gapX4 ?? 0),
    };
    const tu = state.tournament.timetableUI || {};
    state.tournament.timetableUI = {
      fontSize: Number(tu.fontSize ?? 13),
      compact: tu.compact ?? false,
      showTime: tu.showTime ?? true,
      showCourt: tu.showCourt ?? true,
      showMatchId: tu.showMatchId ?? true,
      showScore: tu.showScore ?? true,
      showStatus: tu.showStatus ?? true,
    };
  }

  function saveState() {
    state.tournament.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Firebase にも同期（有効な場合のみ）
    if (window.FirebaseSync?.enabled) {
      window.FirebaseSync.save(state).catch(e => console.error("Firebase save error:", e));
    }
    statusBar.textContent = `status: saved / events=${state.events.length}${window.FirebaseSync?.enabled ? ' / 🔥 Firebase同期中' : ''}`;
    renderSetupChecklist();
  }

  // ── Match helpers ────────────────────────────────────────────
  function matchKey(m) { return `${m.isLoserMatch ? "L" : "R"}${m.round}-${m.slot}`; }
  function winnerName(m) { return (!m || !m.winner) ? null : (m.winner === "A" ? m.teamA : m.teamB); }
  function placeholderFromFeeder(matches, targetKey, slotName) {
    const feeder = matches.find(x => x.nextMatchKey === targetKey && x.nextSlot === slotName);
    if (!feeder) return "—";
    const wn = winnerName(feeder);
    return wn || `勝者(${feeder.isLoserMatch ? "L" : "R"}${feeder.round}-${feeder.slot + 1})`;
  }
  function displayTeam(matches, m, slotName) {
    const v = slotName === "A" ? m.teamA : m.teamB;
    if (v) return formatTeamName(v);
    if (m.round <= 1) return "—";
    return placeholderFromFeeder(matches, matchKey(m), slotName);
  }
  function findMatch(matches, round, slot) {
    const m = matches.find(x => x.round === round && x.slot === slot);
    if (!m) throw new Error(`match not found R${round}-${slot}`);
    return m;
  }
  function findMatchByKey(matches, key) {
    const [r, s] = key.replace("R", "").replace("L", "").split("-").map(Number);
    const isL = key.startsWith("L");
    const m = matches.find(x => x.round === r && x.slot === s && !!x.isLoserMatch === isL);
    if (!m) return null; // BUG-01修正: throwの代わりにnullを返す
    return m;
  }

  // ── handleDropSwap (Manual Seeding / Schedule Swap) ──────────────────────
  function handleDropSwap(source, target) {
    if (!source || !target || !currentEvent) return;
    if (source.matchKey === target.matchKey && source.slot === target.slot && source.type === target.type) return;

    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const mSource = findMatchByKey(allM, source.matchKey);
    const mTarget = findMatchByKey(allM, target.matchKey);

    if (!mSource || !mTarget) return;

    // 試合箱ごとの入れ替え（スケジュールの順番変更）
    if (source.type === "match" && target.type === "match") {
      // 試合番号（matchNum）と予定時刻（scheduledStart）、コート（court）を交換する
      const tempNum = mSource.matchNum;
      const tempTime = mSource.scheduledStart;
      const tempCourt = mSource.court;

      mSource.matchNum = mTarget.matchNum;
      mSource.scheduledStart = mTarget.scheduledStart;
      mSource.court = mTarget.court;

      mTarget.matchNum = tempNum;
      mTarget.scheduledStart = tempTime;
      mTarget.court = tempCourt;

      window.__draggedTeam = null;
      saveState();
      renderEventDetail(currentEvent.id);
      return;
    }

    // pending 以外ならスワップさせない
    if (mSource.state !== "pending" || mTarget.state !== "pending") {
      alert("すでに結果が入力されている試合枠のチームは移動できません。");
      return;
    }

    // チーム名の入れ替え
    const temp = source.slot === "A" ? mSource.teamA : mSource.teamB;
    if (source.slot === "A") mSource.teamA = target.slot === "A" ? mTarget.teamA : mTarget.teamB;
    else mSource.teamB = target.slot === "A" ? mTarget.teamA : mTarget.teamB;

    if (target.slot === "A") mTarget.teamA = temp;
    else mTarget.teamB = temp;

    // BYE の再計算（自動進行）
    [mSource, mTarget].forEach(m => {
      const targetArr = m.isLoserMatch ? currentEvent.loserMatches : currentEvent.matches;

      // 既存の親（次）の試合のチーム名をクリア
      if (m.nextMatchKey) {
        const p = findMatchByKey(allM, m.nextMatchKey);
        if (p) {
          if (m.nextSlot === "A") p.teamA = null;
          else p.teamB = null;
          p.winner = null;
          p.state = "pending";
        }
      }

      if ((m.teamA && !m.teamB) || (!m.teamA && m.teamB)) {
        m.isBye = true;
        finalizeMatchLocal(targetArr, m, m.teamA ? "A" : "B", true);
      } else {
        m.isBye = false;
        m.winner = null;
        m.state = "pending";
      }
    });

    window.__draggedTeam = null;
    saveState();
    renderEventDetail(currentEvent.id);
  }

  // ── Timetable ────────────────────────────────────────────────
  function buildTimetableText(event) {
    const allM = event.loserMatches ? [...event.matches, ...event.loserMatches] : event.matches;
    const list = [...allM].sort((a, b) => {
      const ta = a.scheduledStart || "", tb = b.scheduledStart || "";
      return ta < tb ? -1 : ta > tb ? 1 : (a.court || "").localeCompare(b.court || "");
    });
    const courts = new Set(list.map(m => m.court || ""));
    const showCourt = courts.size > 1;
    return list.map(m => {
      const t = fmtTime(m.scheduledStart) || "--:--";
      const isAWin = m.winner === "A";
      const isBWin = m.winner === "B";
      const A = displayTeam(allM, m, "A");
      const B = displayTeam(allM, m, "B");
      const aStr = (m.state === "final" && isAWin) ? `○ ${A}` : (m.state === "final" ? `× ${A}` : A);
      const bStr = (m.state === "final" && isBWin) ? `○ ${B}` : (m.state === "final" ? `× ${B}` : B);
      return showCourt ? `${t} | (${m.court || "A"}) ${aStr} vs ${bStr}` : `${t} | ${aStr} vs ${bStr}`;
    }).join("\n");
  }

  function renderTimetable() {
    const box = el("timetable");
    if (!box) return;
    box.innerHTML = "";
    if (!currentEvent) { box.innerHTML = "<div class='small'>イベントがありません</div>"; return; }

    const tu = state.tournament?.timetableUI || {};
    const tblFont = Number(tu.fontSize ?? 13);
    const compact = tu.compact ?? false;
    const showTime = tu.showTime ?? true;
    const showCourt = tu.showCourt ?? true;
    const showMID = tu.showMatchId ?? true;
    const showScore = tu.showScore ?? true;
    const showStatus = tu.showStatus ?? true;

    // ── 設定パネル ────────────────────────────────────────────
    const panel = document.createElement("div");
    panel.style.cssText = `display:flex;gap:8px;flex-wrap:wrap;align-items:center;
      padding:8px 12px;margin-bottom:10px;
      background:var(--surface2);border:1.5px solid var(--border2);
      border-radius:var(--radius);font-size:12px;`;
    panel.innerHTML = `
      <b style="color:var(--navy);white-space:nowrap;">📋 表の設定</b>
      <label style="display:flex;gap:4px;align-items:center;color:var(--muted);">
        文字&nbsp;<input type="range" id="tblFont" min="11" max="18" value="${tblFont}" style="width:72px;accent-color:var(--blue);padding:0;border:none;"/>
        <span id="tblFontV" style="min-width:18px;">${tblFont}</span>
      </label>
      <label style="display:flex;gap:3px;align-items:center;color:var(--muted);">
        <input type="checkbox" id="tblCompact" ${compact ? "checked" : ""}/>&nbsp;コンパクト
      </label>
      <span style="color:var(--border2)">｜</span>
      <label style="display:flex;gap:3px;align-items:center;color:var(--muted);"><input type="checkbox" id="tblShowTime"   ${showTime ? "checked" : ""}/>&nbsp;時刻</label>
      <label style="display:flex;gap:3px;align-items:center;color:var(--muted);"><input type="checkbox" id="tblShowCourt"  ${showCourt ? "checked" : ""}/>&nbsp;コート</label>
      <label style="display:flex;gap:3px;align-items:center;color:var(--muted);"><input type="checkbox" id="tblShowMID"    ${showMID ? "checked" : ""}/>&nbsp;試合番号</label>
      <label style="display:flex;gap:3px;align-items:center;color:var(--muted);"><input type="checkbox" id="tblShowScore"  ${showScore ? "checked" : ""}/>&nbsp;スコア</label>
      <label style="display:flex;gap:3px;align-items:center;color:var(--muted);"><input type="checkbox" id="tblShowStatus" ${showStatus ? "checked" : ""}/>&nbsp;状態</label>
    `;
    box.appendChild(panel);

    const saveTbl = () => {
      const tu2 = state.tournament.timetableUI || {};
      tu2.fontSize = Number(el("tblFont")?.value ?? 13);
      tu2.compact = el("tblCompact")?.checked ?? false;
      tu2.showTime = el("tblShowTime")?.checked ?? true;
      tu2.showCourt = el("tblShowCourt")?.checked ?? true;
      tu2.showMatchId = el("tblShowMID")?.checked ?? true;
      tu2.showScore = el("tblShowScore")?.checked ?? true;
      tu2.showStatus = el("tblShowStatus")?.checked ?? true;
      state.tournament.timetableUI = tu2;
      if (el("tblFontV")) el("tblFontV").textContent = tu2.fontSize;
      saveState();
      renderTimetable();
    };
    setTimeout(() => {
      el("tblFont")?.addEventListener("input", () => {
        if (el("tblFontV")) el("tblFontV").textContent = el("tblFont").value;
        saveTbl();
      });
      ["tblCompact", "tblShowTime", "tblShowCourt", "tblShowMID", "tblShowScore", "tblShowStatus"]
        .forEach(id => el(id)?.addEventListener("change", saveTbl));
    }, 0);

    // ── テーブル本体 ──────────────────────────────────────────
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const list = [...allM].sort((a, b) => {
      const ta = a.scheduledStart || "", tb = b.scheduledStart || "";
      return ta < tb ? -1 : ta > tb ? 1 : (a.court || "").localeCompare(b.court || "");
    });

    const rowPad = compact ? "3px 10px" : "7px 12px";
    const heads = [];
    if (showTime) heads.push("<th>Time</th>");
    if (showCourt) heads.push("<th>Court</th>");
    if (showMID) heads.push("<th>Match</th>");
    heads.push("<th>対戦</th>");
    if (showScore) heads.push("<th>スコア</th>");
    if (showStatus) heads.push("<th>状態</th>");

    const tbl = document.createElement("table");
    tbl.className = "tbl";
    tbl.style.fontSize = tblFont + "px";
    tbl.innerHTML = `<thead><tr>${heads.join("")}</tr></thead>`;

    const tb = document.createElement("tbody");
    for (const m of list) {
      const tr = document.createElement("tr");
      tr.id = `match-row-${matchKey(m)}`; // ハイライト用ID
      const fin = m.state === "final";
      const isAWin = m.winner === "A";
      const isBWin = m.winner === "B";
      const A = escapeHtml(displayTeam(allM, m, "A"));
      const B = escapeHtml(displayTeam(allM, m, "B"));
      const aHtml = fin ? (isAWin ? `<span class="team-win">○ ${A}</span>` : `<span class="team-lose">× ${A}</span>`) : A;
      const bHtml = fin ? (isBWin ? `<span class="team-win">○ ${B}</span>` : `<span class="team-lose">× ${B}</span>`) : B;

      const row = [];
      if (showTime) row.push(`<td class="mono" style="padding:${rowPad}">${fmtTime(m.scheduledStart) || "--:--"}</td>`);
      if (showCourt) row.push(`<td style="padding:${rowPad}"><span class="badge">${escapeHtml(m.court || "A")}</span></td>`);
      if (showMID) row.push(`<td class="mono" style="padding:${rowPad}">${m.matchNum ? `<span style="font-size:10px;color:var(--muted);display:block;">第${m.matchNum}試合</span>` : ""}${m.isLoserMatch ? "裏" : ""}R${m.round}-${m.slot + 1}</td>`);
      row.push(`<td style="padding:${rowPad}">${aHtml} <span class="small">vs</span> ${bHtml}</td>`);
      if (showScore) row.push(`<td class="mono" style="padding:${rowPad};text-align:center;">${(m.scoreA != null && m.scoreB != null) ? `<b>${m.scoreA}</b>-<b>${m.scoreB}</b>` : "—"}</td>`);
      if (showStatus) {
        let statusHtml = '';
        if (fin) statusHtml = `<span class='statusBadge final'>✓ 確定</span>`;
        else if (m.state === 'calling') statusHtml = `<span class='statusBadge calling'>📢 招集中</span>`;
        else if (m.state === 'playing') statusHtml = `<span class='statusBadge playing'>🏃 試合中</span>`;
        else statusHtml = `<span class='statusBadge waiting'>⏳ 待機</span>`;
        row.push(`<td style="padding:${rowPad}">${statusHtml}</td>`);
      }
      tr.innerHTML = row.join("");
      if (fin) tr.style.background = "rgba(22,163,74,.04)";
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    box.appendChild(tbl);
  }

  // ── 進行中試合のハイライト（setIntervalはファイル末尾付近でまとめて管理） ──

  function updateOngoingMatches() {
    if (!currentEvent || !currentEvent.matches) return;
    const now = new Date();
    // 設定から試合時間を取得。未設定時はデフォルト値
    const matchMin = currentEvent.settings?.matchMinutes || 10;
    const intervalMin = currentEvent.settings?.turnoverMinutes || 2;
    const durationMin = matchMin + intervalMin;

    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    allM.forEach(m => {
      const isOngoing = isMatchOngoing(m, now, durationMin);
      const key = matchKey(m);

      // タイムテーブル行のハイライト
      const tr = el(`match-row-${key}`);
      if (tr) {
        if (isOngoing) tr.classList.add("ongoing-row");
        else tr.classList.remove("ongoing-row");
      }

      // ブラケットSVGのハイライト
      const hlTag = el(`match-hl-${key}`);
      if (hlTag) {
        if (isOngoing) {
          hlTag.classList.remove("hidden");
          hlTag.classList.add("ongoing-svg-box");
        } else {
          hlTag.classList.add("hidden");
          hlTag.classList.remove("ongoing-svg-box");
        }
      }
    });

    // 進行状況の更新と同時にダッシュボードも更新する
    renderDashboard();
  }

  function renderDashboard() {
    const box = el("dashboardBox");
    if (!box) return;

    // 現在のイベントか、イベント全体を対象にするか（ここでは現在開いているイベントがあればそれ、なければ全体）
    let allMatches = [];
    if (state.events) {
      state.events.forEach(e => {
        if (e.matches) allMatches = allMatches.concat(e.matches);
        if (e.loserMatches) allMatches = allMatches.concat(e.loserMatches);
      });
    }

    if (allMatches.length === 0) {
      box.classList.add("hidden");
      return;
    }
    box.classList.remove("hidden");

    let total = 0, completed = 0;
    const now = new Date();
    let maxDelayMins = 0;

    allMatches.forEach(m => {
      if (m.isBye) return;
      total++;
      if (m.state === "final" && m.winner) {
        completed++;
      } else if (m.state === "playing" && m.scheduledStart) {
        // 進行中の試合があれば、遅延状況を確認する
        const sch = new Date(m.scheduledStart);
        if (!isNaN(sch.getTime())) {
          const delayMs = now.getTime() - sch.getTime();
          const delayMins = Math.floor(delayMs / 60000);
          if (delayMins > maxDelayMins) maxDelayMins = delayMins;
        }
      }
    });

    const progEl = el("dashboardProgress");
    const textEl = el("dashboardText");
    const delayEl = el("dashboardDelay");

    const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
    if (progEl) {
      progEl.value = pct;
      progEl.max = 100;
    }
    if (textEl) textEl.textContent = `${completed} / ${total} 試合完了 (${pct}%)`;

    // スティッキー進捗バー更新
    const stickyBar = el("matchProgressBar");
    const stickyText = el("matchProgressText");
    if (stickyBar && stickyText) {
      stickyText.textContent = `${completed} / ${total} 試合完了`;
      stickyBar.style.display = total > 0 ? "block" : "none";
    }

    if (delayEl) {
      if (maxDelayMins > 15) {
        delayEl.textContent = `⚠ 約${maxDelayMins}分遅れで進行中`;
        delayEl.className = "badge danger";
        delayEl.style.background = "#fee2e2";
        delayEl.style.color = "#dc2626";
        delayEl.style.borderColor = "#fca5a5";
      } else if (maxDelayMins > 0) {
        delayEl.textContent = `約${maxDelayMins}分遅れで進行中`;
        delayEl.className = "badge warn";
        delayEl.style.background = "#fef3c7";
        delayEl.style.color = "#d97706";
        delayEl.style.borderColor = "#fde68a";
      } else {
        delayEl.textContent = "✅ スケジュール通り";
        delayEl.className = "badge ok";
        delayEl.style.background = "#dcfce7";
        delayEl.style.color = "#16a34a";
        delayEl.style.borderColor = "#86efac";
      }

      if (completed === total && total > 0) {
        delayEl.textContent = "🏆 全日程終了";
        delayEl.className = "badge";
        delayEl.style.background = "#cbd5e1";
        delayEl.style.color = "#334155";
        delayEl.style.borderColor = "#94a3b8";
      }
    }
  }

  // ISO文字列もしくは時刻文字列をDateでパースし、時刻のみ抽出して本日の日付にマッピング
  function parseScheduledTime(m, now) {
    const parsed = new Date(m.scheduledStart);
    let hh = 0, mm = 0;
    if (!isNaN(parsed.getTime())) {
      hh = parsed.getHours();
      mm = parsed.getMinutes();
    } else if (typeof m.scheduledStart === "string" && m.scheduledStart.includes(":")) {
      [hh, mm] = m.scheduledStart.split(":").map(Number);
    }
    const startObj = new Date(now);
    startObj.setHours(hh, mm, 0, 0);
    return startObj;
  }

  function isMatchOngoing(m, now, durationMin) {
    if (!m.scheduledStart) return false;
    if (m.state === "final" || m.isBye) return false;

    const startObj = parseScheduledTime(m, now);
    // 開始時刻 <= 現在時刻 <= 開始時刻+所要時間
    const endObj = new Date(startObj.getTime() + durationMin * 60000);
    return now >= startObj && now < endObj;
  }

  function setEventPane(mode) {
    const b = el("bracket"), t = el("timetable");
    const tb = el("tabBracket"), tt = el("tabTable");
    if (!b || !t || !tb || !tt) return;
    if (mode === "table") {
      b.classList.add("hidden"); t.classList.remove("hidden");
      tb.dataset.active = "0"; tt.dataset.active = "1";
      renderTimetable();
    } else {
      t.classList.add("hidden"); b.classList.remove("hidden");
      tb.dataset.active = "1"; tt.dataset.active = "0";
      renderBracket();
    }
    updateOngoingMatches();
    renderDashboard();
  }

  // ── Share ────────────────────────────────────────────────────
  function encodeShare(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
      .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }
  function decodeShare(code) {
    const b64 = code.replaceAll("-", "+").replaceAll("_", "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(decodeURIComponent(escape(atob(b64 + pad))));
  }
  function requirePin() {
    const pin = (state.tournament.adminPin || "").trim();
    if (!pin) { alert("PINが未設定です（設定で保存）"); return false; }
    const input = prompt("運営PINを入力してください");
    if (input !== pin) { alert("PINが違います"); return false; }
    return true;
  }

  // ── Setup checklist ──────────────────────────────────────────
  function validateSetupPreview() {
    const probs = [];
    const t = state.tournament;
    if (!t.name?.trim()) probs.push("大会名が未入力");
    if (!t.date) probs.push("日付が未設定");
    if (!t.adminPin || t.adminPin.trim().length < 3) probs.push("運営PIN（3文字以上）が未設定");
    if (!t.classes || t.classes.length < 2) probs.push(`参加クラスが${(t.classes || []).length}件（2以上必要）`);
    if (!t.sports?.length) probs.push("競技が0件");
    (t.sports || []).forEach((s, idx) => {
      if (!s.name) probs.push(`競技${idx + 1}: 名前が空`);
      if (!s.matchMinutes || s.matchMinutes < 1) probs.push(`競技${idx + 1}: 試合分が不正`);
      if (s.turnoverMinutes == null || s.turnoverMinutes < 0) probs.push(`競技${idx + 1}: 入替分が不正`);
      const n = Number(s.participants ?? t.classes?.length ?? 2);
      if (!Number.isFinite(n) || n < 2) probs.push(`競技${idx + 1}: 参加数が2以上でない`);
    });
    return probs;
  }
  function updateSetupProgress() {
    const t = state.tournament || {};
    const step1Done = !!(t.name && t.date && t.pin);
    const step2Done = (state.classes || []).length >= 2;
    const step3Done = (state.sports || []).length >= 1;

    const setDone = (id, done) => {
      const e = el(id);
      if (e) e.classList.toggle("done", done);
    };
    setDone("spStep1", step1Done);
    setDone("spStep2", step2Done);
    setDone("spStep3", step3Done);
    setDone("spStep4", step1Done && step2Done && step3Done);
  }

  function renderSetupChecklist() {
    const box = el("setupProblems");
    if (!box) return;
    const probs = validateSetupPreview();
    if (!probs.length) {
      box.textContent = "OK：このまま生成できます。";
      box.style.color = "var(--ok)";
    } else {
      box.textContent = "未完： " + probs.join(" / ");
      box.style.color = "var(--danger)";
    }
    const dis = probs.length > 0;
    const g1 = el("btnGenerateAll");
    if (g1) g1.disabled = dis;
    updateSetupProgress();
  }

  // ── Setup form ───────────────────────────────────────────────
  // 2のべき乗のかどうか判定
  function isPow2(n) { return n >= 4 && (n & (n - 1)) === 0; }

  function addSportRow(v = {}) {
    const bSlots = v.bracketSlots ?? "auto";
    const bSlotOpts = ["auto", 4, 8, 16, 32, 64, 128]
      .map(o => `<option value="${o}" ${String(bSlots) === String(o) ? "selected" : ""}>${o === "auto" ? "自動（チーム数から計算）" : o + " 枠"}</option>`);
    const wrap = document.createElement("div");
    wrap.className = "card sportCard";
    wrap.style.marginBottom = "0";
    wrap.innerHTML = `
      <div class="sportLabel">競技</div>
      <div class="row" style="gap:8px; flex-wrap:wrap;">
        <label>競技名 <input class="sportName" value="${escapeHtml(v.name ?? "")}" style="width:120px"/></label>
        <label>試合(分) <input class="matchMin" type="number" min="1" value="${Number(v.matchMinutes ?? 10)}" style="width:75px"/></label>
        <label>入替(分) <input class="turnMin"  type="number" min="0" value="${Number(v.turnoverMinutes ?? 2)}" style="width:75px"/></label>
        <label>コート名 <input class="courts" value="${escapeHtml(v.courts ?? "A,B")}" placeholder="例：A,B" style="width:90px"/></label>
        <label>開始 <input class="startTime" type="time" value="${escapeHtml(v.startTime ?? "09:00")}"/></label>
        <label>参加クラス数 <input class="participants" type="number" min="2" max="128" value="${Number(v.participants ?? 24)}" style="width:70px"/></label>
      <div style="display:flex; gap:6px; background:var(--surface2); padding:2px 8px; border-radius:4px; border:1px solid var(--border2); align-items:center;">
        <b style="font-size:11px; color:var(--muted); margin-right:4px;">生成</b>
        <label style="display:flex;align-items:center;gap:2px;"><input type="checkbox" class="genM" ${v.m !== false ? "checked" : ""}>男子</label>
        <label style="display:flex;align-items:center;gap:2px;"><input type="checkbox" class="genF" ${v.f !== false ? "checked" : ""}>女子</label>
        <label style="display:flex;align-items:center;gap:2px;"><input type="checkbox" class="genX" ${v.x === true ? "checked" : ""}>混合</label>
      </div>
      <label>セット数 
          <select class="sets">
            <option value="1" ${v.sets === 1 ? "selected" : ""}>1 セット</option>
            <option value="3" ${v.sets === 3 ? "selected" : ""}>3 セット (2勝)</option>
            <option value="5" ${v.sets === 5 ? "selected" : ""}>5 セット (3勝)</option>
          </select>
        </label>
        <label style="position:relative;">ブラケット枠数
          <select class="bracketSlots">${bSlotOpts.join("")}</select>
        </label>
        <button class="btnRemove ghost" style="align-self:flex-end;">削除</button>
      </div>
    `;
    // 参加クラス数変更時にブラケット枠数を自動提案
    const pInput = wrap.querySelector(".participants");
    const bSelect = wrap.querySelector(".bracketSlots");
    pInput.addEventListener("input", () => {
      const pn = Number(pInput.value);
      // 自動モードの場合はヒントを更新
      if (bSelect.value === "auto") {
        bSelect.title = pn >= 2 ? `自動: ${bracketSize(pn)}枠 (${bracketSize(pn) - pn} BYE)` : "";
      }
    });
    bSelect.addEventListener("change", () => {
      const pn = Number(pInput.value);
      if (bSelect.value !== "auto") {
        const bs = Number(bSelect.value);
        if (bs < pn) bSelect.style.borderColor = "var(--danger)";
        else bSelect.style.borderColor = "";
      } else {
        bSelect.style.borderColor = "";
      }
    });
    // 初期トールチップ
    if (bSlots === "auto") {
      const pn = Number(v.participants ?? 24);
      if (pn >= 2) bSelect.title = `自動: ${bracketSize(pn)}枠 (${bracketSize(pn) - pn} BYE)`;
    }
    wrap.querySelector(".btnRemove").onclick = () => wrap.remove();
    el("sportsArea").appendChild(wrap);
  }

  function readSportsFromForm() {
    return [...el("sportsArea").querySelectorAll(".sportCard")].map(card => {
      const bSlotVal = card.querySelector(".bracketSlots")?.value ?? "auto";
      return {
        name: (card.querySelector(".sportName").value || "").trim(),
        m: card.querySelector(".genM")?.checked ?? true,
        f: card.querySelector(".genF")?.checked ?? true,
        x: card.querySelector(".genX")?.checked ?? false,
        matchMinutes: Number(card.querySelector(".matchMin").value),
        turnoverMinutes: Number(card.querySelector(".turnMin").value),
        courts: (card.querySelector(".courts").value || "A").trim(),
        startTime: card.querySelector(".startTime").value || "09:00",
        participants: Number(card.querySelector(".participants")?.value ?? 24),
        bracketSlots: bSlotVal === "auto" ? "auto" : Number(bSlotVal),
        sets: Number(card.querySelector(".sets")?.value ?? 1)
      };
    }).filter(s => s.name);
  }

  function syncFormFromState() {
    const t = state.tournament;
    el("tName").value = t.name || "";
    el("tDate").value = t.date || "";
    el("tPlace").value = t.place || "";
    if (el("tInputMode")) el("tInputMode").value = t.inputMode || "score";
    el("adminPin").value = t.adminPin || "";
    el("classList").value = (t.classes || []).join("\n");
    updateSetupClassCount();
    el("sportsArea").innerHTML = "";
    (t.sports || []).forEach(addSportRow);
    renderSetupChecklist();

    // Advanced Settings
    if (el("tTickerText")) el("tTickerText").value = t.tickerText || "";
    if (el("tWebhookUrl")) el("tWebhookUrl").value = t.webhookUrl || "";
    renderTeamColorList();
  }
  function updateSetupClassCount() {
    const ta = el("classList");
    const cnt = el("setupClassCount");
    if (!ta || !cnt) return;
    const n = parseLines(ta.value).length;
    cnt.textContent = n + " クラス";
    cnt.style.color = n < 2 ? "var(--danger)" : "var(--ok)";
    updateBracketInfoBanner(n);
  }

  // ── Navigation bindings ──────────────────────────────────────
  if (el("navHome")) el("navHome").onclick = () => { renderEvents(); show("setupView"); };
  if (el("navSetup")) el("navSetup").onclick = () => {
    syncFormFromState(); updateHeaderMeta();
    bindUiPanel(); bindResultModal();
    show("setupView");
  };
  if (el("navShare")) el("navShare").onclick = () => show("shareView");
  if (el("btnBackToHome")) el("btnBackToHome").onclick = () => { currentEvent = null; selectedMatchKey = null; renderEvents(); show("setupView"); };

  // Tabs
  if (el("tabBracket")) el("tabBracket").onclick = () => setEventPane("bracket");
  if (el("tabTable")) el("tabTable").onclick = () => setEventPane("table");
  if (el("btnCopyTable")) el("btnCopyTable").onclick = async () => {
    if (!currentEvent) return alert("イベントを開いてください");
    await navigator.clipboard.writeText(buildTimetableText(currentEvent));
    alert("タイムテーブルをコピーしました");
  };

  if (el("btnPrint")) el("btnPrint").onclick = () => window.print();
  if (el("btnFitBracket")) {
    el("btnFitBracket").onclick = () => {
      const bracket = el("bracket");
      if (bracket) bracket.classList.toggle("fit-bracket");
    };
  }
  // ── Bracket Direction Toggle ──
  // (Handler is defined near L3763)
  if (el("qsMatchMin")) el("qsMatchMin").onchange = (e) => updateQuickSettings("matchMinutes", e.target.value);
  if (el("qsIntervalMin")) el("qsIntervalMin").onchange = (e) => updateQuickSettings("turnoverMinutes", e.target.value);

  function recalcMatchTimes(event) {
    if (!event || !event.matches || !event.settings) return;
    const startObj = parseStartTimeToDate(event.settings.startTime || "09:00");
    const slotMin = (Number(event.settings.matchMinutes) || 10) + (Number(event.settings.turnoverMinutes) || 0);
    const courts = courtList(event.settings);
    const courtsCount = Math.max(1, courts.length);
    let k = 0;
    const allRounds = [...new Set(event.matches.map(m => m.round))].sort((a, b) => a - b);
    for (const r of allRounds) {
      const rMatches = event.matches.filter(m => m.round === r).sort((a, b) => a.slot - b.slot);
      for (const m of rMatches) {
        if (m.isBye) {
          m.scheduledStart = null;
          m.court = null;
          continue;
        }
        const slotIdx = Math.floor(k / courtsCount);
        m.scheduledStart = new Date(startObj.getTime() + slotIdx * slotMin * 60000).toISOString();
        m.court = courts[k % courtsCount] || courts[0] || "A";
        k++;
      }
    }
    assignMatchNumbers(event);
  }

  function assignMatchNumbers(event) {
    if (!event) return;
    const allM = event.loserMatches ? [...event.matches, ...event.loserMatches] : event.matches;
    const list = [...allM].sort((a, b) => {
      const ta = a.scheduledStart || "", tb = b.scheduledStart || "";
      return ta < tb ? -1 : ta > tb ? 1 : (a.court || "").localeCompare(b.court || "");
    });
    let num = 1;
    for (const m of list) {
      if (m.isBye) {
        m.matchNum = null;
      } else {
        m.matchNum = num++;
      }
    }
  }

  function updateQuickSettings(key, val) {
    if (!currentEvent || !currentEvent.settings) return;
    const v = Number(val);
    if (!isNaN(v)) {
      currentEvent.settings[key] = v;
      recalcMatchTimes(currentEvent);
      saveState();
      renderEventDetail(currentEvent.id);
    }
  }

  // シード位置変更時により呼び出される、スケジュール等の再構築関数
  window.reassignMatchesAndTimes = function (ev) {
    if (!ev || !ev.matches) return;
    assignMatchNumbers(ev);
    recalcMatchTimes(ev);
  };

  // ── Setup class list live count ──────────────────────────────
  const classList = el("classList");
  if (classList) classList.addEventListener("input", updateSetupClassCount);

  // ── Setup handlers ───────────────────────────────────────────
  // BUG-08修正: nullチェックを追加
  if (el("btnAddSport")) el("btnAddSport").onclick = () => addSportRow({ name: "新競技", matchMinutes: 10, turnoverMinutes: 2, courts: "A,B", startTime: "09:00", participants: 24 });

  if (el("btnSaveMeta")) el("btnSaveMeta").onclick = () => {
    state.tournament.name = (el("tName").value || "クラスマッチ").trim();
    state.tournament.date = el("tDate").value || state.tournament.date;
    state.tournament.place = (el("tPlace").value || "").trim();
    if (el("tInputMode")) state.tournament.inputMode = el("tInputMode").value;
    const pin = (el("adminPin").value || "").trim();
    if (pin.length < 3) return alert("PINは3文字以上にしてください");
    state.tournament.adminPin = pin;
    saveState();
    toast("大会情報を保存しました");
  };

  el("btnSaveClasses").onclick = () => {
    const classes = parseLines(el("classList").value);
    if (classes.length < 2) return alert(`クラス数が${classes.length}件です（2以上必要）`);
    state.tournament.classes = classes;
    // シードオプションもまとめて保存
    const seedNone = el("seedNone");
    const seedEnabled = el("seedEnabled");
    if (seedNone && seedEnabled) {
      state.tournament.seedMode = seedEnabled.checked ? "seeded" : "none";
      state.tournament.seedCount = Number(el("seedCount")?.value ?? 2);
    }
    saveState();
    renderTeamColorList(); // クラス変更に合わせてカラーリストを更新
    toast(`${classes.length} クラスを保存しました`);
  };

  // ── Advanced Seeding (生成前マッピング) ──────────────────────────────────
  if (el("btnAdvancedSeeding")) {
    el("btnAdvancedSeeding").onclick = () => {
      const classes = state.tournament?.classes || [];
      if (classes.length < 2) return alert("先にクラスを保存してください。");

      const modal = el("advSeedingModal");
      const srcBox = el("advSeedSource");
      const tgtBox = el("advSeedTarget");
      if (!modal || !srcBox || !tgtBox) return;

      const seeds = state.tournament.advancedSeeds || [];
      srcBox.innerHTML = "";
      tgtBox.innerHTML = "";

      const maxSlots = bracketSize(classes.length);

      for (let i = 0; i < maxSlots; i++) {
        const slotEl = document.createElement("div");
        slotEl.className = "seed-slot";
        slotEl.style.cssText = "min-height:30px; border:2px dashed var(--border); border-radius:4px; padding:4px; display:flex; align-items:center; justify-content:center; background:var(--surface);";
        slotEl.dataset.slot = i;
        slotEl.innerHTML = `<span style="color:var(--muted); font-size:12px;">スロット ${i + 1}</span>`;

        slotEl.ondragover = e => e.preventDefault();
        slotEl.ondrop = e => {
          e.preventDefault();
          const team = e.dataTransfer.getData("text/plain");
          if (!team) return;

          document.querySelectorAll('.seed-team').forEach(elem => {
            if (elem.dataset.team === team) elem.remove();
          });

          const existing = slotEl.querySelector('.seed-team');
          if (existing) srcBox.appendChild(existing);
          slotEl.innerHTML = "";

          const teamEl = createTeamCard(team);
          slotEl.appendChild(teamEl);
        };
        tgtBox.appendChild(slotEl);
      }

      function createTeamCard(team) {
        const d = document.createElement("div");
        d.className = "seed-team";
        d.style.cssText = "background:var(--primary); color:white; padding:4px 8px; border-radius:4px; font-weight:bold; cursor:grab; width:100%; text-align:center;";
        d.draggable = true;
        d.dataset.team = team;
        d.textContent = escapeHtml(team);
        d.ondragstart = e => e.dataTransfer.setData("text/plain", team);
        return d;
      }

      classes.forEach(c => {
        const oldIndex = seeds.indexOf(c);
        const card = createTeamCard(c);
        if (oldIndex >= 0 && oldIndex < maxSlots) {
          const slot = tgtBox.children[oldIndex];
          slot.innerHTML = "";
          slot.appendChild(card);
        } else {
          srcBox.appendChild(card);
        }
      });

      srcBox.ondragover = e => e.preventDefault();
      srcBox.ondrop = e => {
        e.preventDefault();
        const team = e.dataTransfer.getData("text/plain");
        if (!team) return;
        document.querySelectorAll('.seed-team').forEach(elem => {
          if (elem.dataset.team === team) srcBox.appendChild(elem);
        });
        document.querySelectorAll('.seed-slot').forEach((slot, i) => {
          if (slot.children.length === 0) {
            slot.innerHTML = `<span style="color:var(--muted); font-size:12px;">スロット ${i + 1}</span>`;
          }
        });
      };

      modal.classList.remove("hidden");
    };
  }

  if (el("btnAdvSeedCancel")) {
    el("btnAdvSeedCancel").onclick = () => el("advSeedingModal").classList.add("hidden");
  }

  if (el("btnAdvSeedSave")) {
    el("btnAdvSeedSave").onclick = () => {
      const tgtBox = el("advSeedTarget");
      const mapping = [];
      Array.from(tgtBox.children).forEach((slot, i) => {
        const teamEl = slot.querySelector('.seed-team');
        mapping[i] = teamEl ? teamEl.dataset.team : null;
      });
      state.tournament.advancedSeeds = mapping;
      saveState();
      el("advSeedingModal").classList.add("hidden");
      toast("シード配置を保存しました。イベント生成時にこの配置が優先されます。", "info");
    };
  }

  if (el("btnSaveAdvanced")) el("btnSaveAdvanced").onclick = () => {
    state.tournament.tickerText = el("tTickerText")?.value?.trim() || "";
    if (!state.tournament.classColors) state.tournament.classColors = {};
    const colorInputs = el("teamColorList")?.querySelectorAll("input[type=color]");
    if (colorInputs) {
      colorInputs.forEach(input => {
        state.tournament.classColors[input.dataset.class] = input.value;
      });
    }
    saveState();
    toast("詳細設定（テロップ・チームカラー）を保存しました");
  };

  function renderTeamColorList() {
    const listDiv = el("teamColorList");
    if (!listDiv) return;
    listDiv.innerHTML = "";
    const classes = state.tournament.classes || [];
    const colors = state.tournament.classColors || {};

    if (classes.length === 0) {
      listDiv.innerHTML = '<div class="small" style="color:var(--muted); padding:8px;">先にクラスを保存してください</div>';
      return;
    }

    // Default colors for classes if not set
    const defaultColors = [
      "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"
    ];

    classes.forEach((className, i) => {
      const item = document.createElement("div");
      item.style.cssText = "display:flex; align-items:center; gap:6px; background:var(--surface); padding:4px 8px; border-radius:4px; border:1px solid var(--border2);";

      const defaultColor = defaultColors[i % defaultColors.length];
      const val = colors[className] || defaultColor;

      item.innerHTML = `
          <input type="color" data-class="${escapeHtml(className)}" value="${val}" style="width:24px; height:24px; padding:0; border:none; border-radius:4px; cursor:pointer;" />
          <span style="font-size:13px; font-weight:600; min-width:40px;">${escapeHtml(className)}</span>
        `;
      listDiv.appendChild(item);
    });
  }

  if (el("btnSaveSports")) el("btnSaveSports").onclick = () => {
    const arr = readSportsFromForm();
    if (arr.length === 0) return alert("競技がありません");
    state.tournament.sports = arr;
    saveState();
    renderSetupChecklist();
    toast("競技を保存しました");
  };

  if (el("btnGenerateAll")) el("btnGenerateAll").onclick = () => {
    generateEvents();
    saveState();
    toast("ブラケットを生成しました", "info");
    renderEvents();
    show("setupView");
  };

  if (el("btnGoEvents")) el("btnGoEvents").onclick = () => { renderEvents(); show("setupView"); };

  if (el("btnReset")) el("btnReset").onclick = () => {
    if (!confirm("本当に全消去して新規作成しますか？")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = makeNewState();
    state.events = [];
    saveState();
    syncFormFromState();
    renderEvents();
    show("setupView");
  };

  // Share
  el("btnMakeShare").onclick = () => {
    if (!requirePin()) return;
    const code = encodeShare(state);
    const base = location.href.replace(/admin\.html.*$/, "");
    el("viewerLink").value = `${base}viewer.html#share=${code}`;
    el("shareCode").value = code;
    statusBar.textContent = "status: share ready";
  };
  el("btnCopyViewerLink").onclick = async () => {
    const v = (el("viewerLink").value || "").trim();
    if (!v) return alert("リンクが空です（共有リンクを作るを押して）");
    await navigator.clipboard.writeText(v);
    alert("コピーしました（生徒に配布）");
  };
  el("btnCopyCode").onclick = async () => {
    const v = (el("shareCode").value || "").trim();
    if (!v) return alert("コードが空です（共有リンクを作るを押して）");
    await navigator.clipboard.writeText(v);
    alert("コピーしました");
  };
  el("btnImportFromCode").onclick = () => {
    if (!requirePin()) return;
    const code = (el("importCode").value || "").trim();
    if (!code) return alert("取り込みコードが空です");
    try {
      state = decodeShare(code);
      normalizeState();
      saveState();
      syncFormFromState();
      renderEvents();
      alert("取り込みました（一覧へ）");
      show("setupView");
    } catch (e) { alert("取り込み失敗: " + e.message); }
  };

  // ── Generate events/matches ──────────────────────────────────
  function generateEvents() {
    const t = state.tournament;
    if ((t.classes || []).length < 2) return alert("クラスが2件未満です");
    if (!(t.sports || []).length) return alert("競技がありません");
    state.events = [];
    try {
      for (const sport of t.sports) {
        if (!sport || typeof sport.name !== "string" || !sport.name.trim()) continue;
        for (const gender of ["M", "F", "X"]) {
          if (gender === "M" && sport.m === false) continue;
          if (gender === "F" && sport.f === false) continue;
          if (gender === "X" && sport.x !== true) continue;
          state.events.push(makeEvent(`${sport.name}-${gender}`, sport, gender, t.classes));
        }
      }
    } catch (err) {
      alert("イベント生成中にエラーが発生しました: " + err.message);
      console.error(err);
    }
  }

  function parseStartTimeToDate(hhmm) {
    const [hh, mm] = (hhmm || "09:00").split(":").map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d;
  }

  function courtList(sport) {
    return (sport.courts || "A").split(",").map(s => s.trim()).filter(Boolean);
  }

  // ブラケットサイズ: 参加数以上の最小の2のべき乗 (最小4)
  function bracketSize(n) {
    let s = 4;
    while (s < n) s *= 2;
    return Math.min(s, 128);
  }
  // ラウンド数
  function bracketRounds(size) {
    return Math.log2(size);
  }

  // ブラケット情報テキスト（チーム数 → 説明）
  function bracketInfo(n) {
    if (!n || n < 2) return null;
    const size = bracketSize(n);
    const rounds = bracketRounds(size);
    const byes = size - n;
    return { size, rounds, byes };
  }

  // ブラケット情報バナーを更新する
  function updateBracketInfoBanner(n, manualBSize) {
    const banner = el("bracketInfoBanner");
    if (!banner) return;
    if (!n || n < 2) { banner.classList.add("hidden"); return; }
    const size = (manualBSize && isPow2(manualBSize) && manualBSize >= n) ? manualBSize : bracketSize(n);
    const rounds = bracketRounds(size);
    const byes = size - n;
    const r1matches = size / 2 - byes; // 実際に試合が発生するR1の数
    const roundLabel = (r) => {
      if (r === 1) return "決勝";
      if (r === 2) return "準決勝";
      if (r === 3) return "準々決勝";
      return r + " ラウンド";
    };
    banner.innerHTML = `
      <span>📊 ブラケット情報</span>
      <span class="biBadge">🏆 ${n} チーム</span>
      <span class="biBadge">⬛ ${size} 枠</span>
      <span class="biBadge ${byes > 0 ? 'bye' : 'rounds'}">${byes > 0 ? `🎫 不戦勝（シード）: ${byes} チーム` : '✅ 全チーム対戦あり'}</span>
      <span class="biBadge rounds">🔄 ${rounds} ラウンド（${roundLabel(rounds)} まで）</span>
      ${byes > 0 ? `<span class="biBadge" style="color:var(--muted);">R1実試合: ${r1matches}試合 / 不戦勝: ${byes}試合</span>` : ''}
      ${n < 4 ? '<span class="biBadge warn">⚠ チームが少ない</span>' : ''}
    `;
    banner.classList.remove("hidden");
  }

  // ブラケットシード配置（完全修正版）
  // ・BYEは1試合に最大1個（均等分散）
  // ・seededTeams: リスト先頭のシードチーム → BYE対戦位置（不戦勝）に優先配置
  // ・randomTeams: それ以外のチーム → 残りスロットにランダム配置
  function buildBracketSeeds(bSize, seededTeams, randomTeams) {
    const n = seededTeams.length + randomTeams.length;
    const byeCount = Math.max(0, bSize - n);
    const r1Matches = bSize / 2;

    // R1の各試合スロット: slots[mi*2]=A面, slots[mi*2+1]=B面 (nullはBYE)
    const slots = new Array(bSize).fill(null);

    // BYEを入れる試合インデックスを均等分散で決定
    // 例: 8試合で3BYE → 試合0, 4, 7 (evenly spaced)
    const byeMatchSet = new Set();
    if (byeCount > 0) {
      for (let i = 0; i < byeCount; i++) {
        const mi = byeCount === 1
          ? Math.floor(r1Matches / 2)              // 1個なら中央
          : Math.round(i * (r1Matches - 1) / (byeCount - 1)); // 均等間隔
        byeMatchSet.add(Math.max(0, Math.min(mi, r1Matches - 1)));
      }
      // 丸め誤差での重複を連続で補う
      for (let mi = 0; byeMatchSet.size < byeCount && mi < r1Matches; mi++) {
        byeMatchSet.add(mi);
      }
    }
    const byeMatchArr = [...byeMatchSet].sort((a, b) => a - b);

    // シードチームをBYE対戦位置（A面）に配置
    // → そのB面はnullのまま = 不戦勝確定
    const occupiedA = new Set();
    const seededCount = Math.min(seededTeams.length, byeMatchArr.length);
    for (let i = 0; i < seededCount; i++) {
      const mi = byeMatchArr[i];
      slots[mi * 2] = seededTeams[i]; // A面にシードチーム
      // B面（mi*2+1）はnullのまま = BYE
      occupiedA.add(mi);
    }
    // シード数がBYE数を超える場合、余分なシードはランダム扱い
    const extraSeeded = seededTeams.slice(seededCount);

    // 残りの空きスロットを収集（BYEのB面と既に使用済みのA面は除く）
    const freeSlots = [];
    for (let mi = 0; mi < r1Matches; mi++) {
      const isByeMatch = byeMatchSet.has(mi);
      const aFilled = occupiedA.has(mi);
      if (!aFilled) freeSlots.push(mi * 2);    // A面が空いている
      if (!isByeMatch) freeSlots.push(mi * 2 + 1); // BYE以外のB面
    }

    // ランダムチームを空きスロットに配置
    const remaining = shuffle([...extraSeeded, ...randomTeams]);
    for (let i = 0; i < remaining.length && i < freeSlots.length; i++) {
      slots[freeSlots[i]] = remaining[i];
    }

    return slots;
  }

  function makeEvent(id, sport, gender, classes) {
    // 既存の色設定がないクラスに学年ごとの自動カラーを割り当てる
    assignDefaultClassColors(classes);

    const classCount = state.tournament.classes?.length || classes.length;
    const n = Math.max(2, Math.min(classCount, Number(sport.participants ?? classCount)));
    const classesCopy = [...classes].slice(0, n);

    if (sport.format === "league") {
      // ── 総当りリーグ戦の生成 ──
      const matches = [];
      const teams = [...classesCopy];
      // 奇数の場合はダミー(BYE)を追加
      if (teams.length % 2 !== 0) teams.push(null);
      const numTeams = teams.length;
      const rounds = numTeams - 1;
      const matchesPerRound = numTeams / 2;

      let roundRobinMatches = [];
      for (let r = 0; r < rounds; r++) {
        for (let i = 0; i < matchesPerRound; i++) {
          const home = teams[i];
          const away = teams[numTeams - 1 - i];
          if (home !== null && away !== null) {
            roundRobinMatches.push({
              round: r + 1,
              slot: i,
              teamA: home,
              teamB: away,
              scoreA: null, scoreB: null,
              winner: null, state: "pending",
              court: null, scheduledStart: null,
              isBye: false
            });
          }
        }
        // Rotate array: keep first element, shift rest
        const last = teams.pop();
        teams.splice(1, 0, last);
      }

      // schedule
      const start = parseStartTimeToDate(sport.startTime);
      const slotMin = (sport.matchMinutes || 10) + (sport.turnoverMinutes || 0);
      const courts = courtList(sport);
      const courtsCount = Math.max(1, courts.length);

      let k = 0;
      for (const m of roundRobinMatches) {
        const slotIdx = Math.floor(k / courtsCount);
        m.scheduledStart = new Date(start.getTime() + slotIdx * slotMin * 60000).toISOString();
        m.court = courts[k % courtsCount] || courts[0] || "A";
        k++;
      }

      assignMatchNumbers({ matches: roundRobinMatches });

      return { id, sportName: sport.name, gender, settings: sport, matches: roundRobinMatches, format: "league" };
    }

    // ── トーナメント生成（通常） ──
    // ブラケット枠数: 手動指定ありなら使用、なければ自動
    let bSize;
    const manualSlots = sport.bracketSlots;
    if (manualSlots && manualSlots !== "auto" && Number.isFinite(Number(manualSlots))) {
      const ms = Number(manualSlots);
      // 指定値がチーム数以上かつペアの場合はそれを使用、そうでなければ自動計算
      bSize = (ms >= n && isPow2(ms)) ? ms : bracketSize(n);
    } else {
      bSize = bracketSize(n);
    }

    const rounds = bracketRounds(bSize);
    const roundSizes = [];
    for (let r = 1; r <= rounds; r++) roundSizes[r] = bSize / Math.pow(2, r);

    const matches = [];
    for (let r = 1; r <= rounds; r++) {
      const count = roundSizes[r];
      for (let s = 0; s < count; s++) {
        const nextS = r < rounds ? Math.floor(s / 2) : null;
        const nextSlot = r < rounds ? (s % 2 === 0 ? "A" : "B") : null;
        matches.push({
          round: r, slot: s,
          teamA: null, teamB: null,
          scoreA: null, scoreB: null,
          winner: null, state: "pending",
          court: null, scheduledStart: null,
          nextMatchKey: r < rounds ? `R${r + 1}-${nextS}` : null,
          nextSlot: r < rounds ? nextSlot : null
        });
      }
    }

    // シードオプションと詳細配置を取得
    const seedMode = state.tournament.seedMode || "none";
    const seedCount = Number(state.tournament.seedCount ?? 2);
    const advSeeds = state.tournament.advancedSeeds;

    let slots;
    if (Array.isArray(advSeeds) && advSeeds.some(t => t !== null)) {
      slots = new Array(bSize).fill(null);
      const placed = new Set();
      // ユーザー設定の手動配置を適用（存在するクラスのみ）
      for (let i = 0; i < bSize; i++) {
        const team = advSeeds[i];
        if (team && classesCopy.includes(team)) {
          slots[i] = team;
          placed.add(team);
        }
      }
      // もしクラス一覧にあって配置されなかったチームがあれば、空き枠に詰める（フェイルセーフ）
      const unplaced = shuffle(classesCopy.filter(c => !placed.has(c)));
      for (let i = 0; i < bSize && unplaced.length > 0; i++) {
        if (!slots[i]) slots[i] = unplaced.shift();
      }
    } else if (seedMode === "seeded" && seedCount > 0) {
      // seed R1: BYEを対称配置
      const seeded = classesCopy.slice(0, Math.min(seedCount, n));
      const rest = classesCopy.slice(seeded.length);
      slots = buildBracketSeeds(bSize, seeded, rest);
    } else {
      // シードなし：全員ランダム、ただしBYEを対称位置に分散
      slots = buildBracketSeeds(bSize, [], classesCopy);
    }

    const r1count = roundSizes[1];
    for (let i = 0; i < r1count; i++) {
      const m = findMatch(matches, 1, i);
      m.teamA = slots[i * 2] || null;
      m.teamB = slots[i * 2 + 1] || null;
    }

    // BYE auto advance R1（isBye フラグを付けて視覚的に省略）
    for (let i = 0; i < r1count; i++) {
      const m = findMatch(matches, 1, i);
      if ((m.teamA && !m.teamB) || (!m.teamA && m.teamB)) {
        m.isBye = true;
        finalizeMatchLocal(matches, m, m.teamA ? "A" : "B", true);
      }
    }

    // schedule
    const start = parseStartTimeToDate(sport.startTime);
    const slotMin = (sport.matchMinutes || 10) + (sport.turnoverMinutes || 0);
    const courts = courtList(sport);
    const courtsCount = Math.max(1, courts.length);
    let k = 0;
    for (let r = 1; r <= rounds; r++) {
      for (let s = 0; s < roundSizes[r]; s++) {
        const m = findMatch(matches, r, s);
        if (m.isBye) {
          m.scheduledStart = null;
          m.court = null;
          continue;
        }
        const slotIdx = Math.floor(k / courtsCount);
        m.scheduledStart = new Date(start.getTime() + slotIdx * slotMin * 60000).toISOString();
        m.court = courts[k % courtsCount] || courts[0] || "A";
        k++;
      }
    }
    assignMatchNumbers({ matches });

    return { id, sportName: sport.name, gender, settings: sport, matches, format: "tournament" };
  }

  // ── CSV Export ──────────────────────────────────────────────
  if (el("btnExportCSV")) {
    el("btnExportCSV").onclick = () => {
      if (!currentEvent) return alert("イベントを選択してください");
      exportEventToCSV(currentEvent);
    };
  }

  function exportEventToCSV(event) {
    let csv = "\uFEFF"; // BOM for Excel UTF-8 support
    csv += `"${event.sportName} ${event.gender === 'M' ? '男子' : '女子'} 結果"\n\n`;

    if (event.format === "league") {
      // League Format CSV Export
      csv += "順位,チーム,勝点,得失,得,失,勝,分,負\n";
      const teams = new Set();
      const results = {};
      event.matches.forEach(m => {
        if (m.teamA) teams.add(m.teamA);
        if (m.teamB) teams.add(m.teamB);
      });
      const teamArray = Array.from(teams).sort();
      teamArray.forEach(t => results[t] = { pts: 0, gd: 0, gf: 0, ga: 0, w: 0, d: 0, l: 0 });

      event.matches.forEach(m => {
        if (!m.teamA || !m.teamB || m.state !== "final") return;
        const sA = Number(m.scoreA), sB = Number(m.scoreB);
        if (isNaN(sA) || isNaN(sB)) return;

        results[m.teamA].gf += sA; results[m.teamA].ga += sB; results[m.teamA].gd += (sA - sB);
        results[m.teamB].gf += sB; results[m.teamB].ga += sA; results[m.teamB].gd += (sB - sA);

        if (sA > sB) {
          results[m.teamA].pts += 3; results[m.teamA].w += 1; results[m.teamB].l += 1;
        } else if (sA < sB) {
          results[m.teamB].pts += 3; results[m.teamB].w += 1; results[m.teamA].l += 1;
        } else {
          results[m.teamA].pts += 1; results[m.teamA].d += 1;
          results[m.teamB].pts += 1; results[m.teamB].d += 1;
        }
      });

      const sortedTeams = [...teamArray].sort((a, b) => {
        if (results[b].pts !== results[a].pts) return results[b].pts - results[a].pts;
        if (results[b].gd !== results[a].gd) return results[b].gd - results[a].gd;
        return results[b].gf - results[a].gf;
      });

      sortedTeams.forEach((t, i) => {
        const r = results[t];
        csv += `${i + 1},"${t}",${r.pts},${r.gd},${r.gf},${r.ga},${r.w},${r.d},${r.l}\n`;
      });
      csv += "\n試合結果 (League)\nラウンド,試合,チームA,スコアA,スコアB,チームB,勝者\n";
      event.matches.forEach(m => {
        csv += `${m.round},${m.slot + 1},"${m.teamA || ''}",${m.scoreA ?? ''},${m.scoreB ?? ''},"${m.teamB || ''}","${m.winner === 'A' ? m.teamA : m.winner === 'B' ? m.teamB : m.winner || ''}"\n`;
      });
    } else {
      // Tournament Format CSV Export
      csv += "ラウンド,試合,チームA,スコアA,スコアB,チームB,勝者\n";
      const exportMatches = (matchesArr, label) => {
        if (!matchesArr || matchesArr.length === 0) return;
        if (label) csv += `\n${label}\n`;
        const sorted = [...matchesArr].sort((a, b) => a.round - b.round || a.slot - b.slot);
        sorted.forEach(m => {
          if (m.isBye && !m.teamB) return; // Skip pure placeholder BYEs
          csv += `${m.round},${m.slot + 1},"${m.teamA || ''}",${m.scoreA ?? ''},${m.scoreB ?? ''},"${m.teamB || ''}","${m.winner === 'A' ? (m.teamA || '') : m.winner === 'B' ? (m.teamB || '') : m.winner || ''}"\n`;
        });
      };
      exportMatches(event.matches, null);
      exportMatches(event.loserMatches, "敗者復活戦 / 裏トーナメント");
    }

    // Download blob
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results_${event.sportName}_${event.gender}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Events list ──────────────────────────────────────────────
  function renderEvents() {
    const area = el("eventsArea");
    const hint = el("eventsHint");
    if (!area) return;
    area.innerHTML = "";
    if (!state.events.length) {
      hint.textContent = "イベントがありません。「かんたん作成」→ 大会を作成 を押してください。";
      return;
    }
    hint.textContent = "";
    const docs = [...state.events].sort((a, b) =>
      (a.sportName || "").localeCompare(b.sportName || "") || (a.gender || "").localeCompare(b.gender || "")
    );
    for (const e of docs) {
      const card = document.createElement("div");
      card.className = "eventCard";
      const gLabel = e.gender === "M" ? "男子" : (e.gender === "F" ? "女子" : "混合");
      const gClass = e.gender === "M" ? "male" : (e.gender === "F" ? "female" : "mixed");

      // 進行状況を計算
      const allM = e.loserMatches ? [...(e.matches || []), ...e.loserMatches] : (e.matches || []);
      const realM = allM.filter(m => !m.isBye);
      const totalM = realM.length;
      const doneM = realM.filter(m => m.state === 'final' && m.winner).length;
      const pct = totalM > 0 ? Math.round((doneM / totalM) * 100) : 0;
      const statusBadge = totalM === 0 ? '' :
        pct === 100 ? '<span class="eventStatusBadge complete">🏆 完了</span>' :
        doneM > 0 ? `<span class="eventStatusBadge inprogress">${pct}%</span>` :
        '<span class="eventStatusBadge pending">未開始</span>';
      const progressBar = totalM > 0 ? `<div class="eventProgress"><div class="bar${pct === 100 ? ' done' : ''}" style="width:${pct}%"></div></div>` : '';

      card.innerHTML = `
        <div class="evName">${escapeHtml(e.sportName)} <span class="genderBadge ${gClass}">${gLabel}</span>${statusBadge}</div>
        <div class="evId">${doneM}/${totalM} 試合</div>
        ${progressBar}
        <div style="margin-top:8px; display:flex; gap:4px;">
          <button class="btnView primary" style="flex:1;">開く</button>
          <button class="btnSettings ghost" style="padding:4px 8px;" title="設定">⚙</button>
          <button class="btnDelete ghost" style="padding:4px 8px; color:var(--danger); border-color:var(--danger-bg);" title="削除">🗑</button>
        </div>
      `;
      card.querySelector(".btnView").onclick = () => openEvent(e.id);
      card.querySelector(".btnSettings").onclick = () => openEventSettings(e.id);
      card.querySelector(".btnDelete").onclick = () => deleteEvent(e.id);
      area.appendChild(card);
    }
    statusBar.textContent = `status: ready / events=${state.events.length}`;
    renderDashboard();
  }
  const renderHome = renderEvents;

  // イベント削除
  function deleteEvent(eventId) {
    if (!confirm("本当にこのイベントを削除しますか？\n（スコアやデータは完全に消去されます）")) return;
    state.events = state.events.filter(e => e.id !== eventId);
    saveState();
    renderEvents();
  }

  // イベント個別設定モーダル
  let editingEventId = null;
  function openEventSettings(eventId) {
    const ev = state.events.find(e => e.id === eventId);
    if (!ev) return;
    editingEventId = eventId;
    el("esTitle").textContent = `${ev.sportName} ${ev.gender === "M" ? "男子" : "女子"}`;
    el("esName").value = ev.sportName || "";
    el("esMatchMin").value = ev.settings?.matchMinutes || 10;
    el("esIntervalMin").value = ev.settings?.turnoverMinutes || 2;
    el("esCourts").value = ev.settings?.courts || "A,B";
    el("esStartTime").value = ev.settings?.startTime || "09:00";
    el("eventSettingsModal").classList.remove("hidden");
  }

  if (el("esClose")) el("esClose").onclick = () => {
    el("eventSettingsModal").classList.add("hidden");
    editingEventId = null;
  };
  if (el("esSave")) el("esSave").onclick = () => {
    if (!editingEventId) return;
    const ev = state.events.find(e => e.id === editingEventId);
    if (!ev) return;

    ev.sportName = el("esName").value.trim() || ev.sportName;
    if (!ev.settings) ev.settings = {};
    ev.settings.matchMinutes = Number(el("esMatchMin").value) || 10;
    ev.settings.turnoverMinutes = Number(el("esIntervalMin").value) || 2;
    ev.settings.courts = el("esCourts").value.trim() || "A,B";
    ev.settings.startTime = el("esStartTime").value || "09:00";

    recalcMatchTimes(ev);
    saveState();
    el("eventSettingsModal").classList.add("hidden");
    editingEventId = null;
    renderEvents();
    if (currentEvent && currentEvent.id === ev.id) {
      renderEventDetail(currentEvent.id);
      updateOngoingMatches();
    }
  };

  // ── Event detail ─────────────────────────────────────────────
  el("roundSel").onchange = () => renderMatchButtons();

  // ── 組み合わせ編集モーダル (ドラッグ＆ドロップ対応) ──────────────────────────────────
  let editingLoserMatchups = false;

  function openEditMatchupsModal(isLoser) {
    if (!currentEvent) return;
    const targetMatches = isLoser ? currentEvent.loserMatches : currentEvent.matches;
    if (!targetMatches) return;
    
    editingLoserMatchups = isLoser;
    const r1matches = targetMatches.filter(m => m.round === 1);
    const emList = el("emList");
    const emPool = el("emPool");
    if (!emList || !emPool) return;
    emList.innerHTML = "";
    emPool.innerHTML = "";

    // 選択肢のための全参加チーム（設定クラス or R1に出現するチーム）
    const allClasses = new Set(state.tournament.classes || []);
    const placedTeams = new Set();
    r1matches.forEach(m => {
      if (m.teamA) { allClasses.add(m.teamA); placedTeams.add(m.teamA); }
      if (m.teamB) { allClasses.add(m.teamB); placedTeams.add(m.teamB); }
    });
    const poolTeams = Array.from(allClasses).filter(c => !placedTeams.has(c)).sort();

    let draggedItem = null;

    const makeTeamItem = (teamName) => {
      if (!teamName) return null;
      const d = document.createElement("div");
      d.className = "dd-item";
      d.draggable = true;
      d.dataset.team = teamName;
      d.textContent = formatTeamName(teamName);
      d.style.cssText = "padding:6px 14px; background:#fff; border:1px solid #cbd5e1; border-radius:16px; cursor:grab; font-weight:bold; box-shadow:0 1px 2px rgba(0,0,0,0.05); user-select:none; font-size:13px;";
      d.ondragstart = (e) => {
        draggedItem = d;
        setTimeout(() => d.style.opacity = "0.4", 0);
      };
      d.ondragend = () => {
        draggedItem = null;
        d.style.opacity = "1";
      };
      return d;
    };

    const setupZone = (zone) => {
      zone.ondragover = (e) => { e.preventDefault(); zone.style.background = "#eef2ff"; zone.style.borderColor = "#818cf8"; };
      zone.ondragleave = (e) => { zone.style.background = ""; zone.style.borderColor = ""; };
      zone.ondrop = (e) => {
        e.preventDefault();
        zone.style.background = "";
        zone.style.borderColor = "";
        if (!draggedItem) return;

        if (draggedItem.parentNode === zone) return;

        if (zone.classList.contains("dd-slot")) {
          const existing = zone.querySelector(".dd-item");
          if (existing) {
            draggedItem.parentNode.appendChild(existing); // スワップ
          }
          zone.appendChild(draggedItem);
        } else {
          zone.appendChild(draggedItem);
        }
      };
    };

    setupZone(emPool);
    poolTeams.forEach(t => {
      const item = makeTeamItem(t);
      if (item) emPool.appendChild(item);
    });

    const emShuffle = el("emShuffle");
    if (emShuffle) {
      emShuffle.onclick = () => {
        const slots = el("emList").querySelectorAll(".dd-slot");
        const currentTeams = [];
        slots.forEach(s => {
          const item = s.querySelector(".dd-item");
          if (item && item.dataset.team) {
            currentTeams.push(item.dataset.team);
            item.remove();
          }
        });

        // Fisher-Yates Shuffle
        for (let i = currentTeams.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [currentTeams[i], currentTeams[j]] = [currentTeams[j], currentTeams[i]];
        }

        // 空きではなかったスロットに順番に詰め直す
        let teamIdx = 0;
        slots.forEach(s => {
          if (!s.dataset.wasEmpty) { // シャッフルボタン押下前に空だったかどうかを判定（後述の構築時に付与）
            const team = currentTeams[teamIdx++];
            if (team) {
              const item = makeTeamItem(team);
              s.appendChild(item);
            }
          }
        });
      };
    }

    r1matches.forEach(m => {
      const matchCard = document.createElement("div");
      matchCard.style.cssText = "background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:6px; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.05); width:200px; position:relative;";

      const title = document.createElement("div");
      title.className = "mono small";
      title.style.color = "var(--navy)";
      title.style.fontWeight = "bold";
      title.textContent = `Match ${m.slot + 1}`;
      title.style.marginBottom = "4px";
      matchCard.appendChild(title);

      const makeSlot = (key, team) => {
        const slot = document.createElement("div");
        slot.className = "dd-slot";
        slot.dataset.key = key;
        slot.dataset.wasEmpty = team ? "" : "true"; // 再抽選時の判定用
        slot.style.cssText = "width:100%; height:34px; background:#f8fafc; border:1.5px dashed #94a3b8; border-radius:4px; display:flex; align-items:center; justify-content:center; transition:all 0.2s;";
        setupZone(slot);
        const item = makeTeamItem(team);
        if (item) slot.appendChild(item);
        return slot;
      };

      const slotA = makeSlot(`emA_${m.slot}`, m.teamA);
      const slotB = makeSlot(`emB_${m.slot}`, m.teamB);

      matchCard.appendChild(slotA);

      const vsLine = document.createElement("div");
      vsLine.style.cssText = "width:1px; height:12px; background:#cbd5e1; margin:2px 0;";
      matchCard.appendChild(vsLine);

      matchCard.appendChild(slotB);

      // 横に繋がるような装飾（ツリー感の演出）
      const connector = document.createElement("div");
      connector.style.cssText = "position:absolute; right:-20px; top:50%; width:20px; height:1px; background:#cbd5e1; z-index:0;";
      matchCard.appendChild(connector);

      emList.appendChild(matchCard);
    });

    // emList自体のCSSをツリーっぽくオーバーライド
    emList.style.display = "flex";
    emList.style.flexDirection = "column";
    emList.style.gap = "16px";
    emList.style.alignItems = "flex-start"; // 左寄せで並べる
    emList.style.paddingLeft = "20px";

    el("emTitle").textContent = `${currentEvent.sportName} ${currentEvent.gender === "M" ? "男子" : "女子"} ${isLoser ? "（裏）" : ""}`;
    el("editMatchupsModal").classList.remove("hidden");
  }

  if (el("btnEditMatchups")) el("btnEditMatchups").onclick = () => openEditMatchupsModal(false);
  if (el("btnEditLoserMatchups")) el("btnEditLoserMatchups").onclick = () => openEditMatchupsModal(true);

  if (el("emClose")) el("emClose").onclick = () => {
    el("editMatchupsModal").classList.add("hidden");
  };

  if (el("emSave")) el("emSave").onclick = () => {
    if (!currentEvent) return;
    const targetMatches = editingLoserMatchups ? currentEvent.loserMatches : currentEvent.matches;
    if (!targetMatches) return;
    const r1matches = targetMatches.filter(m => m.round === 1);

    r1matches.forEach(m => {
      const getTeam = (key) => {
        const slot = el("emList").querySelector(`.dd-slot[data-key='${key}']`);
        if (!slot) return null;
        const item = slot.querySelector(".dd-item");
        return item ? item.dataset.team : null;
      };

      const teamA = getTeam(`emA_${m.slot}`);
      const teamB = getTeam(`emB_${m.slot}`);

      m.teamA = teamA;
      m.teamB = teamB;

      // 勝敗や状態を手動編集でリセット（一回戦のみ）
      m.scoreA = null;
      m.scoreB = null;
      m.winner = null;
      m.state = "pending";
      m.isBye = false;
    });

    // BYE auto advance R1 の再適用
    for (let i = 0; i < r1matches.length; i++) {
      const m = r1matches[i];
      if ((m.teamA && !m.teamB) || (!m.teamA && m.teamB)) {
        m.isBye = true;
        finalizeMatchLocal(targetMatches, m, m.teamA ? "A" : "B", true); // BUG-02修正: targetMatchesを使う
      } else if (!m.teamA && !m.teamB) {
        // 両方空きの場合は、親をクリア（勝者なし）
        if (m.nextMatchKey) {
          const p = findMatchByKey(targetMatches, m.nextMatchKey);
          if (m.nextSlot === "A") p.teamA = null;
          else p.teamB = null;
          p.winner = null;
          p.state = "pending";
        }
      } else {
        // 通常の試合になった場合、親の設定をクリア
        if (m.nextMatchKey) {
          const p = findMatchByKey(targetMatches, m.nextMatchKey);
          if (m.nextSlot === "A") p.teamA = null;
          else p.teamB = null;
          p.winner = null;
          p.state = "pending";
        }
      }
    }

    saveState();

    // シード変更に伴い、試合順（第〇試合）と時刻を全自動で最適化する
    if (currentEvent) {
      if (typeof window.reassignMatchesAndTimes === "function") {
        window.reassignMatchesAndTimes(currentEvent); // 既存機能があれば呼び出す
      } else {
        if (editingLoserMatchups) {
          recalcLoserMatchTimes(currentEvent);
        } else {
          resetMatchTimesLocal(currentEvent);
        }
        assignMatchNumbers(currentEvent);
      }
    }

    // 裏トーナメントがすでに存在する場合、シード構成変更に合わせて連動して再構築する（メインブラケット編集時のみ）
    if (!editingLoserMatchups && state.tournament.loserUiEnabled && currentEvent.loserMatches && currentEvent.loserMatches.length > 0) {
      const lR1 = currentEvent.matches.filter(m => m.round === 1);
      const losers = [];
      for (const m of lR1) {
        if (m.isBye) continue; // BYEによる初戦敗退チームは存在しない
        // (まだ試合が始まっていなくても、枠として確保する)
        losers.push(`__L|R1-${m.slot}__`);
      }

      const bSize = bracketSize(losers.length);
      const rounds = bracketRounds(bSize);
      const roundSizes = [];
      for (let r = 1; r <= rounds; r++) roundSizes[r] = bSize / Math.pow(2, r);

      const lMatches = [];
      for (let r = 1; r <= rounds; r++) {
        const count = roundSizes[r];
        for (let s = 0; s < count; s++) {
          const nextS = r < rounds ? Math.floor(s / 2) : null;
          const nextSlot = r < rounds ? (s % 2 === 0 ? "A" : "B") : null;
          lMatches.push({
            isLoserMatch: true, round: r, slot: s,
            teamA: null, teamB: null, scoreA: null, scoreB: null,
            winner: null, state: "pending", court: null, scheduledStart: null,
            nextMatchKey: r < rounds ? `L${r + 1}-${nextS}` : null,
            nextSlot: r < rounds ? nextSlot : null
          });
        }
      }

      // シードを分散させて割り当て
      const slots = buildBracketSeeds(bSize, [], shuffle(losers));
      for (let i = 0; i < roundSizes[1]; i++) {
        const m = lMatches.find(x => x.round === 1 && x.slot === i);
        if (m) {
          m.teamA = slots[i * 2] || null;
          m.teamB = slots[i * 2 + 1] || null;
        }
      }

      currentEvent.loserMatches = lMatches;
      saveState();
    } // end loser bracket update

    const lus = el("loserUiSection");
    if (lus) lus.style.display = "block";

    el("editMatchupsModal").classList.add("hidden");
    renderEventDetail(currentEvent.id);
    updateOngoingMatches();
  };

  if (el("btnOpenLoserModal")) el("btnOpenLoserModal").onclick = () => {
    if (!currentEvent || !currentEvent.matches) return;
    const r1 = currentEvent.matches.filter(m => m.round === 1 && !m.isBye);
    if (r1.length < 1) return alert("裏トーナメントを生成するには、1回戦の実試合が1試合以上必要です。");

    // Set default values in modal
    el("lsTeamCountSel").value = "auto";
    el("lsMatchMin").value = currentEvent.loserSettings?.matchMinutes ?? currentEvent.settings?.matchMinutes ?? 10;
    el("lsIntervalMin").value = currentEvent.loserSettings?.turnoverMinutes ?? currentEvent.settings?.turnoverMinutes ?? 2;
    el("lsCourts").value = currentEvent.loserSettings?.courts ?? currentEvent.settings?.courts ?? "A,B";
    el("lsStartTime").value = currentEvent.loserSettings?.startTime ?? "13:00";

    // ── シード試合リストを描画 ──────────────────────────────────────
    // シード = isBye=true の R1 試合（不戦勝）または R2以降でbyeから来た試合
    // 「シード初戦」= R2以降の試合のうち、片方の親がBYE試合（シードで登場）のもの
    const allM = currentEvent.matches;
    const seedList = el("lsSeedLoserList");
    seedList.innerHTML = "";

    // 保存済みの裏送り設定を読み込む
    const savedSeedLoser = new Set(currentEvent.loserSettings?.seedLoserMatchKeys || []);

    // シード試合を探す: R2以降で、「片方の親(feeder)がBYEマッチ」な試合
    const seedMatches = allM.filter(m => {
      if (m.round < 2 || m.isBye) return false;
      const key = matchKey(m);
      const feeders = allM.filter(f => f.nextMatchKey === key);
      return feeders.some(f => f.isBye);
    });

    if (seedMatches.length === 0) {
      seedList.innerHTML = '<span class="small" style="color:var(--subtle); padding:4px;">シード試合が見つかりません。ブラケットにBYE（不戦勝）がある場合に表示されます。</span>';
    } else {
      seedMatches.forEach(m => {
        const key = matchKey(m);
        // シードチーム（BYEから来る側）を特定
        const feeders = allM.filter(f => f.nextMatchKey === key);
        const byeFeeder = feeders.find(f => f.isBye);
        const seedTeam = byeFeeder ? (byeFeeder.winner === "A" ? byeFeeder.teamA : byeFeeder.teamB) : null;
        const seedSlot = byeFeeder?.nextSlot || "?";
        const opponentSlot = seedSlot === "A" ? "B" : "A";
        const opponent = m[`team${opponentSlot}`];

        const roundLabel = m.round === currentEvent.matches.reduce((mx, x) => Math.max(mx, x.round), 0)
          ? "決勝" : m.round === currentEvent.matches.reduce((mx, x) => Math.max(mx, x.round), 0) - 1
          ? "準決勝" : `${m.round}回戦`;

        const chip = document.createElement("label");
        chip.style.cssText = `
          display:inline-flex; align-items:center; gap:5px;
          background:#f5f3ff; border:1.5px solid ${savedSeedLoser.has(key) ? '#7c3aed' : '#e9d5ff'};
          border-radius:6px; padding:5px 10px; cursor:pointer; font-size:12px;
          font-weight:600; color:#5b21b6; transition:border-color .15s;
        `;
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = key;
        cb.checked = savedSeedLoser.has(key);
        cb.style.cssText = "width:13px; height:13px; accent-color:#7c3aed; cursor:pointer;";
        cb.onchange = () => {
          chip.style.borderColor = cb.checked ? "#7c3aed" : "#e9d5ff";
        };

        const numLabel = m.matchNum ? `第${m.matchNum}試合` : `${roundLabel}`;
        const teamLabel = seedTeam
          ? `${formatTeamName(seedTeam) || 'シード'} の負けを裏へ`
          : `${roundLabel} (${key}) の負けを裏へ`;

        chip.appendChild(cb);
        chip.appendChild(document.createTextNode(numLabel + " — " + teamLabel));
        seedList.appendChild(chip);
      });
    }

    el("loserSetupModal").classList.remove("hidden");
  };

  if (el("lsClose")) el("lsClose").onclick = () => el("loserSetupModal").classList.add("hidden");
  if (el("lsClose2")) el("lsClose2").onclick = () => el("loserSetupModal").classList.add("hidden");

  if (el("btnExecGenerateLoser")) el("btnExecGenerateLoser").onclick = () => {
    if (!currentEvent || !currentEvent.matches) return;

    // 大会の初戦配置（ラウンド1またはシードからの登場）から全参加チームを抽出する
    // これにより、Nチーム参加の大会でN/2規模の裏トーナメントを正しく生成する
    const allTeams = new Set();
    currentEvent.matches.forEach(m => {
      if (!m.isBye) {
        if (m.teamA) allTeams.add(m.teamA);
        else allTeams.add(`__L|R${m.round}-${m.slot}__A`);

        if (m.teamB) allTeams.add(m.teamB);
        else allTeams.add(`__L|R${m.round}-${m.slot}__B`);
      }
    });

    const r1 = currentEvent.matches.filter(m => m.round === 1);
    const realR1 = r1.filter(m => !m.isBye);
    if (realR1.length < 1) {
      alert("裏トーナメントを生成するには、1回戦の実試合が1試合以上必要です。");
      return;
    }

    const getShortDesc = (m) => `${formatTeamName(m.teamA) || '?'}v${formatTeamName(m.teamB) || '?'}`;

    const losers = [];
    for (const m of realR1) {
      const desc = getShortDesc(m);
      if (m.state === "final" && m.winner) {
        losers.push(m.winner === "A" ? (m.teamB || `__L|R1-${m.slot}|${desc}__`) : (m.teamA || `__L|R1-${m.slot}|${desc}__`));
      } else {
        losers.push(`__L|R1-${m.slot}|${desc}__`);
      }
    }

    // ── シード初戦の敗者を裏に追加 ──────────────────────────────────
    // チェックされた試合キーを収集
    const seedLoserChecked = [];
    const seedCbs = el("lsSeedLoserList")?.querySelectorAll("input[type=checkbox]:checked");
    if (seedCbs) seedCbs.forEach(cb => seedLoserChecked.push(cb.value));

    for (const key of seedLoserChecked) {
      const m = currentEvent.matches.find(mm => matchKey(mm) === key);
      if (!m) continue;
      // 既にfinaleなら実際の敗者チームを追加、未決なら「第○試合の負け」プレースホルダーを追加
      if (m.state === "final" && m.winner) {
        const loserName = m.winner === "A" ? m.teamB : m.teamA;
        losers.push(loserName || `__L|${key}__`);
      } else {
        losers.push(`__L|${key}__`);
      }
    }

    const totalParicipants = currentEvent.settings?.classes?.length || (realR1.length * 2 + currentEvent.matches.filter(m => m.round === 2 && m.isBye).length);
    const activeTeamsCount = currentEvent.settings && currentEvent.settings.classes ? currentEvent.settings.classes.length : (losers.length * 2);

    let loserBracketTargetSize = Math.max(losers.length, Math.ceil(activeTeamsCount / 2));
    const selVal = el("lsTeamCountSel")?.value || "auto";
    if (selVal !== "auto") {
      loserBracketTargetSize = parseInt(selVal, 10);
    }

    const typeMsg = selVal === "auto" ? `全 ${activeTeamsCount} チーム中、半数の ${loserBracketTargetSize} チーム規模（自動設定）` : `指定された ${loserBracketTargetSize} チーム規模`;
    if (!confirm(`${typeMsg}で裏トーナメントを生成しますか？\n(既に裏トーナメントがある場合は再生成・上書きされます)`)) return;

    const bSize = bracketSize(loserBracketTargetSize);
    const rounds = bracketRounds(bSize);
    const roundSizes = [];
    for (let r = 1; r <= rounds; r++) roundSizes[r] = bSize / Math.pow(2, r);

    const lMatches = [];
    for (let r = 1; r <= rounds; r++) {
      const count = roundSizes[r];
      for (let s = 0; s < count; s++) {
        const nextS = r < rounds ? Math.floor(s / 2) : null;
        const nextSlot = r < rounds ? (s % 2 === 0 ? "A" : "B") : null;
        lMatches.push({
          isLoserMatch: true,
          round: r, slot: s,
          teamA: null, teamB: null,
          scoreA: null, scoreB: null,
          winner: null, state: "pending",
          court: null, scheduledStart: null,
          nextMatchKey: r < rounds ? `L${r + 1}-${nextS}` : null,
          nextSlot: r < rounds ? nextSlot : null
        });
      }
    }

    const slots = buildBracketSeeds(bSize, [], shuffle(losers));
    for (let i = 0; i < roundSizes[1]; i++) {
      const m = lMatches.find(x => x.round === 1 && x.slot === i);
      m.teamA = slots[i * 2] || null;
      m.teamB = slots[i * 2 + 1] || null;
    }

    for (let i = 0; i < roundSizes[1]; i++) {
      const m = lMatches.find(x => x.round === 1 && x.slot === i);
      if ((m.teamA && !m.teamB) || (!m.teamA && m.teamB)) {
        m.isBye = true;
        finalizeMatchLocal(lMatches, m, m.teamA ? "A" : "B", true);
      }
    }

    currentEvent.loserMatches = lMatches;
    currentEvent.loserSettings = {
      matchMinutes: Number(el("lsMatchMin").value) || 10,
      turnoverMinutes: Number(el("lsIntervalMin").value) || 2,
      courts: el("lsCourts").value || "A,B",
      startTime: el("lsStartTime").value || "13:00",
      seedLoserMatchKeys: seedLoserChecked   // チェックされたシード試合キーを保存
    };

    recalcLoserMatchTimes(currentEvent);
    saveState();
    el("loserSetupModal").classList.add("hidden");
    renderEventDetail(currentEvent.id);
  };

  function recalcLoserMatchTimes(event) {
    if (!event || !event.loserMatches) return;
    const s = event.loserSettings || event.settings;
    if (!s) return;
    let startObj = parseStartTimeToDate(s.startTime || "09:00");
    const lastMainStartStr = event.matches.reduce((max, m) => m.scheduledStart > max ? m.scheduledStart : max, "0000");
    const slotMin = (Number(s.matchMinutes) || 10) + (Number(s.turnoverMinutes) || 0);

    // Default to main bracket's end if no loserSettings were initially set and main is done
    if (!event.loserSettings && lastMainStartStr !== "0000") {
      startObj = new Date(lastMainStartStr);
      startObj = new Date(startObj.getTime() + slotMin * 60000);
    }

    const courts = courtList(s);
    const courtsCount = Math.max(1, courts.length);
    let k = 0;
    const allRoundsL = [...new Set(event.loserMatches.map(m => m.round))].sort((a, b) => a - b);
    for (const r of allRoundsL) {
      const rMatches = event.loserMatches.filter(m => m.round === r).sort((a, b) => a.slot - b.slot);
      for (const m of rMatches) {
        // BUG-23修正: 裏トーナメントのBYE試合もスキップする
        if (m.isBye) {
          m.scheduledStart = null;
          m.court = null;
          continue;
        }
        const slotIdx = Math.floor(k / courtsCount);
        m.scheduledStart = new Date(startObj.getTime() + slotIdx * slotMin * 60000).toISOString();
        m.court = courts[k % courtsCount] || courts[0] || "A";
        k++;
      }
    }
    assignMatchNumbers(event);
  }

  // ── エキシビション追加 ──────────────────────────────────────────
  if (el("btnAddExhibition")) el("btnAddExhibition").onclick = () => {
    if (!currentEvent || !currentEvent.matches) return;
    const teamA = prompt("チームAの名前を入力してください（例：教員チーム）");
    if (!teamA) return;
    const teamB = prompt("チームBの名前を入力してください（例：生徒会チーム）");
    if (!teamB) return;

    pushUndoState();

    const maxSlot = Math.max(0, ...currentEvent.matches.map(m => m.slot));

    currentEvent.matches.push({
      round: 99, // Special round for exhibition
      slot: maxSlot + 1,
      isExhibition: true,
      teamA: teamA,
      teamB: teamB,
      scoreA: null,
      scoreB: null,
      winner: null,
      state: "pending",
      court: "A",
      scheduledStart: currentEvent.matches[0]?.scheduledStart || new Date().toISOString()
    });

    assignMatchNumbers(currentEvent);
    saveState();
    renderEventDetail(currentEvent.id);
  };

  // ── 3位決定戦 ──────────────────────────────────────────
  if (el("btnAddThirdPlace")) el("btnAddThirdPlace").onclick = () => {
    if (!currentEvent) return;
    window.generateThirdPlaceMatch(currentEvent);
  };

  // ── タイムテーブル・順序編集モーダル ──────────────────────────────────
  if (el("btnEditSchedule")) el("btnEditSchedule").onclick = () => {
    if (!currentEvent || !currentEvent.matches) return;
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const list = [...allM].sort((a, b) => {
      const ta = a.scheduledStart || "", tb = b.scheduledStart || "";
      return ta < tb ? -1 : ta > tb ? 1 : (a.court || "").localeCompare(b.court || "");
    });

    const esList = el("eschedList");
    if (!esList) return;
    esList.innerHTML = "";

    list.forEach(m => {
      if (m.isBye) return;
      const row = document.createElement("div");
      row.className = "row";
      row.style.cssText = "gap:8px; align-items:center; padding:4px 6px; border-radius:6px; transition:background 0.15s; cursor:grab;";
      row.dataset.matchKey = matchKey(m);

      // ── ドラッグハンドル ──
      const handle = document.createElement("span");
      handle.textContent = "⠿";
      handle.style.cssText = "cursor:grab; color:var(--muted); font-size:18px; padding:0 2px; flex-shrink:0; user-select:none;";
      handle.title = "ドラッグして並び替え";

      const label = document.createElement("span");
      label.style.cssText = "width:68px; font-size:12px; flex-shrink:0;";
      label.className = "mono esched-label";
      label.textContent = currentEvent.format === "league"
        ? `リーグG${m.slot + 1}`
        : (m.matchNum ? `第${m.matchNum}試合` : `${m.isLoserMatch ? "裏" : ""}R${m.round}-${m.slot + 1}`);

      const tInput = document.createElement("input");
      tInput.type = "time";
      tInput.value = fmtTime(m.scheduledStart) || "";
      tInput.style.cssText = "width:90px; flex-shrink:0;";

      const cInput = document.createElement("input");
      cInput.type = "text";
      cInput.value = m.court || "";
      cInput.style.cssText = "width:54px; flex-shrink:0;";

      const vsLbl = document.createElement("span");
      vsLbl.className = "small";
      vsLbl.style.cssText = "flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
      vsLbl.textContent = `${displayTeam(allM, m, "A")} vs ${displayTeam(allM, m, "B")}`;

      const btnUp = document.createElement("button");
      btnUp.textContent = "↑";
      btnUp.className = "ghost";
      btnUp.style.cssText = "padding:3px 7px; font-size:12px; flex-shrink:0;";
      // --- UIの並び（DOM要素順）をもとに時間とラベルを上から自動で振り直す関数 ---
      const updateTimesAndLabels = () => {
        const rows = [...esList.querySelectorAll("[data-match-key]")];
        if (rows.length === 0) return;

        const startStr = currentEvent.settings?.startTime || "09:00";
        const parts = startStr.split(":");
        const bD = new Date();
        bD.setHours(parseInt(parts[0], 10) || 9, parseInt(parts[1], 10) || 0, 0, 0);
        let currentMs = bD.getTime();

        const slotMin = (Number(currentEvent.settings?.matchMinutes) || 10) + (Number(currentEvent.settings?.turnoverMinutes) || 0);
        const courts = courtList(currentEvent.settings);
        const courtsCount = Math.max(1, courts.length);

        rows.forEach((r, idx) => {
          // 試合番号ラベルの更新
          const lbl = r.querySelector(".esched-label");
          if (lbl) lbl.textContent = `第${idx + 1}試合`;

          // 時間の更新 (コート数に応じて時間を進める)
          const slotIdx = Math.floor(idx / courtsCount);
          const tDate = new Date(currentMs + slotIdx * slotMin * 60000);
          const tInputElem = r.querySelector("input[type=time]");
          if (tInputElem) {
            tInputElem.value = String(tDate.getHours()).padStart(2, "0") + ":" + String(tDate.getMinutes()).padStart(2, "0");
          }
        });
      };

      btnUp.onclick = () => {
        const prev = row.previousElementSibling;
        if (prev) {
          esList.insertBefore(row, prev);
          updateTimesAndLabels();
        }
      };
      const btnDown = document.createElement("button");
      btnDown.textContent = "↓";
      btnDown.className = "ghost";
      btnDown.style.cssText = "padding:3px 7px; font-size:12px; flex-shrink:0;";
      btnDown.onclick = () => {
        const next = row.nextElementSibling;
        if (next) {
          esList.insertBefore(next, row);
          updateTimesAndLabels();
        }
      };

      // ── DragDrop ──
      row.draggable = true;
      row.ondragstart = (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", matchKey(m));
        setTimeout(() => row.style.opacity = "0.4", 0);
      };
      row.ondragend = () => { row.style.opacity = "1"; row.classList.remove("dnd-over"); };
      row.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; row.classList.add("dnd-over"); };
      row.ondragleave = (e) => { if (!row.contains(e.relatedTarget)) row.classList.remove("dnd-over"); };
      row.ondrop = (e) => {
        e.preventDefault();
        row.classList.remove("dnd-over");
        const srcKey = e.dataTransfer.getData("text/plain");
        if (!srcKey || srcKey === matchKey(m)) return;
        const srcRow = esList.querySelector(`[data-match-key="${srcKey}"]`);
        if (srcRow) {
          // Swap the DOM nodes
          const placeholder = document.createElement('div');
          esList.insertBefore(placeholder, row);
          esList.insertBefore(row, srcRow);
          esList.insertBefore(srcRow, placeholder);
          esList.removeChild(placeholder);
          updateTimesAndLabels();
        }
      };

      row.appendChild(handle);
      row.appendChild(label);
      row.appendChild(tInput);
      row.appendChild(cInput);
      row.appendChild(btnUp);
      row.appendChild(btnDown);
      row.appendChild(vsLbl);
      esList.appendChild(row);
    });

    el("eschedTitle").textContent = `${currentEvent.sportName} ${currentEvent.gender === "M" ? "男子" : "女子"}`;
    el("editScheduleModal").classList.remove("hidden");
  };

  if (el("eschedClose")) el("eschedClose").onclick = () => el("editScheduleModal").classList.add("hidden");

  if (el("eschedAuto")) el("eschedAuto").onclick = () => {
    if (!confirm("手動で設定した時間はリセットされ、設定通りの間隔で再計算されます。よろしいですか？")) return;
    recalcMatchTimes(currentEvent);
    if (currentEvent.loserMatches) recalcLoserMatchTimes(currentEvent);
    saveState();
    el("editScheduleModal").classList.add("hidden");
    renderEventDetail(currentEvent.id);
  };

  // タイムテーブル保存: DOM順をそのまま試合順として適用
  const eschedSave = el("eschedSave");
  if (eschedSave) eschedSave.onclick = () => {
    if (!currentEvent || !currentEvent.matches) return;
    pushUndoState();
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const dStr = state.tournament.date || new Date().toISOString().slice(0, 10);

    const rows = el("eschedList").querySelectorAll("[data-match-key]");
    let orderIdx = 0;
    rows.forEach(row => {
      const key = row.dataset.matchKey;
      const m = allM.find(x => matchKey(x) === key);
      if (!m || m.isBye) return;
      const tInput = row.querySelector("input[type=time]");
      const cInput = row.querySelector("input[type=text]");
      if (tInput && cInput) {
        if (tInput.value) {
          const [hh, mm] = tInput.value.split(":").map(Number);
          const d = new Date(dStr); d.setHours(hh, mm, 0, 0);
          m.scheduledStart = d.toISOString();
        } else {
          const d = new Date(dStr); d.setHours(23, 59, 0, 0);
          m.scheduledStart = d.toISOString();
        }
        m.court = cInput.value.trim() || undefined;
      }
      m.matchNum = ++orderIdx; // DOM順 = 試合番号順
    });
    saveState();
    el("editScheduleModal").classList.add("hidden");
    renderEventDetail(currentEvent.id);
    updateOngoingMatches();
  };


  function openEvent(eventId) {
    currentEvent = state.events.find(e => e.id === eventId) || null;
    if (!currentEvent) return alert("イベントが見つかりません。生成し直してください。");
    // BUG-06修正: イベント切り替え時にUndoスタックをクリア
    undoStack.length = 0;
    updateUndoUI();

    const idx = state.events.findIndex(e => e.id === eventId);
    const btnPrev = el("btnPrevEvent");
    const btnNext = el("btnNextEvent");
    if (btnPrev) {
      btnPrev.disabled = idx <= 0;
      btnPrev.onclick = () => openEvent(state.events[idx - 1].id);
    }
    if (btnNext) {
      btnNext.disabled = idx >= state.events.length - 1;
      btnNext.onclick = () => openEvent(state.events[idx + 1].id);
    }

    // ナビゲーションチップの描画
    const chipsBox = el("eventNavChips");
    if (chipsBox) {
      chipsBox.innerHTML = "";
      const docs = [...state.events].sort((a, b) =>
        (a.sportName || "").localeCompare(b.sportName || "") || (a.gender || "").localeCompare(b.gender || "")
      );
      docs.forEach(e => {
        const btn = document.createElement("button");
        btn.textContent = `${e.sportName} ${e.gender === "M" ? "男子" : "女子"}`;
        if (e.id === eventId) btn.classList.add("active");
        btn.onclick = () => openEvent(e.id);
        chipsBox.appendChild(btn);
      });
    }

    el("eventTitle").textContent = `${currentEvent.sportName} ${currentEvent.gender === "M" ? "男子" : "女子"}`;
    el("eventMeta").textContent = `${state.tournament.name} / ${state.tournament.date || ""} / ${state.tournament.place || ""}`;

    // クイック設定に現在値を反映
    if (el("qsMatchMin")) el("qsMatchMin").value = currentEvent.settings?.matchMinutes || 10;
    if (el("qsIntervalMin")) el("qsIntervalMin").value = currentEvent.settings?.turnoverMinutes || 2;

    setDebug("");
    selectedMatchKey = null;
    show("eventView");
    setEventPane("bracket");
    renderMatchButtons();
    bindUiPanel();
    bindResultModal();
  }

  function renderEventDetail(eventId) {
    currentEvent = state.events.find(e => e.id === eventId) || null;
    renderBracket();
    renderMatchButtons();
  }

  // BUG-05修正: ブラウザ外でマウスを離した場合にもD&D変数をリセット
  document.addEventListener("mouseup", () => { window.__draggedTeam = null; });

  // ── Bracket SVG ──────────────────────────────────────────────
  // コネクター構造（1試合につき4要素）:
  //   armA  : Aチーム枠中心 → 上へ juncY まで
  //   armB  : Bチーム枠中心 → 上へ juncY まで
  //   hbar  : juncY でAとBを横に繋ぐ
  //   trunk : hbar中心 → 水平移動 → 親マッチ下端
  function buildBracketSVG(matches, uiOverride) {
    // エキシビション試合を除外（round>=99）
    matches = matches.filter(m => !m.isExhibition);
    const ui = uiOverride || state.tournament?.bracketUI || {};
    const fontSize = Number(ui.fontSize ?? 13);
    const totalW = Number(ui.totalW ?? 130);
    const boxH = Number(ui.boxH ?? 38);  // 時間表示のため高さを増やす
    const gapX = Number(ui.gapX ?? 8);
    const roundGapY = Number(ui.roundGapY ?? 130);
    const midGap = Number(ui.midGap ?? 12);
    const branchLen = Math.min(Number(ui.branchLen ?? 36), roundGapY - boxH - 4);

    const allRounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
    const rounds = allRounds[allRounds.length - 1] || 5;
    const roundMatchCount = {};
    for (const r of allRounds) roundMatchCount[r] = matches.filter(m => m.round === r).length;

    const padX = 28;
    const padTop = 50;
    const padBottom = 30;
    const sideW = (totalW - midGap) / 2;
    const labelW = 28;

    // Y: R1 が下、最終ラウンドが上
    // 上のラウンドから下へ降りながらY座標を計算する。各段の手動間隔が設定されていればそれを使用。
    const yRound = {};
    let currentY = padTop;
    for (let r = rounds; r >= 1; r--) {
      yRound[r] = currentY;
      if (r > 1) {
        // r から r-1 への間隔（つまり R(r-1) と R(r) の間隔）
        const idx = r - 1;
        let custom = 0;
        if (idx === 1) custom = Number(ui.gapY1 ?? 0);
        else if (idx === 2) custom = Number(ui.gapY2 ?? 0);
        else if (idx === 3) custom = Number(ui.gapY3 ?? 0);
        else if (idx >= 4) custom = Number(ui.gapY4 ?? 0);

        if (custom > 0) {
          currentY += custom;
        } else {
          // 手動設定がない場合は自動（階層が下がるほど広く）
          const multiplier = (rounds - r) + 1;
          currentY += roundGapY * multiplier * 0.7;
        }
      }
    }

    // X: 子の中心が親の中心の真下（完全なピラミッドを作るため、m.slotベースで絶対配置）
    const xPos = {};
    for (let r = 1; r <= rounds; r++) {
      const step = (totalW + gapX) * Math.pow(2, r - 1);
      const startX = labelW + padX + (step / 2 - totalW / 2);
      const matchesInR = matches.filter(m => m.round === r);
      matchesInR.forEach(m => {
        xPos[matchKey(m)] = startX + m.slot * step;
      });
    }

    // ピラミッド全体をSVGの左右中央にキレイに配置するため、決勝戦（ルート）の中心座標を基準にする
    let actualMaxX = 0;
    for (const k in xPos) actualMaxX = Math.max(actualMaxX, xPos[k] + totalW);

    let rootCX = 0;
    const finalM = matches.find(m => m.round === rounds);
    if (finalM && xPos[matchKey(finalM)] !== undefined) {
      rootCX = xPos[matchKey(finalM)] + totalW / 2;
    }

    // rootCX の2倍を横幅にすることでルートが完全にSVGの中央になる
    const svgW = Math.max(actualMaxX + padX, rootCX * 2);
    const svgH = currentY + boxH + padBottom;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", svgW);
    svg.setAttribute("height", svgH);
    svg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);
    svg.style.display = "block";
    svg.style.margin = "0 auto";

    const byKey = {};
    matches.forEach(m => byKey[matchKey(m)] = m);

    const shorten = (s, hasCheck = false) => {
      s = formatTeamName(s);
      if (!s) return "—";
      
      // Checkmarkや「の負け」があればそのまま表示（はみ出しを許容）
      if (hasCheck || s.includes("の負け")) {
        return s + (hasCheck ? " ✓" : "");
      }
      
      const max = Math.max(4, Math.floor(sideW / (fontSize * 0.63)));
      return s.length > max ? s.slice(0, Math.max(1, max - 1)) + "…" : s;
    };

    // 位置ヘルパ
    const leftX = (x) => x;
    const rightX = (x) => x + sideW + midGap;
    const lCX = (x) => x + sideW / 2;            // Aサブ枠中心X
    const rCX = (x) => x + sideW + midGap + sideW / 2; // Bサブ枠中心X
    const mCX = (x) => x + totalW / 2;           // マッチ全体中心X

    // SVGパス（ボックスの背面に挿入）
    const mkPath = (d, cls) => {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      p.setAttribute("class", cls);
      svg.insertBefore(p, svg.firstChild);
    };

    // ── ラウンドラベル ────────────────────────────────────────
    for (let r = 1; r <= rounds; r++) {
      let minX = svgW;
      const matchesInR = matches.filter(m => m.round === r);
      matchesInR.forEach(m => {
        const mx = xPos[matchKey(m)];
        if (mx !== undefined && mx < minX) minX = mx;
      });
      if (minX === svgW) minX = 4;

      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", minX + 2);
      t.setAttribute("y", yRound[r] - 6);
      t.setAttribute("class", "roundLabel");
      t.setAttribute("font-size", "12");
      t.setAttribute("fill", "#64748b");
      t.setAttribute("font-weight", "700");
      const diff = rounds - r;
      t.textContent = diff === 0 ? "決勝" : diff === 1 ? "準決勝" : diff === 2 ? "準々決勝" : `Round ${r}`;
      svg.appendChild(t);
    }

    // ── コネクター（win ライン完全追跡） ─────────────────────────
    const innerBranch = Math.max(8, Math.round(branchLen * 0.42));
    const junctionsByParent = {};

    for (const m of matches) {
      const r = m.round;
      if (r >= Math.max(...allRounds)) continue; // 決勝は親へ繋ぐ線がない
      const childKey = matchKey(m);
      const parentKey = m.nextMatchKey;
      if (!parentKey) continue;

      const cx = xPos[childKey];
      const cy = yRound[r];

      const parentRound = parseInt(parentKey.replace("R", "").replace("L", "").split("-")[0]);
      const parentEndY = yRound[parentRound] + boxH;
      const actualGap = cy - parentEndY;

      const currentBranchLen = Math.min(branchLen, Math.max(0, actualGap - 4));
      const currentInnerBranch = Math.max(4, Math.round(currentBranchLen * 0.42));

      const juncY1 = cy - currentInnerBranch;
      const juncY2 = cy - currentBranchLen;
      const isFinal = m?.state === "final" && m?.winner;
      const winA = isFinal && m.winner === "A";
      const winB = isFinal && m.winner === "B";
      const isBye = m?.isBye === true;

      if (isBye) {
        // BYEの場合は、中央から真っ直ぐ上に線を引く（T字の交差点や分岐を描画しない）
        // 勝者は確定しているものとして緑線
        mkPath(`M ${mCX(cx)} ${cy} V ${juncY2}`, "line win");
        if (!junctionsByParent[parentKey]) junctionsByParent[parentKey] = [];
        junctionsByParent[parentKey].push({ x: mCX(cx), juncY: juncY2, isFinal: true });
      } else {
        // armA / armB
        mkPath(`M ${lCX(cx)} ${cy} V ${juncY1}`, winA ? "line win" : "line");
        mkPath(`M ${rCX(cx)} ${cy} V ${juncY1}`, winB ? "line win" : "line");

        // hbar を中央(mCX)で2分割 → 勝者側だけ緑
        mkPath(`M ${lCX(cx)} ${juncY1} H ${mCX(cx)}`, winA ? "line win" : "line");
        mkPath(`M ${mCX(cx)} ${juncY1} H ${rCX(cx)}`, winB ? "line win" : "line");

        // stem（勝者確定なら緑）
        mkPath(`M ${mCX(cx)} ${juncY1} V ${juncY2}`, isFinal ? "line win" : "line");

        if (!junctionsByParent[parentKey]) junctionsByParent[parentKey] = [];
        junctionsByParent[parentKey].push({ x: mCX(cx), juncY: juncY2, isFinal });
      }
    }

    for (const [parentKey, children] of Object.entries(junctionsByParent)) {
      children.sort((a, b) => a.x - b.x);
      const x0 = children[0].x;
      const x1 = children[children.length - 1].x;
      const juncY = children[0].juncY;
      const midX = (x0 + x1) / 2;
      const parentRound = parseInt(parentKey.replace("R", "").replace("L", "").split("-")[0]);
      const endY = yRound[parentRound] + boxH;
      const leftWin = children[0]?.isFinal ?? false;
      const rightWin = children[1]?.isFinal ?? false;

      if (children.length >= 2) {
        // bridge を midX で2分割 → 勝者側だけ緑
        mkPath(`M ${x0} ${juncY} H ${midX}`, leftWin ? "line win" : "line");
        mkPath(`M ${midX} ${juncY} H ${x1}`, rightWin ? "line win" : "line");
      }
      mkPath(`M ${midX} ${juncY} V ${endY}`, (leftWin || rightWin) ? "line win" : "line");
    }


    // ── ボックス + テキスト ────────────────────────────────────
    for (const m of matches) {
      const r = m.round;
      const key = matchKey(m);
      const x = xPos[key];
      const y = yRound[r];
      if (x === undefined) continue;
      const hasScore = (m.scoreA != null && m.scoreB != null);

      const isBye = m.isBye === true;
      if (isBye) {
        // BYEの場合は1チーム分の枠だけを中央に描画する
        const winner = m.winner === "A" ? m.teamA : m.teamB;
        const boxW = totalW * 0.7; // 少し狭めの単一ボックス
        const bx = x + (totalW - boxW) / 2;

        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", bx); rect.setAttribute("y", y);
        rect.setAttribute("width", boxW); rect.setAttribute("height", boxH);
        rect.setAttribute("rx", 6);
        rect.setAttribute("fill", "#ffffff");
        rect.setAttribute("stroke", "rgba(22,163,74,.4)");
        rect.setAttribute("stroke-width", "1.5");
        svg.appendChild(rect);

        // チーム名
        const bt = document.createElementNS(ns, "text");
        bt.setAttribute("x", x + totalW / 2);
        bt.setAttribute("y", y + boxH / 2 + 1);
        bt.setAttribute("text-anchor", "middle");
        bt.setAttribute("dominant-baseline", "middle");
        bt.setAttribute("font-size", String(fontSize));
        bt.setAttribute("font-weight", "700");
        bt.setAttribute("fill", "#111827");
        bt.textContent = shorten(winner || "?");
        svg.appendChild(bt);

        // 右上に小さな「シード」バッジ
        const badgeW2 = 26, badgeH2 = 12;
        const bBadgeX = bx + boxW - badgeW2 + 4;
        const bBadgeY = y - 6;
        const bBadgeBg = document.createElementNS(ns, "rect");
        bBadgeBg.setAttribute("x", bBadgeX); bBadgeBg.setAttribute("y", bBadgeY);
        bBadgeBg.setAttribute("width", badgeW2); bBadgeBg.setAttribute("height", badgeH2);
        bBadgeBg.setAttribute("rx", 6);
        bBadgeBg.setAttribute("fill", "#22c55e");
        svg.appendChild(bBadgeBg);
        const bBadgeTxt = document.createElementNS(ns, "text");
        bBadgeTxt.setAttribute("x", bBadgeX + badgeW2 / 2);
        bBadgeTxt.setAttribute("y", bBadgeY + badgeH2 / 2 + 0.5);
        bBadgeTxt.setAttribute("text-anchor", "middle");
        bBadgeTxt.setAttribute("dominant-baseline", "middle");
        bBadgeTxt.setAttribute("font-size", "7.5");
        bBadgeTxt.setAttribute("font-weight", "800");
        bBadgeTxt.setAttribute("fill", "#ffffff");
        bBadgeTxt.textContent = "BYE";
        svg.appendChild(bBadgeTxt);
        continue;
      }

      // 全体クリック（selectMatch）+ ダブルクリック（結果入力）
      const hlBox = document.createElementNS(ns, "rect");
      hlBox.id = `match-hl-${key}`;
      hlBox.setAttribute("x", x - 2); hlBox.setAttribute("y", y - 2);
      hlBox.setAttribute("width", totalW + 4); hlBox.setAttribute("height", boxH + 4);
      hlBox.setAttribute("rx", 8);
      hlBox.setAttribute("fill", "none");
      hlBox.setAttribute("class", "hlBox hidden");
      hlBox.style.pointerEvents = "none";
      svg.appendChild(hlBox);

      const matchG = document.createElementNS(ns, "g");
      matchG.style.cursor = "pointer";

      const hit = document.createElementNS(ns, "rect");
      hit.id = `match-hit-${key}`;
      hit.setAttribute("x", x); hit.setAttribute("y", y);
      hit.setAttribute("width", totalW); hit.setAttribute("height", boxH);
      hit.setAttribute("fill", "transparent");
      matchG.appendChild(hit);

      matchG.addEventListener("click", () => selectMatch(key));
      matchG.addEventListener("dblclick", ev => { ev.stopPropagation(); openResultModal(key); });

      // Match time reordering drag and drop
      if (ui.showTime !== false) {
        matchG.addEventListener("mousedown", (e) => {
          window.__draggedTeam = { matchKey: key, type: "match" };
        });
        matchG.addEventListener("mouseup", (e) => {
          if (window.__draggedTeam && window.__draggedTeam.type === "match") {
            handleDropSwap(window.__draggedTeam, { matchKey: key, type: "match" });
          }
        });
      }

      svg.appendChild(matchG);

      // --- Drag & Drop 処理開始 ---
      // R1であり、かつ試合が開始・確定していない場合のみチーム名単位ではなく試合枠単位でのスワップを検知するための処理
      // ただしA/B個別の枠（sideBox）に対してイベントを張る

      // 勝者ハイライト
      if (m.winner) {
        const hl = document.createElementNS(ns, "rect");
        hl.setAttribute("x", m.winner === "A" ? leftX(x) + 1 : rightX(x) + 1);
        hl.setAttribute("y", y + 1);
        hl.setAttribute("width", sideW - 2); hl.setAttribute("height", boxH - 2);
        hl.setAttribute("rx", 6); hl.setAttribute("fill", "rgba(22,163,74,.12)");
        matchG.appendChild(hl);
      }

      const isOvertime = typeof isMatchOvertime === 'function' ? isMatchOvertime(m, new Date(), (currentEvent.settings?.matchMinutes || 10) + (currentEvent.settings?.turnoverMinutes || 2)) : false;
      let stClass = m.state === "calling" ? "match-calling" : m.state === "playing" ? "match-playing" : (m.state || "pending");
      if (isOvertime) stClass += " overtime-pulse";

      // Aボックス
      const rectA = document.createElementNS(ns, "rect");
      rectA.setAttribute("x", leftX(x)); rectA.setAttribute("y", y);
      rectA.setAttribute("width", sideW); rectA.setAttribute("height", boxH);
      rectA.setAttribute("rx", 6);
      rectA.setAttribute("class", `sideBox ${stClass} ${selectedMatchKey === key ? "selected" : ""}`);
      // Drag events for A
      if (r === 1 && m.state === "pending") {
        rectA.style.cursor = "grab";
        let tAtext = m.teamA;
        rectA.addEventListener("mousedown", (e) => {
          e.stopPropagation();
          window.__draggedTeam = { matchKey: key, slot: "A", teamName: tAtext, type: "team" };
        });
        rectA.addEventListener("mouseup", (e) => {
          e.stopPropagation();
          if (window.__draggedTeam && window.__draggedTeam.type === "team") {
            handleDropSwap(window.__draggedTeam, { matchKey: key, slot: "A", teamName: tAtext, type: "team" });
          }
        });
      }
      matchG.appendChild(rectA);

      // Bボックス
      const rectB = document.createElementNS(ns, "rect");
      rectB.setAttribute("x", rightX(x)); rectB.setAttribute("y", y);
      rectB.setAttribute("width", sideW); rectB.setAttribute("height", boxH);
      rectB.setAttribute("rx", 6);
      rectB.setAttribute("class", `sideBox ${stClass} ${selectedMatchKey === key ? "selected" : ""}`);
      // Drag events for B
      if (r === 1 && m.state === "pending") {
        rectB.style.cursor = "grab";
        let tBtext = m.teamB;
        rectB.addEventListener("mousedown", (e) => {
          e.stopPropagation();
          window.__draggedTeam = { matchKey: key, slot: "B", teamName: tBtext, type: "team" };
        });
        rectB.addEventListener("mouseup", (e) => {
          e.stopPropagation();
          if (window.__draggedTeam && window.__draggedTeam.type === "team") {
            handleDropSwap(window.__draggedTeam, { matchKey: key, slot: "B", teamName: tBtext, type: "team" });
          }
        });
      }
      matchG.appendChild(rectB);

      // スコアがあれば中央に表示（"vs"と入れ替え）
      const time = fmtTime(m.scheduledStart);
      const upperMid = time ? y + (boxH - 13) / 2 : y + boxH / 2;
      const centerTxt = document.createElementNS(ns, "text");
      centerTxt.setAttribute("x", mCX(x));
      centerTxt.setAttribute("y", upperMid);
      centerTxt.setAttribute("text-anchor", "middle");
      centerTxt.setAttribute("dominant-baseline", "middle");
      if (hasScore) {
        centerTxt.setAttribute("font-size", "9");
        centerTxt.setAttribute("fill", "#475569");
        centerTxt.setAttribute("font-weight", "700");
        centerTxt.textContent = `${m.scoreA}-${m.scoreB}`;
      } else {
        centerTxt.setAttribute("class", "vsTxt");
        centerTxt.setAttribute("font-size", "10");
        centerTxt.textContent = "vs";
      }
      matchG.appendChild(centerTxt);

      // チームA名（ ✓ がある場合は左へはみ出すように右寄せ配置）
      const nameY = hasScore ? y + (boxH - (time ? 13 : 0)) * 0.34 : upperMid;
      const tA = document.createElementNS(ns, "text");
      const hasCheckA = m.winner === "A";
      if (hasCheckA) {
        tA.setAttribute("x", leftX(x) + sideW - 5);
        tA.setAttribute("text-anchor", "end");
      } else {
        tA.setAttribute("x", leftX(x) + 5);
        tA.setAttribute("text-anchor", "start");
      }
      tA.setAttribute("y", nameY);
      tA.setAttribute("dominant-baseline", "middle");
      tA.setAttribute("class", "teamTxtH" + (m.teamA ? "" : " subtle"));
      tA.setAttribute("font-size", String(fontSize));
      tA.setAttribute("font-weight", hasCheckA ? "900" : "500");
      
      const textA = shorten(m.teamA, hasCheckA);
      if (textA.includes("\n")) {
        const parts = textA.split("\n");
        parts.forEach((p, idx) => {
          const tspan = document.createElementNS(ns, "tspan");
          tspan.textContent = p;
          tspan.setAttribute("x", tA.getAttribute("x"));
          tspan.setAttribute("dy", idx === 0 ? `-${fontSize * 0.45}` : `${fontSize * 1.1}`);
          tA.appendChild(tspan);
        });
      } else {
        tA.textContent = textA;
      }
      matchG.appendChild(tA);

      // チームB名（ ✓ がある場合は右へはみ出すように左寄せ配置）
      const tB = document.createElementNS(ns, "text");
      const hasCheckB = m.winner === "B";
      if (hasCheckB) {
        tB.setAttribute("x", rightX(x) + 5);
        tB.setAttribute("text-anchor", "start");
      } else {
        tB.setAttribute("x", rightX(x) + sideW - 5);
        tB.setAttribute("text-anchor", "end");
      }
      tB.setAttribute("y", nameY);
      tB.setAttribute("dominant-baseline", "middle");
      tB.setAttribute("class", "teamTxtH" + (m.teamB ? "" : " subtle"));
      tB.setAttribute("font-size", String(fontSize));
      tB.setAttribute("font-weight", hasCheckB ? "900" : "500");
      
      const textB = shorten(m.teamB, hasCheckB);
      if (textB.includes("\n")) {
        const parts = textB.split("\n");
        parts.forEach((p, idx) => {
          const tspan = document.createElementNS(ns, "tspan");
          tspan.textContent = p;
          tspan.setAttribute("x", tB.getAttribute("x"));
          tspan.setAttribute("dy", idx === 0 ? `-${fontSize * 0.45}` : `${fontSize * 1.1}`);
          tB.appendChild(tspan);
        });
      } else {
        tB.textContent = textB;
      }
      matchG.appendChild(tB);

      // 時刻ラベル（バッジスタイル）
      if ((time || m.matchNum) && ui.showTime !== false) {
        const numStr = m.matchNum ? `第${m.matchNum}試合` : "";
        const timeLabel = `${numStr} ${time || ""}${m.court ? "·" + m.court : ""}`.trim();
        const timeFontSz = Number(ui.timeFontSize ?? 9);
        const badgeW = timeLabel.length * timeFontSz * 0.62 + 10;
        const badgeH = timeFontSz + 5;
        const badgeX = x + totalW / 2 - badgeW / 2;
        const badgeY = y + boxH - badgeH - 2 + (ui.timeY || 0);
        const bg = document.createElementNS(ns, "rect");
        bg.setAttribute("x", badgeX); bg.setAttribute("y", badgeY);
        bg.setAttribute("width", badgeW); bg.setAttribute("height", badgeH);
        bg.setAttribute("rx", badgeH / 2);
        bg.setAttribute("fill", "#eff6ff");
        bg.setAttribute("stroke", "#bfdbfe");
        bg.setAttribute("stroke-width", "1");
        matchG.appendChild(bg);
        const meta = document.createElementNS(ns, "text");
        meta.setAttribute("x", x + totalW / 2);
        meta.setAttribute("y", badgeY + badgeH / 2 + 0.5);
        meta.setAttribute("text-anchor", "middle");
        meta.setAttribute("dominant-baseline", "middle");
        meta.setAttribute("font-size", String(timeFontSz));
        meta.setAttribute("fill", "#2563eb");
        meta.setAttribute("font-family", "ui-monospace, monospace");
        meta.setAttribute("font-weight", "700");
        meta.textContent = timeLabel;
        matchG.appendChild(meta);
      }
    }

    return svg;
  }

  // ── 横向きブラケット（R1が左・決勝が右） ─────────────────────
  function buildHorizontalBracketSVG(matches, uiOverride) {
    matches = matches.filter(m => !m.isExhibition);
    const ui = uiOverride || state.tournament?.bracketUI || {};
    const fontSize = Number(ui.fontSize ?? 13);
    const boxW = Number(ui.totalW ?? 140);
    const boxH = Number(ui.boxH ?? 28);
    const gapX = Number(ui.roundGapY ?? 90);
    const gapY = Number(ui.gapX ?? 8);
    const branchLen = Number(ui.branchLen ?? 30);

    const allRounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
    const maxRound = allRounds[allRounds.length - 1] || 1;
    const isLoser = matches.length > 0 && matches[0].isLoserMatch;
    const prefix = isLoser ? "L" : "R";
    const roundMatchCount = {};
    for (const r of allRounds) roundMatchCount[r] = matches.filter(m => m.round === r).length;

    const pad = 20;
    const matchH = boxH * 2 + gapY;

    const yOfMatch = {};
    // R1 → 決勝の順に処理: R1は等間隔配置、以降のラウンドは子試合のY中心に配置
    for (const r of allRounds) {
      const matchesInR = matches.filter(m => m.round === r).sort((a, b) => a.slot - b.slot);
      for (let i = 0; i < matchesInR.length; i++) {
        const m = matchesInR[i];
        const key = matchKey(m);
        if (r === allRounds[0]) {
          yOfMatch[key] = pad + i * (matchH + gapY * 2);
        } else {
          const children = matches.filter(cm => cm.nextMatchKey === key);
          if (children.length === 2) {
            const yA = yOfMatch[matchKey(children[0])];
            const yB = yOfMatch[matchKey(children[1])];
            yOfMatch[key] = (yA !== undefined && yB !== undefined) ? (yA + yB) / 2 : (yA ?? yB ?? (pad + i * (matchH + gapY * 2)));
          } else if (children.length === 1) {
            yOfMatch[key] = yOfMatch[matchKey(children[0])] ?? (pad + i * (matchH + gapY * 2));
          } else {
            yOfMatch[key] = pad + i * (matchH + gapY * 2);
          }
        }
      }
    }

    const xOfRound = {};
    let curX = pad;
    for (let i = 0; i < allRounds.length; i++) {
      const r = allRounds[i];
      xOfRound[r] = curX;
      if (i < allRounds.length - 1) {
        const idx = r; // r から r+1 への間隔は gapX{r} で指定
        let customGap = 0;
        if (idx === 1) customGap = Number(ui.gapX1 ?? 0);
        else if (idx === 2) customGap = Number(ui.gapX2 ?? 0);
        else if (idx === 3) customGap = Number(ui.gapX3 ?? 0);
        else if (idx >= 4) customGap = Number(ui.gapX4 ?? 0);
        curX += boxW + (customGap > 0 ? customGap : gapX);
      }
    }

    const r1Count = roundMatchCount[allRounds[0]] || 0;
    const totalH = Math.max(200, pad * 2 + r1Count * (matchH + gapY * 2));
    const lastRound = allRounds[allRounds.length - 1];
    const totalW = (xOfRound[lastRound] ?? 0) + boxW + pad;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", totalW); svg.setAttribute("height", totalH);
    svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
    svg.style.display = "block";

    const byKey = {};
    matches.forEach(m => { byKey[matchKey(m)] = m; });

    const shn = (s, txt) => {
      let name = formatTeamName(s);
      if (!name) {
        txt.textContent = "—";
        return;
      }
      // 「の負け」があれば改行表示
      if (name.includes("\n")) {
        const parts = name.split("\n");
        parts.forEach((p, idx) => {
          const tspan = document.createElementNS(ns, "tspan");
          tspan.textContent = p;
          tspan.setAttribute("x", txt.getAttribute("x"));
          tspan.setAttribute("dy", idx === 0 ? `-${fontSize * 0.45}` : `${fontSize * 1.1}`);
          txt.appendChild(tspan);
        });
      } else {
        const max = Math.max(4, Math.floor(boxW / (fontSize * 0.68)));
        txt.textContent = name.length > max ? name.slice(0, Math.max(1, max - 1)) + "…" : name;
      }
    };

    // ラウンドラベル
    for (const r of allRounds) {
      const lStr = r === maxRound ? "決勝" : r === maxRound - 1 ? "準決勝" : `R${r}`;
      const lbl = document.createElementNS(ns, "text");
      lbl.setAttribute("x", xOfRound[r] + boxW / 2); lbl.setAttribute("y", pad / 2 + 4);
      lbl.setAttribute("text-anchor", "middle"); lbl.setAttribute("dominant-baseline", "middle");
      lbl.setAttribute("font-size", "10"); lbl.setAttribute("class", "roundLabel");
      lbl.textContent = lStr;
      svg.appendChild(lbl);
    }

    for (const r of allRounds) {
      const matchesInR = matches.filter(m => m.round === r).sort((a, b) => a.slot - b.slot);
      for (let s = 0; s < matchesInR.length; s++) {
        const m = matchesInR[s];
        const key = matchKey(m);
        const x = xOfRound[r];
        const y = yOfMatch[key] ?? (pad + s * (matchH + gapY * 2));
        const isFinal = m.state === "final";
        const isSelected = selectedMatchKey === matchKey(m);

        const mkR = (yy, isWin, single) => {
          const rr = document.createElementNS(ns, "rect");
          rr.setAttribute("x", x); rr.setAttribute("y", yy);
          rr.setAttribute("width", boxW); rr.setAttribute("height", single ? matchH : boxH);
          rr.setAttribute("rx", 6);
          rr.setAttribute("class", single ? "sideBox byeBox" : `sideBox${isWin ? " final" : ""}${isSelected ? " selected" : ""}`);
          if (single) {
            rr.setAttribute("fill", "#ffffff");
            rr.setAttribute("stroke", "rgba(22,163,74,.4)");
            rr.setAttribute("stroke-width", "1.5");
          } else {
            // Drag events for team swapping in R1
            if (r === 1 && m.state === "pending") {
              rr.style.cursor = "grab";
              const teamKey = yy === y ? "A" : "B";
              const teamText = yy === y ? m.teamA : m.teamB;
              rr.addEventListener("mousedown", (e) => {
                e.stopPropagation();
                window.__draggedTeam = { matchKey: key, slot: teamKey, teamName: teamText, type: "team" };
              });
              rr.addEventListener("mouseup", (e) => {
                e.stopPropagation();
                if (window.__draggedTeam && window.__draggedTeam.type === "team") {
                  handleDropSwap(window.__draggedTeam, { matchKey: key, slot: teamKey, teamName: teamText, type: "team" });
                }
              });
            }
          }
          return rr;
        };
        const mkT = (yy, txt, fw, single) => {
          const t = document.createElementNS(ns, "text");
          t.setAttribute("x", x + boxW / 2); t.setAttribute("y", yy + (single ? matchH : boxH) / 2);
          t.setAttribute("text-anchor", "middle"); t.setAttribute("dominant-baseline", "middle");
          t.setAttribute("font-size", fontSize); t.setAttribute("font-weight", fw || "500");
          t.setAttribute("font-family", "'Noto Sans JP', sans-serif");
          t.setAttribute("class", `teamTxtH${!txt || txt === "—" ? " subtle" : ""}`);
          shn(txt, t);
          return t;
        };

        const matchG = document.createElementNS(ns, "g");
        matchG.style.cursor = "pointer";
        matchG.dataset.matchKey = key;

        const hit = document.createElementNS(ns, "rect");
        hit.setAttribute("x", x); hit.setAttribute("y", y);
        hit.setAttribute("width", boxW); hit.setAttribute("height", boxH * 2 + gapY);
        hit.setAttribute("fill", "transparent");
        matchG.appendChild(hit);

        matchG.onclick = () => selectMatch(matchKey(m));
        matchG.ondblclick = () => openResultModal(matchKey(m));

        if (ui.showTime !== false) {
          matchG.addEventListener("mousedown", (e) => {
            window.__draggedTeam = { matchKey: key, type: "match" };
          });
          matchG.addEventListener("mouseup", (e) => {
            if (window.__draggedTeam && window.__draggedTeam.type === "match") {
              handleDropSwap(window.__draggedTeam, { matchKey: key, type: "match" });
            }
          });
        }

        svg.appendChild(matchG);

        if (m.isBye) {
          const winner = m.winner === "A" ? m.teamA : m.teamB;
          matchG.appendChild(mkR(y, false, true));
          matchG.appendChild(mkT(y, shn(winner || "?"), "700", true));

          const bBadgeW = 26, bBadgeH = 12;
          const bBadgeX = x + boxW - bBadgeW + 4;
          const bBadgeY = y - 6;
          const bBadgeBg = document.createElementNS(ns, "rect");
          bBadgeBg.setAttribute("x", bBadgeX); bBadgeBg.setAttribute("y", bBadgeY);
          bBadgeBg.setAttribute("width", bBadgeW); bBadgeBg.setAttribute("height", bBadgeH);
          bBadgeBg.setAttribute("rx", 6);
          bBadgeBg.setAttribute("fill", "#22c55e");
          matchG.appendChild(bBadgeBg);
          const bBadgeTxt = document.createElementNS(ns, "text");
          bBadgeTxt.setAttribute("x", bBadgeX + bBadgeW / 2);
          bBadgeTxt.setAttribute("y", bBadgeY + bBadgeH / 2 + 0.5);
          bBadgeTxt.setAttribute("text-anchor", "middle");
          bBadgeTxt.setAttribute("dominant-baseline", "middle");
          bBadgeTxt.setAttribute("font-size", "7.5");
          bBadgeTxt.setAttribute("font-weight", "800");
          bBadgeTxt.setAttribute("fill", "#ffffff");
          bBadgeTxt.textContent = "BYE";
          matchG.appendChild(bBadgeTxt);
        } else {
          matchG.appendChild(mkR(y, isFinal && m.winner === "A"));
          matchG.appendChild(mkT(y, shn(m.teamA), m.winner === "A" ? "900" : "500"));
          matchG.appendChild(mkR(y + boxH + gapY, isFinal && m.winner === "B"));
          matchG.appendChild(mkT(y + boxH + gapY, shn(m.teamB), m.winner === "B" ? "900" : "500"));
        }

        // 進行中ハイライト
        const hl = document.createElementNS(ns, "rect");
        hl.setAttribute("id", `match-hl-${matchKey(m)}`);
        hl.setAttribute("x", x); hl.setAttribute("y", y);
        hl.setAttribute("width", boxW); hl.setAttribute("height", boxH * 2 + gapY);
        hl.setAttribute("rx", 4); hl.setAttribute("fill", "none");
        hl.setAttribute("class", "hidden");
        matchG.appendChild(hl);

        // コネクタ（勝者が右へ進む）
        if (r < maxRound && m.nextMatchKey) {
          const hasWinner = m.state === "final" && m.winner;
          const yA_out = y + boxH / 2;
          const yB_out = y + boxH + gapY + boxH / 2;
          const yMid = y + boxH + gapY / 2;

          let winY = yMid;
          if (hasWinner) winY = m.winner === "A" ? yA_out : yB_out;
          if (m.isBye) winY = y + matchH / 2;

          const startX = x + boxW;
          const endX = xOfRound[r + 1];
          // ラウンド間のちょうど中間に縦線を引く
          const midX = startX + (endX - startX) / 2;

          const nextM = byKey[m.nextMatchKey];
          let targetY = winY;
          if (nextM) {
            const nY = yOfMatch[matchKey(nextM)] ?? 0;
            if (nextM.isBye) {
              targetY = nY + matchH / 2;
            } else {
              targetY = m.nextSlot === "A" ? nY + boxH / 2 : nY + boxH + gapY + boxH / 2;
            }
          }

          const path = document.createElementNS(ns, "path");
          const rad = 4;
          let d = "";

          if (hasWinner || m.isBye) {
            path.setAttribute("class", hasWinner ? "line win" : "line");
            if (Math.abs(targetY - winY) < rad * 2) {
              d = `M ${startX} ${winY} H ${midX} V ${targetY} H ${endX}`;
            } else {
              const dir = targetY > winY ? 1 : -1;
              d = `M ${startX} ${winY} H ${midX - rad} Q ${midX} ${winY} ${midX} ${winY + rad * dir} V ${targetY - rad * dir} Q ${midX} ${targetY} ${midX + rad} ${targetY} H ${endX}`;
            }
          } else {
            // 未確定（コ線＋破線）
            path.setAttribute("class", "line");
            path.setAttribute("stroke-dasharray", "4 3"); // 点線

            // コの字
            d = `M ${startX} ${yA_out} H ${midX - rad} Q ${midX} ${yA_out} ${midX} ${yA_out + rad} V ${yB_out - rad} Q ${midX} ${yB_out} ${midX - rad} ${yB_out} H ${startX}`;

            // 次ラウンドへの線
            if (Math.abs(targetY - yMid) < rad * 2) {
              d += ` M ${midX} ${yMid} V ${targetY} H ${endX}`;
            } else {
              const dirC = targetY > yMid ? 1 : -1;
              d += ` M ${midX} ${yMid} V ${targetY - rad * dirC} Q ${midX} ${targetY} ${midX + rad} ${targetY} H ${endX}`;
            }
          }
          path.setAttribute("d", d);
          svg.insertBefore(path, svg.firstChild);
        }

        // 時刻ラベル（バッジスタイル）
        const time = fmtTime(m.scheduledStart);
        if ((time || m.matchNum) && ui.showTime !== false) {
          const numStr = m.matchNum ? `第${m.matchNum}試合` : "";
          const timeLabel = `${numStr} ${time || ""}${m.court ? "·" + m.court : ""}`.trim();
          const timeFontSz = Number(ui.timeFontSize ?? 9);
          const badgeW = timeLabel.length * timeFontSz * 0.62 + 10;
          const badgeH = timeFontSz + 5;
          const badgeX = x + boxW / 2 - badgeW / 2;
          const badgeY = y + boxH * 2 + gapY - badgeH - 2 + (ui.timeY || 0);
          const bg = document.createElementNS(ns, "rect");
          bg.setAttribute("x", badgeX); bg.setAttribute("y", badgeY);
          bg.setAttribute("width", badgeW); bg.setAttribute("height", badgeH);
          bg.setAttribute("rx", badgeH / 2);
          bg.setAttribute("fill", "#eff6ff");
          bg.setAttribute("stroke", "#bfdbfe");
          bg.setAttribute("stroke-width", "1");
          matchG.appendChild(bg);
          const meta = document.createElementNS(ns, "text");
          meta.setAttribute("x", x + boxW / 2);
          meta.setAttribute("y", badgeY + badgeH / 2 + 0.5);
          meta.setAttribute("text-anchor", "middle");
          meta.setAttribute("dominant-baseline", "middle");
          meta.setAttribute("font-size", String(timeFontSz));
          meta.setAttribute("fill", "#2563eb");
          meta.setAttribute("font-family", "ui-monospace, monospace");
          meta.setAttribute("font-weight", "700");
          meta.textContent = timeLabel;
          matchG.appendChild(meta);
        }
      }
    }
    return svg;
  }

  function autoFitBracketUI(teamCount) {
    const isSmall = teamCount <= 8;
    const isMedium = teamCount <= 16;
    return {
      fontSize: isSmall ? 14 : isMedium ? 13 : 12,
      totalW: isSmall ? 160 : isMedium ? 140 : 120,
      boxH: isSmall ? 32 : isMedium ? 28 : 24,
      gapX: 8,
      roundGapY: isSmall ? 100 : isMedium ? 90 : 80,
      midGap: 10,
      branchLen: 36,
      showTime: true,
      timeFontSize: 9,
      timeY: 0,
      liveZoom: 100,
      gapY1: 0, gapY2: 0, gapY3: 0, gapY4: 0,
      gapX1: 0, gapX2: 0, gapX3: 0, gapX4: 0,
    };
  }

  function uiGet() { return (state.tournament.bracketUI = state.tournament.bracketUI || {}); }
  function loserUiGet() { return (state.tournament.loserBracketUI = state.tournament.loserBracketUI || {}); }

  function applyUiToPanel() {
    const ui = uiGet();
    const sv = (id, v) => { const e = el(id); if (e) e.value = String(v ?? ""); };
    const st = (id, v) => { const e = el(id); if (e) e.textContent = String(v ?? ""); };
    sv("uiFont", ui.fontSize ?? 13); sv("uiW", ui.totalW ?? 130); sv("uiH", ui.boxH ?? 38);
    sv("uiGapY", ui.roundGapY ?? 130);
    sv("uiGapY1", ui.gapY1 ?? 0); sv("uiGapY2", ui.gapY2 ?? 0); sv("uiGapY3", ui.gapY3 ?? 0); sv("uiGapY4", ui.gapY4 ?? 0);
    sv("uiGapX", ui.gapX ?? 8);
    sv("uiGapX1", ui.gapX1 ?? 0); sv("uiGapX2", ui.gapX2 ?? 0); sv("uiGapX3", ui.gapX3 ?? 0); sv("uiGapX4", ui.gapX4 ?? 0);
    sv("uiMidGap", ui.midGap ?? 12);
    sv("uiBranch", ui.branchLen ?? 36);
    sv("uiTimeFontSize", ui.timeFontSize ?? 9);
    sv("uiTimeY", ui.timeY ?? 0);

    st("uiFontV", ui.fontSize ?? 13); st("uiWV", ui.totalW ?? 130); st("uiHV", ui.boxH ?? 38);
    st("uiGapYV", ui.roundGapY ?? 130);
    st("uiGapY1V", ui.gapY1 ?? 0); st("uiGapY2V", ui.gapY2 ?? 0); st("uiGapY3V", ui.gapY3 ?? 0); st("uiGapY4V", ui.gapY4 ?? 0);
    st("uiGapXV", ui.gapX ?? 8);
    st("uiGapX1V", ui.gapX1 ?? 0); st("uiGapX2V", ui.gapX2 ?? 0); st("uiGapX3V", ui.gapX3 ?? 0); st("uiGapX4V", ui.gapX4 ?? 0);
    st("uiMidGapV", ui.midGap ?? 12);
    st("uiBranchV", ui.branchLen ?? 36);
    st("uiTimeFontSizeV", ui.timeFontSize ?? 9);
    st("uiTimeYV", ui.timeY ?? 0);
    const cb = el("uiShowTime"); if (cb) cb.checked = !!(ui.showTime !== false);

    // 裏トーナメント用
    const lui = loserUiGet();
    const lsv = (id, v) => { const e = el(id); if (e) e.value = String(v ?? ""); };
    const lst = (id, v) => { const e = el(id); if (e) e.textContent = String(v ?? ""); };
    lsv("luiFont", lui.fontSize ?? 13); lsv("luiW", lui.totalW ?? 130); lsv("luiH", lui.boxH ?? 38);
    lsv("luiGapY", lui.roundGapY ?? 130);
    lsv("luiGapY1", lui.gapY1 ?? 0); lsv("luiGapY2", lui.gapY2 ?? 0); lsv("luiGapY3", lui.gapY3 ?? 0); lsv("luiGapY4", lui.gapY4 ?? 0);
    lsv("luiGapX", lui.gapX ?? 8); lsv("luiMidGap", lui.midGap ?? 12);
    lsv("luiBranch", lui.branchLen ?? 36);
    lst("luiFontV", lui.fontSize ?? 13); lst("luiWV", lui.totalW ?? 130); lst("luiHV", lui.boxH ?? 38);
    lst("luiGapYV", lui.roundGapY ?? 130);
    lst("luiGapY1V", lui.gapY1 ?? 0); lst("luiGapY2V", lui.gapY2 ?? 0); lst("luiGapY3V", lui.gapY3 ?? 0); lst("luiGapY4V", lui.gapY4 ?? 0);
    lst("luiGapXV", lui.gapX ?? 8); lst("luiMidGapV", lui.midGap ?? 12);
    lst("luiBranchV", lui.branchLen ?? 36);
    const loserEn = el("loserUiEnabled"); if (loserEn) loserEn.checked = !!state.tournament.loserUiEnabled;
    const loserSliders = el("loserUiSliders"); if (loserSliders) loserSliders.style.opacity = state.tournament.loserUiEnabled ? "1" : "0.4";

    // 裏トーナメントセクションの表示制御
    const loserSec = el("loserUiSection");
    if (loserSec) loserSec.style.display = (currentEvent && currentEvent.loserMatches && currentEvent.loserMatches.length > 0) ? "" : "none";
  }

  function bindUiPanel() {
    const btn = el("btnUi"), close = el("btnUiClose"), panel = el("uiPanel");
    if (btn && panel) btn.onclick = () => { panel.classList.toggle("hidden"); applyUiToPanel(); };
    if (close && panel) close.onclick = () => panel.classList.add("hidden");

    const bind = (id, key) => {
      const e = el(id);
      if (!e) return;
      e.oninput = () => {
        uiGet()[key] = Number(e.value);
        const dispEl = el(id + "V");
        if (dispEl) dispEl.textContent = String(Number(e.value));
        normalizeState(); saveState();
        if (currentEvent) renderEventDetail(currentEvent.id);
      };
    };
    bind("uiFont", "fontSize"); bind("uiW", "totalW"); bind("uiH", "boxH");
    bind("uiLiveZoom", "liveZoom");
    bind("uiGapY", "roundGapY");
    bind("uiGapY1", "gapY1"); bind("uiGapY2", "gapY2"); bind("uiGapY3", "gapY3"); bind("uiGapY4", "gapY4");
    bind("uiGapX", "gapX");
    bind("uiGapX1", "gapX1"); bind("uiGapX2", "gapX2"); bind("uiGapX3", "gapX3"); bind("uiGapX4", "gapX4");
    bind("uiMidGap", "midGap");
    bind("uiBranch", "branchLen");
    bind("uiTimeFontSize", "timeFontSize");
    bind("uiTimeY", "timeY");

    // 裏トーナメント用
    const bindL = (id, key) => {
      const e = el(id);
      if (!e) return;
      e.oninput = () => {
        loserUiGet()[key] = Number(e.value);
        const dispEl = el(id + "V");
        if (dispEl) dispEl.textContent = String(Number(e.value));
        normalizeState(); saveState();
        if (currentEvent) renderEventDetail(currentEvent.id);
      };
    };
    bindL("luiFont", "fontSize"); bindL("luiW", "totalW"); bindL("luiH", "boxH");
    bindL("luiGapY", "roundGapY");
    bindL("luiGapY1", "gapY1"); bindL("luiGapY2", "gapY2"); bindL("luiGapY3", "gapY3"); bindL("luiGapY4", "gapY4");
    bindL("luiGapX", "gapX"); bindL("luiMidGap", "midGap");
    bindL("luiBranch", "branchLen");

    // 試合時間 ON/OFF
    const showT = el("uiShowTime");
    if (showT) showT.onchange = () => {
      uiGet().showTime = showT.checked; normalizeState(); saveState();
      if (currentEvent) renderEventDetail(currentEvent.id);
    };

    // 裏トーナメント用UI有効化トグル
    const loserEn = el("loserUiEnabled");
    if (loserEn) loserEn.onchange = () => {
      state.tournament.loserUiEnabled = loserEn.checked;
      const sliders = el("loserUiSliders");
      if (sliders) sliders.style.opacity = loserEn.checked ? "1" : "0.4";
      normalizeState(); saveState();
      if (currentEvent) renderEventDetail(currentEvent.id);
    };
  }

  function renderBracket() {
    const bracket = el("bracket");
    bracket.innerHTML = "";
    if (!currentEvent) { bracket.innerHTML = "<div class='small'>イベントがありません</div>"; return; }

    if (currentEvent.format === "league") {
      bracket.appendChild(buildLeagueTableHTML(currentEvent));
      return;
    }

    // エキシビション試合（round≥8080）を分離
    const mainMatches = (currentEvent.matches || []).filter(m => !m.isExhibition);
    const exhibitionMatches = (currentEvent.matches || []).filter(m => m.isExhibition);

    // ブラケット方向: vertical / horizontal
    const bracketDir = state.tournament?.bracketDir || "vertical";
    const drawFn = bracketDir === "horizontal" ? buildHorizontalBracketSVG : buildBracketSVG;

    bracket.appendChild(drawFn(mainMatches));

    // 裏トーナメント
    if (currentEvent.loserMatches && currentEvent.loserMatches.length > 0) {
      const loserSec = el("loserUiSection");
      if (loserSec) loserSec.style.display = "";
      if (el("btnEditLoserMatchups")) el("btnEditLoserMatchups").classList.remove("hidden");

      const lbl = document.createElement("div");
      lbl.innerHTML = `<span style="font-size:11px;color:#7c3aed;font-weight:700;letter-spacing:.3px;text-transform:uppercase;">▊ 裏トーナメント</span>`;
      lbl.style.cssText = "margin: 28px 0 10px; padding: 10px 12px; background:linear-gradient(90deg,#f5f3ff,#ede9fe); border-left:4px solid #7c3aed; border-radius:0 8px 8px 0;";
      bracket.appendChild(lbl);

      // 裏トーナメント用UI（別設定有効時は loserBracketUI を利用）
      const loserUI = (state.tournament?.loserUiEnabled ? state.tournament.loserBracketUI : {}) || {};
      // 裏トーナメントはデフォルトで枠を広め・高めにする（2行表示のため）
      if (loserUI.totalW === undefined) loserUI.totalW = 180;
      if (loserUI.boxH === undefined) {
        // 通常が 28 なら 42 程度、38 なら 52 程度に
        const baseH = state.tournament?.bracketUI?.boxH ?? 38;
        loserUI.boxH = Number(baseH) + 14;
      }
      bracket.appendChild(drawFn(currentEvent.loserMatches, loserUI));
    } else {
      const loserSec = el("loserUiSection");
      if (loserSec) loserSec.style.display = "none";
      if (el("btnEditLoserMatchups")) el("btnEditLoserMatchups").classList.add("hidden");
    }

    // エキシビション試合を別セクションで表示
    if (exhibitionMatches.length > 0) {
      const exLbl = document.createElement("div");
      exLbl.innerHTML = `<span style="font-size:11px;color:#d97706;font-weight:700;letter-spacing:.3px;">▊ エキシビション</span>`;
      exLbl.style.cssText = "margin: 28px 0 10px; padding: 10px 12px; background:linear-gradient(90deg,#fffbeb,#fef3c7); border-left:4px solid #d97706; border-radius:0 8px 8px 0;";
      bracket.appendChild(exLbl);
      exhibitionMatches.forEach(m => {
        const card = document.createElement("div");
        card.style.cssText = "display:inline-flex;align-items:center;gap:12px;background:#fff;border:1.5px solid #fde68a;border-radius:8px;padding:8px 14px;margin:4px 0;";
        const stateColor = m.state === "final" ? "#16a34a" : m.state === "playing" ? "#ef4444" : "#94a3b8";
        const stateLabel = m.state === "final" ? "終了" : m.state === "playing" ? "試合中" : "待機";
        card.innerHTML = `
          <span style="font-weight:700;font-size:14px;">${escapeHtml(m.teamA || '—')}</span>
          <span style="color:#94a3b8;font-size:12px;">${m.scoreA ?? ''} - ${m.scoreB ?? ''}</span>
          <span style="font-weight:700;font-size:14px;">${escapeHtml(m.teamB || '—')}</span>
          <span style="font-size:11px;color:${stateColor};border:1px solid ${stateColor};border-radius:999px;padding:1px 7px;">${stateLabel}</span>
          <span style="font-size:11px;color:var(--muted);">${m.court || ''}</span>
        `;
        card.style.cursor = "pointer";
        card.onclick = () => openResultModal(matchKey(m));
        bracket.appendChild(card);
      });
    }
  }

  function buildLeagueTableHTML(event) {
    const tableContainer = document.createElement("div");
    tableContainer.style.cssText = "overflow-x: auto; padding: 10px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);";

    // 1. Collect all unique teams
    const teams = new Set();
    const results = {}; // Team -> { pts, gd, gf, ga }

    event.matches.forEach(m => {
      if (m.teamA) teams.add(m.teamA);
      if (m.teamB) teams.add(m.teamB);
    });

    const teamArray = Array.from(teams).sort();
    teamArray.forEach(t => results[t] = { pts: 0, gd: 0, gf: 0, ga: 0, w: 0, d: 0, l: 0 });

    // 2. Calculate standings (Win = 3, Draw = 1, Loss = 0)
    const matchLookup = {}; // "TeamA|TeamB" -> match

    event.matches.forEach(m => {
      if (!m.teamA || !m.teamB) return;
      matchLookup[`${m.teamA}|${m.teamB}`] = { m, isHome: true };
      matchLookup[`${m.teamB}|${m.teamA}`] = { m, isHome: false };

      if (m.state === "final") {
        const scoreA = Number(m.scoreA);
        const scoreB = Number(m.scoreB);
        if (!isNaN(scoreA) && !isNaN(scoreB)) {
          // A stats
          results[m.teamA].gf += scoreA;
          results[m.teamA].ga += scoreB;
          results[m.teamA].gd += (scoreA - scoreB);
          // B stats
          results[m.teamB].gf += scoreB;
          results[m.teamB].ga += scoreA;
          results[m.teamB].gd += (scoreB - scoreA);

          if (scoreA > scoreB) {
            results[m.teamA].pts += 3; results[m.teamA].w += 1;
            results[m.teamB].l += 1;
          } else if (scoreA < scoreB) {
            results[m.teamB].pts += 3; results[m.teamB].w += 1;
            results[m.teamA].l += 1;
          } else {
            results[m.teamA].pts += 1; results[m.teamA].d += 1;
            results[m.teamB].pts += 1; results[m.teamB].d += 1;
          }
        }
      }
    });

    // Sort array by pts -> gd -> gf
    const sortedTeams = [...teamArray].sort((a, b) => {
      if (results[b].pts !== results[a].pts) return results[b].pts - results[a].pts;
      if (results[b].gd !== results[a].gd) return results[b].gd - results[a].gd;
      return results[b].gf - results[a].gf;
    });

    // 3. Build Table HTML
    let html = `<table class="league-table" style="width: 100%; border-collapse: collapse; min-width: ${sortedTeams.length * 60 + 300}px;">`;

    // Header
    html += `<thead><tr>
      <th style="border: 1px solid #ccc; padding: 8px; background: #f8fafc; text-align: center;">順位</th>
      <th style="border: 1px solid #ccc; padding: 8px; background: #f8fafc; text-align: left;">チーム</th>`;
    sortedTeams.forEach(t => {
      html += `<th style="border: 1px solid #ccc; padding: 8px; background: #f8fafc; text-align: center; font-size: 12px;">${escapeHtml(t)}</th>`;
    });
    html += `<th style="border: 1px solid #ccc; padding: 8px; background: #eff6ff; text-align: center;">勝点</th>
             <th style="border: 1px solid #ccc; padding: 8px; background: #f8fafc; text-align: center;">得失</th>
             <th style="border: 1px solid #ccc; padding: 8px; background: #f8fafc; text-align: center;">得</th>
             <th style="border: 1px solid #ccc; padding: 8px; background: #f8fafc; text-align: center;">失</th>
             </tr></thead><tbody>`;

    // Rows
    sortedTeams.forEach((t, i) => {
      const r = results[t];
      html += `<tr>
        <td style="border: 1px solid #ccc; padding: 8px; text-align: center; font-weight: bold;">${i + 1}</td>
        <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold;">${escapeHtml(t)}</td>`;

      sortedTeams.forEach(opp => {
        if (t === opp) {
          html += `<td style="border: 1px solid #ccc; background: #e2e8f0;"></td>`;
        } else {
          const matchData = matchLookup[`${t}|${opp}`];
          if (!matchData) {
            html += `<td style="border: 1px solid #ccc; padding: 8px; text-align: center; color: #94a3b8;">-</td>`;
          } else {
            const m = matchData.m;
            let cellContent = "";
            let bg = "";
            let cursor = "cursor: pointer;";

            if (m.state === "final") {
              const myScore = matchData.isHome ? m.scoreA : m.scoreB;
              const oppScore = matchData.isHome ? m.scoreB : m.scoreA;
              if (myScore > oppScore) bg = "background: #f0fdf4; color: #16a34a;"; // Win green
              else if (myScore < oppScore) bg = "background: #fef2f2; color: #dc2626;"; // Loss red
              else bg = "background: #fdfaf5; color: #d97706;"; // Draw orange

              cellContent = `<b>${myScore}</b> - ${oppScore}`;
            } else if (m.state === "playing" || m.state === "calling") {
              bg = "background: #fffbeb; color: #d97706;";
              cellContent = `試合中`;
            } else {
              cellContent = `<span style="font-size:10px; color:#64748b;">${fmtTime(m.scheduledStart) || ""}</span>`;
            }

            html += `<td class="league-cell" data-key="${matchKey(m)}" style="border: 1px solid #ccc; padding: 8px; text-align: center; ${bg} ${cursor}">
                       ${cellContent}
                     </td>`;
          }
        }
      });

      html += `<td style="border: 1px solid #ccc; padding: 8px; text-align: center; font-weight: bold; background: #eff6ff;">${r.pts}</td>
               <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${r.gd > 0 ? '+' + r.gd : r.gd}</td>
               <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${r.gf}</td>
               <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${r.ga}</td>
               </tr>`;
    });

    html += `</tbody></table>`;
    tableContainer.innerHTML = html;

    // Attach click events to cells for entering results
    const cells = tableContainer.querySelectorAll(".league-cell");
    cells.forEach(el => {
      el.onclick = () => {
        const key = el.getAttribute("data-key");
        if (key) {
          selectMatch(key);
          openResultModal(key);
        }
      };
    });

    return tableContainer;
  }

  // ── Match buttons ────────────────────────────────────────────
  function renderMatchButtons() {
    if (!currentEvent) return;
    const r = Number(el("roundSel").value);
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const list = allM.filter(m => m.round === r).sort((a, b) => a.slot - b.slot);
    const ml = el("matchList");
    ml.innerHTML = "";
    for (const m of list) {
      const key = matchKey(m);
      const b = document.createElement("button");
      b.textContent = `${m.isLoserMatch ? "[裏]" : ""}${m.teamA ?? "—"} vs ${m.teamB ?? "—"} [${m.state}]`;
      if (m.state === "final") { b.style.borderColor = "var(--ok-border)"; b.style.color = "var(--ok)"; }
      b.onclick = () => selectMatch(key);
      ml.appendChild(b);
    }
  }

  function selectMatch(key) {
    if (!currentEvent) return;
    selectedMatchKey = key;
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const m = findMatchByKey(allM, key);

    el("pickInfo").textContent = `選択: ${key} / 予定:${fmtTime(m.scheduledStart)} ${m.court ? "(" + m.court + ")" : ""}`;
    el("tA").textContent = formatTeamName(m.teamA) ?? "—";
    el("tB").textContent = formatTeamName(m.teamB) ?? "—";
    el("sA").value = m.scoreA ?? "";
    el("sB").value = m.scoreB ?? "";
    el("timeInfo").textContent = `状態: ${m.state} / winner=${m.winner ?? "-"}`;

    const mode = state.tournament?.inputMode || "score";
    const sp = el("scorePanel"), wp = el("winlosePanel");
    if (sp && wp) {
      if (mode === "winlose") {
        sp.classList.add("hidden"); wp.classList.remove("hidden");
      } else {
        sp.classList.remove("hidden"); wp.classList.add("hidden");
      }
    }
    renderBracket();
  }

  // Finalize
  el("btnFinalize").onclick = () => {
    if (!currentEvent || !selectedMatchKey) return alert("試合を選択してください");
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const m = findMatchByKey(allM, selectedMatchKey);
    let winner = null;
    if (m.teamA && !m.teamB) winner = "A";
    else if (!m.teamA && m.teamB) winner = "B";
    else {
      const mode = state.tournament?.inputMode || "score";
      if (mode === "winlose") return alert("勝敗のみモード：右の「Aの勝ち / Bの勝ち」ボタンで確定してください");
      const sA = Number(el("sA").value), sB = Number(el("sB").value);
      if (Number.isNaN(sA) || Number.isNaN(sB)) return alert("スコアを入れてください");
      if (sA === sB) return alert("同点は不可");
      winner = sA > sB ? "A" : "B";
      m.scoreA = sA; m.scoreB = sB;
    }
    pushUndoState();
    const targetArr = m.isLoserMatch ? currentEvent.loserMatches : currentEvent.matches;
    finalizeMatchLocal(targetArr, m, winner, false);
    saveState(); renderBracket(); renderMatchButtons(); selectMatch(selectedMatchKey);
  };

  el("btnClear").onclick = () => {
    if (!currentEvent || !selectedMatchKey) return alert("試合を選択してください");
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const m = findMatchByKey(allM, selectedMatchKey);
    const targetArr = m.isLoserMatch ? currentEvent.loserMatches : currentEvent.matches;
    pushUndoState();
    clearFinalLocal(targetArr, m);
    saveState(); renderBracket(); renderMatchButtons(); selectMatch(selectedMatchKey);
  };

  const _bWinA = el("btnWinA"), _bWinB = el("btnWinB");
  if (_bWinA) _bWinA.onclick = () => finalizeByWinner("A");
  if (_bWinB) _bWinB.onclick = () => finalizeByWinner("B");

  function finalizeByWinner(winner) {
    if (!currentEvent || !selectedMatchKey) return alert("試合を選択してください");
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const m = findMatchByKey(allM, selectedMatchKey);
    if (m.teamA && !m.teamB) winner = "A";
    if (!m.teamA && m.teamB) winner = "B";
    if (!m.teamA && !m.teamB) return alert("チームが未確定です");
    m.scoreA = null; m.scoreB = null;
    pushUndoState();
    const targetArr = m.isLoserMatch ? currentEvent.loserMatches : currentEvent.matches;
    finalizeMatchLocal(targetArr, m, winner, false);
    saveState(); renderBracket(); renderMatchButtons(); selectMatch(selectedMatchKey);
  }

  el("btnReshuffle").onclick = () => {
    if (!currentEvent) return;
    if (!confirm("この競技のR1を再抽選します。既存の勝敗は消えます。よいですか？")) return;
    pushUndoState();
    for (const m of currentEvent.matches) {
      m.teamA = null; m.teamB = null;
      m.scoreA = null; m.scoreB = null;
      m.winner = null; m.state = "pending";
    }
    const classes = state.tournament.classes;
    const sport = currentEvent.settings;
    const n = Math.max(2, Math.min(classes.length, Number(sport.participants ?? classes.length)));
    const bSize = bracketSize(n);
    const picked = shuffle(classes).slice(0, n);
    const seeds = picked.concat(Array(bSize - picked.length).fill(null));
    const r1count = currentEvent.matches.filter(m => m.round === 1).length;
    for (let i = 0; i < r1count; i++) {
      const m = findMatch(currentEvent.matches, 1, i);
      m.teamA = seeds[i * 2] || null;
      m.teamB = seeds[i * 2 + 1] || null;
    }
    for (let i = 0; i < r1count; i++) {
      const m = findMatch(currentEvent.matches, 1, i);
      if ((m.teamA && !m.teamB) || (!m.teamA && m.teamB)) {
        finalizeMatchLocal(currentEvent.matches, m, m.teamA ? "A" : "B", true);
      }
    }
    saveState(); selectedMatchKey = null; renderBracket(); renderMatchButtons();
    el("pickInfo").textContent = "再抽選しました。試合を選択してください。";
  };

  // ── Finalize / Clear match ────────────────────────────────────
  function finalizeMatchLocal(matches, m, winner, silent) {
    const prevWinner = m.winner;
    const prevWinTeam = prevWinner ? (prevWinner === "A" ? m.teamA : m.teamB) : null;

    // BUG-04修正: 循環参照による無限再帰を防ぐ訪問済みSetを追加
    const _visitedKeys = new Set();
    function clearOutcomeFrom(mk) {
      if (_visitedKeys.has(mk)) return;
      _visitedKeys.add(mk);
      const mm = findMatchByKey(matches, mk);
      if (!mm) return;
      if (mm.winner) {
        const oldTeam = mm.winner === "A" ? mm.teamA : mm.teamB;
        mm.winner = null; mm.state = "pending";
        mm.scoreA = null; mm.scoreB = null;
        if (mm.nextMatchKey && oldTeam) {
          const next = findMatchByKey(matches, mm.nextMatchKey);
          if (mm.nextSlot === "A" && next.teamA === oldTeam) next.teamA = null;
          if (mm.nextSlot === "B" && next.teamB === oldTeam) next.teamB = null;
          clearOutcomeFrom(mm.nextMatchKey);
        }
      } else if (mm.nextMatchKey) clearOutcomeFrom(mm.nextMatchKey);
    }

    if (prevWinner && m.nextMatchKey) {
      const next = findMatchByKey(matches, m.nextMatchKey);
      if (prevWinTeam) {
        if (m.nextSlot === "A" && next.teamA === prevWinTeam) next.teamA = null;
        if (m.nextSlot === "B" && next.teamB === prevWinTeam) next.teamB = null;
      }
      clearOutcomeFrom(m.nextMatchKey);
    }

    m.winner = winner;
    m.state = "final";
    const winTeam = winner === "A" ? m.teamA : m.teamB;
    const loseTeam = winner === "A" ? m.teamB : m.teamA;
    if (m.nextMatchKey && winTeam) {
      const next = findMatchByKey(matches, m.nextMatchKey);
      if (m.nextSlot === "A") next.teamA = winTeam;
      else next.teamB = winTeam;
    }

    // UPDATE LOSER BRACKET
    if (!m.isLoserMatch && loseTeam) {
      const lKeyPrefix = `__L|${matchKey(m)}`; // e.g. "__L|R1-0"
      if (currentEvent && currentEvent.loserMatches) {
        for (const lm of currentEvent.loserMatches) {
          if (lm.teamA && lm.teamA.startsWith(lKeyPrefix)) {
            lm._origTeamA = lm.teamA;
            lm.teamA = loseTeam;
          } else if (lm._origTeamA && lm._origTeamA.startsWith(lKeyPrefix)) {
            lm.teamA = loseTeam;
          }

          if (lm.teamB && lm.teamB.startsWith(lKeyPrefix)) {
            lm._origTeamB = lm.teamB;
            lm.teamB = loseTeam;
          } else if (lm._origTeamB && lm._origTeamB.startsWith(lKeyPrefix)) {
            lm.teamB = loseTeam;
          }
        }
      }
    }

    // UPDATE THIRD PLACE MATCH
    // 準決勝の敗者を3位決定戦に自動セット
    if (!m.isLoserMatch && loseTeam && currentEvent) {
      const allRounds = [...new Set(currentEvent.matches.map(mm => mm.round))].sort((a, b) => a - b);
      const maxRound = allRounds[allRounds.length - 1];
      const semiRound = maxRound - 1;
      if (m.round === semiRound) {
        const thirdMatch = currentEvent.matches.find(mm => mm.isThirdPlace);
        if (thirdMatch) {
          const semis = currentEvent.matches.filter(mm => mm.round === semiRound && !mm.isThirdPlace).sort((a, b) => a.slot - b.slot);
          const semiIdx = semis.indexOf(m);
          if (semiIdx === 0) thirdMatch.teamA = loseTeam;
          else if (semiIdx === 1) thirdMatch.teamB = loseTeam;
        }
      }
    }

    if (!silent) toast("確定しました（次ラウンドへ反映）");

    // Webhook Notification for Match End
    if (currentEvent) {
      notifyWebhook(`【試合終了】${currentEvent.sportName} 第${m.matchNum || '?'}試合: ${m.teamA || '—'} ${m.scoreA || 0} - ${m.scoreB || 0} ${m.teamB || '—'} (${winner === 'A' ? m.teamA : m.teamB} の勝利)`);
    }
  }

  function notifyWebhook(message) {
    const url = state.tournament?.webhookUrl;
    if (!url) return;
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message })
      }).catch(err => console.error("Webhook failed:", err));
    } catch (e) {
      console.error("Webhook error:", e);
    }
  }

  function clearFinalLocal(matches, m) {
    function clearOutcomeFrom(mk) {
      if (!mk) return;
      const mm = findMatchByKey(matches, mk);
      if (!mm) return;
      if (mm.winner) {
        const oldTeam = mm.winner === "A" ? mm.teamA : mm.teamB;
        mm.winner = null; mm.state = "pending";
        mm.scoreA = null; mm.scoreB = null;
        delete mm.setScores;
        if (mm.nextMatchKey && oldTeam) {
          const next = findMatchByKey(matches, mm.nextMatchKey);
          if (mm.nextSlot === "A" && next.teamA === oldTeam) next.teamA = null;
          if (mm.nextSlot === "B" && next.teamB === oldTeam) next.teamB = null;
          clearOutcomeFrom(mm.nextMatchKey);
        }
      } else {
        mm.state = "pending";
        mm.scoreA = null; mm.scoreB = null;
        delete mm.setScores;
        if (mm.nextMatchKey) clearOutcomeFrom(mm.nextMatchKey);
      }
    }

    const prevWinTeam = m.winner === "A" ? m.teamA : m.winner === "B" ? m.teamB : null;
    if (m.nextMatchKey && prevWinTeam) {
      const next = findMatchByKey(matches, m.nextMatchKey);
      if (m.nextSlot === "A" && next.teamA === prevWinTeam) next.teamA = null;
      if (m.nextSlot === "B" && next.teamB === prevWinTeam) next.teamB = null;
      clearOutcomeFrom(m.nextMatchKey);
    }
    m.winner = null; m.state = "pending"; m.scoreA = null; m.scoreB = null;
    delete m.setScores;

    // CLEAR LOSER BRACKET
    if (!m.isLoserMatch) {
      const lKeyPrefix = `__L|${matchKey(m)}`;
      if (currentEvent && currentEvent.loserMatches) {
        for (const lm of currentEvent.loserMatches) {
          if (lm._origTeamA && lm._origTeamA.startsWith(lKeyPrefix)) {
            lm.teamA = lm._origTeamA;
            delete lm._origTeamA; // BUG-13修正: プレースホルダーを残さない
            clearFinalLocal(currentEvent.loserMatches, lm);
          }
          if (lm._origTeamB && lm._origTeamB.startsWith(lKeyPrefix)) {
            lm.teamB = lm._origTeamB;
            delete lm._origTeamB; // BUG-13修正: プレースホルダーを残さない
            clearFinalLocal(currentEvent.loserMatches, lm);
          }
        }
      }
    }
  }

  // ── Result Modal ─────────────────────────────────────────────
  let modalMatchKey = null;

  function openResultModal(matchKey) {
    if (!currentEvent) return;
    modalMatchKey = matchKey;
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const m = findMatchByKey(allM, matchKey);
    if (!m) return;
    const mode = state.tournament?.inputMode || "score";
    const overlay = el("resultModal");
    if (!overlay) return;

    el("mTitle").textContent = m.matchNum ? `第${m.matchNum}試合` : `${m.isLoserMatch ? "裏" : ""}R${m.round}-${m.slot + 1}`;
    el("mTeamA").textContent = formatTeamName(m.teamA) ?? "—";
    el("mTeamB").textContent = formatTeamName(m.teamB) ?? "—";

    const mScore = el("mScore"), mWL = el("mWinLose"), hint = el("mHint");
    const wrapA = el("mScoreAWrap"), wrapB = el("mScoreBWrap"), setsBox = el("mScoreSets");
    const setsC = currentEvent.settings?.sets || 1;

    if (mode === "winlose") {
      mScore.classList.add("hidden"); mWL.classList.remove("hidden");
      if (setsBox) setsBox.classList.add("hidden");
      if (hint) hint.textContent = "勝敗のみ：ボタンで確定";
    } else {
      mScore.classList.remove("hidden"); mWL.classList.add("hidden");
      if (setsC > 1 && setsBox && wrapA && wrapB) {
        wrapA.classList.add("hidden");
        wrapB.classList.add("hidden");
        setsBox.classList.remove("hidden");
        setsBox.innerHTML = "";
        const mSets = m.setScores || [];
        for (let i = 0; i < setsC; i++) {
          const sA = mSets[i]?.scoreA ?? "";
          const sB = mSets[i]?.scoreB ?? "";
          const row = document.createElement("div");
          row.className = "row between";
          row.style.alignItems = "center";
          row.innerHTML = `
            <span class="small" style="font-weight:bold; width:40px;">Set ${i + 1}</span>
            <input type="number" id="mS_${i}_A" style="width:70px" min="0" value="${sA}">
            <span>-</span>
            <input type="number" id="mS_${i}_B" style="width:70px" min="0" value="${sB}">
          `;
          setsBox.appendChild(row);
        }
        if (hint) hint.textContent = `各セットのScoreを入力 → 保存 (${setsC}セットマッチ)`;
      } else {
        if (wrapA) wrapA.classList.remove("hidden");
        if (wrapB) wrapB.classList.remove("hidden");
        if (setsBox) setsBox.classList.add("hidden");
        el("mScoreA").value = m.scoreA ?? "";
        el("mScoreB").value = m.scoreB ?? "";
        if (hint) hint.textContent = "Score入力 → 保存";
      }
    }
    overlay.classList.remove("hidden");
  }

  function closeResultModal() {
    el("resultModal").classList.add("hidden");
    modalMatchKey = null;
  }

  function modalFinalize(winner) {
    if (!currentEvent || !modalMatchKey) return;
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const m = findMatchByKey(allM, modalMatchKey);
    if (!m) return;
    if (m.teamA && !m.teamB) winner = "A";
    if (!m.teamA && m.teamB) winner = "B";
    if (!m.teamA && !m.teamB) return;
    pushUndoState();
    const targetArr = m.isLoserMatch ? currentEvent.loserMatches : currentEvent.matches;
    finalizeMatchLocal(targetArr, m, winner, true);
    saveState(); renderEventDetail(currentEvent.id); closeResultModal();
  }

  function updateMatchStatus(newStatus) {
    if (!currentEvent || !modalMatchKey) return;
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    const m = findMatchByKey(allM, modalMatchKey);
    if (!m) return;

    // Only allow changing status if not already final, or if you want to allow it anyway
    if (m.state === "final") {
      if (!confirm("既に勝敗が確定しています。進行中ステータスに戻しますか？")) return;
      m.winner = null;
      const targetArr = m.isLoserMatch ? currentEvent.loserMatches : currentEvent.matches;
      clearFinalLocal(targetArr, m);
    }
    m.state = newStatus;

    // Webhook Notification for Calling status
    if (newStatus === "calling") {
      notifyWebhook(`【招集】${currentEvent.sportName} 第${m.matchNum || '?'}試合(${m.court || '?'}) : ${m.teamA || '未定'} vs ${m.teamB || '未定'} は間もなく開始します。本部またはコートにお集まりください。`);
    }

    saveState();
    renderEventDetail(currentEvent.id);
    closeResultModal();
  }

  function bindResultModal() {
    const overlay = el("resultModal");
    if (!overlay) return;
    el("mClose").onclick = closeResultModal;
    overlay.addEventListener("click", e => { if (e.target === overlay) closeResultModal(); });

    if (el("mStatusCalling")) el("mStatusCalling").onclick = () => updateMatchStatus("calling");
    if (el("mStatusPlaying")) el("mStatusPlaying").onclick = () => updateMatchStatus("playing");

    el("mWinA").onclick = () => modalFinalize("A");
    el("mWinB").onclick = () => modalFinalize("B");
    el("mSave").onclick = () => {
      if (!currentEvent || !modalMatchKey) return;
      const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
      const m = findMatchByKey(allM, modalMatchKey);
      const mode = state.tournament?.inputMode || "score";
      if (mode === "winlose") return;

      const setsC = currentEvent.settings?.sets || 1;
      let winner = null;
      let a = 0, b = 0;

      if (setsC > 1) {
        const mSets = [];
        let winA = 0, winB = 0;
        for (let i = 0; i < setsC; i++) {
          const valA = el(`mS_${i}_A`)?.value;
          const valB = el(`mS_${i}_B`)?.value;
          if (valA !== "" && valB !== "") {
            const sA = Number(valA);
            const sB = Number(valB);
            if (Number.isFinite(sA) && Number.isFinite(sB)) {
              mSets.push({ scoreA: sA, scoreB: sB });
              if (sA > sB) winA++;
              if (sB > sA) winB++;
            }
          }
        }
        if (mSets.length === 0) return alert("少なくとも1セットのスコアを入力してください");
        m.setScores = mSets;
        a = winA;
        b = winB;
        if (winA === winB) return alert(`セット同点（${winA}-${winB}）は不可です`);
        winner = winA > winB ? "A" : "B";
        m.scoreA = a;
        m.scoreB = b;
      } else {
        a = Number(el("mScoreA")?.value);
        b = Number(el("mScoreB")?.value);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return alert("Scoreを入力してください");
        m.scoreA = a; m.scoreB = b;
        winner = a > b ? "A" : b > a ? "B" : null;
        if (!winner) return alert("同点は不可");
      }

      pushUndoState();
      const targetArr = m.isLoserMatch ? currentEvent.loserMatches : currentEvent.matches;
      finalizeMatchLocal(targetArr, m, winner, true);
      saveState(); renderEventDetail(currentEvent.id); closeResultModal();
    };
    el("mClear").onclick = () => {
      if (!currentEvent || !modalMatchKey) return;
      const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
      const m = findMatchByKey(allM, modalMatchKey);
      pushUndoState();
      const targetArr = m.isLoserMatch ? currentEvent.loserMatches : currentEvent.matches;
      clearFinalLocal(targetArr, m);
      saveState(); renderEventDetail(currentEvent.id); closeResultModal();
    };
  }

  // ── Boot ──────────────────────────────────────────────────
  // Firebase 初期化（設定未記入の場合は no-op）
  if (window.FirebaseSync) {
    const fbEnabled = window.FirebaseSync.init();
    if (fbEnabled) {
      // Firebaseから最新データを読み込んで初期化
      window.FirebaseSync.load().then(fbState => {
        if (fbState && fbState.events) {
          const localRaw = localStorage.getItem(STORAGE_KEY);
          const localState = localRaw ? JSON.parse(localRaw) : null;
          // Firebaseのデータがローカルより新しい場合は上書き
          const fbUpdated = fbState.tournament?.updatedAt || "";
          const localUpdated = localState?.tournament?.updatedAt || "";
          if (fbUpdated > localUpdated) {
            state = fbState;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            syncFormFromState();
            renderEvents();
            statusBar.textContent = `status: Firebaseからロード完了 🔥`;
          }
        }
      }).catch(e => console.error("Firebase load error:", e));
    }
  }

  bindClassPicker("cpGradesS", "cpPerGradeS", "cpFormatS", "cpPreviewS", "cpApplyS", "classList", "setupClassCount");

  syncFormFromState();
  renderVersionLog();
  renderEvents();
  show("setupView");
  updateHeaderMeta();

  // ── Admin Panel Toggle ──
  const btnToggleAdmin = el("btnToggleAdmin");
  const adminPanel = el("adminPanel");
  if (btnToggleAdmin && adminPanel) {
    btnToggleAdmin.onclick = () => {
      adminPanel.classList.toggle("collapsed");
      const grid = adminPanel.closest(".grid2");
      if (adminPanel.classList.contains("collapsed")) {
        btnToggleAdmin.textContent = "\u25b6";
        btnToggleAdmin.title = "展開";
        if (grid) grid.classList.add("admin-collapsed");
      } else {
        btnToggleAdmin.textContent = "\u25c0 隠す";
        btnToggleAdmin.title = "隠す";
        if (grid) grid.classList.remove("admin-collapsed");
      }
    };
  }

  // ── Bracket Direction Toggle ──
  if (el("btnAutoFit")) el("btnAutoFit").onclick = () => {
    if (!currentEvent) return;
    const n = (currentEvent.matches?.filter(m => m.round === 1 && !m.isBye).length || 4) * 2;
    state.tournament.bracketUI = { ...state.tournament.bracketUI, ...autoFitBracketUI(n) };
    saveState();
    bindUiPanel();
    renderBracket();
    toast("ブラケットを自動調整しました", "info");
  };

  const btnBracketDir = el("btnBracketDir");
  if (btnBracketDir) {
    btnBracketDir.onclick = () => {
      const cur = state.tournament?.bracketDir || "vertical";
      const next = cur === "vertical" ? "horizontal" : "vertical";
      state.tournament.bracketDir = next;
      saveState();
      btnBracketDir.textContent = next === "horizontal" ? "\u2194 横型" : "\u2195 縦型";
      btnBracketDir.classList.toggle("active-dir", next === "horizontal");
      if (currentEvent) renderEventDetail(currentEvent.id);
    };
    // 初期状態を反映
    const initDir = state.tournament?.bracketDir || "vertical";
    btnBracketDir.textContent = initDir === "horizontal" ? "\u2194 横型" : "\u2195 縦型";
    btnBracketDir.classList.toggle("active-dir", initDir === "horizontal");
  }
  // シードオプションUIのbind
  function bindSeedOptions() {
    const sNone = el("seedNone");
    const sEnabled = el("seedEnabled");
    const sWrap = el("seedCountWrap");
    const sCnt = el("seedCount");
    if (!sNone || !sEnabled || !sWrap) return;

    // 現在のクラス数からbyeCountを計算してhintを更新する
    const updateSeedHint = () => {
      const classes = parseLines(el("classList")?.value || "");
      const n = classes.length;
      if (n < 2) return;
      const bSize = bracketSize(n);
      const byes = bSize - n;
      const hint = sWrap.querySelector(".seedHint");
      if (hint) {
        if (byes > 0) {
          hint.textContent = `推奨: ${byes}（= 不戦勝チーム数）`;
          hint.style.color = "var(--ok)";
        } else {
          hint.textContent = `チーム数がちょうど${bSize}枠（全員対戦あり）`;
          hint.style.color = "var(--muted)";
        }
      }
      // シード有り選択時にbyeCountを初期値に自動設定（変更済みでなければ）
      if (sEnabled.checked && sCnt && byes > 0) {
        if (sCnt.dataset.userSet !== "1") sCnt.value = String(byes);
      }
    };

    const syncUI = () => {
      if (sEnabled.checked) {
        sWrap.classList.remove("hidden");
        sWrap.style.display = "flex";
        updateSeedHint();
      } else {
        sWrap.classList.add("hidden");
      }
    };
    sNone.onchange = syncUI;
    sEnabled.onchange = () => {
      if (sCnt) sCnt.dataset.userSet = "0"; // シード切替時はauto-setを許可
      syncUI();
    };
    if (sCnt) sCnt.addEventListener("input", () => { sCnt.dataset.userSet = "1"; });

    // classList変更時にhintも更新
    el("classList")?.addEventListener("input", () => {
      if (sEnabled.checked) updateSeedHint();
    });

    const mode = state.tournament.seedMode || "none";
    if (mode === "seeded") {
      sEnabled.checked = true;
      if (sCnt) sCnt.value = String(state.tournament.seedCount ?? 2);
    } else {
      sNone.checked = true;
    }
    syncUI();
  }
  bindSeedOptions();

  // === Overtime Tracking Loop ===
  function isMatchOvertime(m, now, durationMin) {
    if (!m.scheduledStart) return false;
    if (m.state === "final" || m.isBye || m.state !== "playing") return false;

    const startObj = parseScheduledTime(m, now);
    const overtimeObj = new Date(startObj.getTime() + (durationMin + 5) * 60000);
    return now >= overtimeObj;
  }

  // ── 定期更新ループ（進行中ハイライト + 延長チェック）──────────────
  setInterval(() => {
    if (!currentEvent) return;
    const now = new Date();
    const durationMin = (currentEvent.settings?.matchMinutes || 10) + (currentEvent.settings?.turnoverMinutes || 2);
    const allM = currentEvent.loserMatches ? [...currentEvent.matches, ...currentEvent.loserMatches] : currentEvent.matches;
    let changed = false;
    allM.forEach(m => {
      if (m.state === "playing") {
        const wasOT = !!m._isOT;
        const isOT = isMatchOvertime(m, now, durationMin);
        if (isOT !== wasOT) {
          m._isOT = isOT;
          changed = true;
        }
      }
    });
    if (changed) renderBracket();
    // 進行中ハイライト更新（1分ごとでよいが、ここで10秒ごとに統合）
    updateOngoingMatches();
  }, 10000); // 10秒ごとにチェック

  // ── 総合ランキング集計 ──────────────────────────────
  const btnSavePoints = el("btnSavePoints");
  if (btnSavePoints) {
    btnSavePoints.onclick = () => {
      state.tournament.pointRules = {
        rank1: Number(el("ptRank1")?.value || 10),
        rank2: Number(el("ptRank2")?.value || 5),
        rank3: Number(el("ptRank3")?.value || 3),
        other: Number(el("ptRankOther")?.value || 1)
      };
      saveState();
      toast("ポイント設定を保存しました");
      if (el("overallRankingArea") && el("overallRankingArea").style.display !== "none") calcOverallRanking();
    };
  }

  // 設定パネルを開くときにポイント値をロード
  const origNavSetupOnclick = el("navSetup")?.onclick;
  if (el("navSetup")) {
    el("navSetup").onclick = () => {
      if (origNavSetupOnclick) origNavSetupOnclick();
      if (state.tournament.pointRules) {
        if (el("ptRank1")) el("ptRank1").value = state.tournament.pointRules.rank1;
        if (el("ptRank2")) el("ptRank2").value = state.tournament.pointRules.rank2;
        if (el("ptRank3")) el("ptRank3").value = state.tournament.pointRules.rank3;
        if (el("ptRankOther")) el("ptRankOther").value = state.tournament.pointRules.other;
      }
    };
  }

  const btnCalcRanking = el("btnCalcRanking");
  if (btnCalcRanking) {
    btnCalcRanking.onclick = () => {
      const area = el("overallRankingArea");
      if (area && area.style.display === "block") {
        area.style.display = "none";
      } else {
        calcOverallRanking();
      }
    };
  }

  function calcOverallRanking() {
    const rules = state.tournament.pointRules || { rank1: 10, rank2: 5, rank3: 3, other: 1 };
    const classPoints = {};
    (state.tournament.classes || []).forEach(c => classPoints[c] = 0);

    (state.events || []).forEach(ev => {
      if (ev.format === "league" || !ev.matches) return; // 現状トーナメントのみの解析

      const allRounds = [...new Set(ev.matches.map(m => m.round))].sort((a, b) => b - a);
      if (allRounds.length === 0) return;
      const finalRound = allRounds[0];
      const semiRound = allRounds.length > 1 ? allRounds[1] : null;

      const finals = ev.matches.filter(m => m.round === finalRound && m.state === "final");
      const semis = semiRound ? ev.matches.filter(m => m.round === semiRound && m.state === "final") : [];

      if (finals.length === 0) return; // 決勝が終わっていない場合は加点しない

      const champion = finals[0].winner === "A" ? finals[0].teamA : (finals[0].winner === "B" ? finals[0].teamB : null);
      const runnerUp = finals[0].winner === "A" ? finals[0].teamB : (finals[0].winner === "B" ? finals[0].teamA : null);

      const thirdPlaces = [];
      semis.forEach(m => {
        const loser = m.winner === "A" ? m.teamB : (m.winner === "B" ? m.teamA : null);
        if (loser) thirdPlaces.push(loser);
      });

      const participants = new Set();
      ev.matches.forEach(m => {
        if (m.teamA) participants.add(m.teamA);
        if (m.teamB) participants.add(m.teamB);
      });

      if (champion && classPoints[champion] !== undefined) classPoints[champion] += rules.rank1;
      if (runnerUp && classPoints[runnerUp] !== undefined) classPoints[runnerUp] += rules.rank2;
      thirdPlaces.forEach(t => {
        if (classPoints[t] !== undefined) classPoints[t] += rules.rank3;
      });

      participants.forEach(t => {
        if (t !== champion && t !== runnerUp && !thirdPlaces.includes(t)) {
          if (classPoints[t] !== undefined) classPoints[t] += rules.other;
        }
      });
    });

    const rankArray = Object.keys(classPoints).map(c => ({ name: c, pt: classPoints[c] })).sort((a, b) => b.pt - a.pt);

    const tbl = el("overallRankingTable");
    if (!tbl) return;

    let html = `<table class="timetable" style="width:100%; border-radius:8px; overflow:hidden;">
      <thead>
        <tr><th style="width:60px; text-align:center;">順位</th><th>クラス</th><th style="width:80px; text-align:center;">合計点</th></tr>
      </thead>
      <tbody>`;

    let currentRank = 1;
    for (let i = 0; i < rankArray.length; i++) {
      if (i > 0 && rankArray[i].pt < rankArray[i - 1].pt) currentRank = i + 1;
      const r = rankArray[i];
      let medal = currentRank === 1 ? "🥇 " : currentRank === 2 ? "🥈 " : currentRank === 3 ? "🥉 " : "";

      html += `<tr>
        <td style="text-align:center; font-weight:bold; color:var(--muted);">${currentRank}</td>
        <td style="font-weight:600;">${medal}${escapeHtml(r.name)}</td>
        <td style="text-align:center; font-weight:900; color:var(--primary); font-size:16px;">${r.pt}</td>
      </tr>`;
    }
    html += `</tbody></table>`;

    tbl.innerHTML = html;
    el("overallRankingArea").style.display = "block";
  }

  // ── キーボードショートカット ──────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Escape でモーダルを閉じる
    if (e.key === 'Escape') {
      const modals = ['resultModal', 'editMatchupsModal', 'editScheduleModal',
        'eventSettingsModal', 'loserSetupModal', 'advSeedingModal'];
      for (const id of modals) {
        const modal = el(id);
        if (modal && !modal.classList.contains('hidden')) {
          modal.classList.add('hidden');
          e.preventDefault();
          return;
        }
      }
    }
    // Ctrl+Z で元に戻す
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      if (undoStack.length > 0 && currentEvent) {
        e.preventDefault();
        performUndo();
        toast('操作を元に戻しました', 'info');
      }
    }
  });

  // ── 3位決定戦の自動生成ヘルパー ──────────────────────────────
  window.generateThirdPlaceMatch = function(event) {
    if (!event || !event.matches) return;
    const allRounds = [...new Set(event.matches.map(m => m.round))].sort((a, b) => a - b);
    const maxR = allRounds[allRounds.length - 1];
    if (maxR < 2) return;
    const semis = event.matches.filter(m => m.round === maxR - 1);
    if (semis.length !== 2) return;

    // 既に3位決定戦が存在するか確認
    const existing = event.matches.find(m => m.isThirdPlace);
    if (existing) { toast('3位決定戦は既に存在します', 'warn'); return; }

    const maxSlot = Math.max(...event.matches.map(m => m.slot));
    const thirdMatch = {
      round: maxR,
      slot: maxSlot + 1,
      isThirdPlace: true,
      teamA: null,
      teamB: null,
      scoreA: null, scoreB: null,
      winner: null, state: 'pending',
      court: event.settings?.courts?.split(',')[0]?.trim() || 'A',
      scheduledStart: null
    };

    // 準決勝の敗者を自動セット
    semis.forEach((m, i) => {
      if (m.state === 'final' && m.winner) {
        const loser = m.winner === 'A' ? m.teamB : m.teamA;
        if (i === 0) thirdMatch.teamA = loser;
        else thirdMatch.teamB = loser;
      }
    });

    event.matches.push(thirdMatch);
    assignMatchNumbers(event);
    saveState();
    toast('3位決定戦を追加しました', 'info');
    if (currentEvent && currentEvent.id === event.id) renderEventDetail(event.id);
  };

  statusBar.textContent = "status: admin ready (v1.5.0)";

})();
