// クラスマッチ: トーナメント表の描画（admin.html / viewer.html 共通）
// 1試合 = 上下2段のカード。サイズ・配置はチーム名の長さと試合数から自動で決める。
// 8チーム以上は左右(縦型は上下)から決勝へ向かう「両側型」。横型でもスマホ幅は片側型。
(function () {
  const NS = "http://www.w3.org/2000/svg";

  const STYLE = `
    .bv text { font-family: 'Noto Sans JP','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif; dominant-baseline: middle; }
    .bvHead { font-size: 12px; font-weight: 800; fill: #64748b; letter-spacing: .5px; }
    .bvHead.final { fill: #b45309; }
    .bvLine { fill: none; stroke: #cbd5e1; stroke-width: 1.8; }
    .bvLine.win { stroke: #16a34a; stroke-width: 3; }
    .bvBox { fill: #fff; stroke: #94a3b8; stroke-width: 1.5; }
    .bvCard.tbd .bvBox { stroke: #cbd5e1; stroke-dasharray: 5 4; }
    .bvCard:hover .bvBox { stroke: #2563eb; stroke-width: 2.2; }
    .bvCard.sel .bvBox { stroke: #2563eb; stroke-width: 2.6; }
    .bvCard.st-playing .bvBox, .bvCard.live .bvBox { stroke: #ef4444; stroke-width: 2.8; }
    .bvCard.st-calling .bvBox { stroke: #f59e0b; stroke-width: 2.6; }
    .bvHdr { fill: #eef2f7; }
    .bvCard.st-playing .bvHdr, .bvCard.live .bvHdr { fill: #fee2e2; }
    .bvCard.st-calling .bvHdr { fill: #fef3c7; }
    .bvHdrTxt { fill: #334155; font-weight: 700; }
    .bvSep { stroke: #e2e8f0; stroke-width: 1.2; }
    .bvWinBg { fill: #f0fdf4; }
    .bvWinBar { fill: #16a34a; }
    .bvMineBg { fill: #fef08a; }
    .bvMineBar { fill: #ca8a04; }
    .bvName { fill: #0f172a; font-weight: 700; }
    .bvName.win { fill: #14532d; font-weight: 900; }
    .bvName.lose { fill: #9ca3af; font-weight: 500; }
    .bvName.tbd { fill: #94a3b8; font-weight: 500; }
    .bvScBox { fill: #f1f5f9; stroke: #cbd5e1; stroke-width: 1; }
    .bvScBox.win { fill: #16a34a; stroke: #15803d; }
    .bvScBox.lose { fill: #f1f5f9; stroke: #e2e8f0; }
    .bvScore { fill: #334155; font-weight: 800; font-family: ui-monospace, 'SF Mono', monospace; }
    .bvScore.win { fill: #fff; }
    .bvScore.lose { fill: #9ca3af; }
    .bvTag.playing { fill: #ef4444; } .bvTag.calling { fill: #f59e0b; }
    .bvTagTxt { font-size: 9px; font-weight: 800; fill: #fff; }
    .bvChampBg { fill: #fef3c7; stroke: #f59e0b; stroke-width: 1.5; }
    .bvChamp { font-size: 13px; font-weight: 900; fill: #92400e; }
  `;


  const keyOf = (m) => `${m.isLoserMatch ? "L" : "R"}${m.round}-${m.slot}`;
  const fmtTime = (d) => {
    if (!d) return "";
    const t = new Date(d);
    if (isNaN(t)) return "";
    return String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
  };
  // "__L|R1-0|A v B__" のような敗者プレースホルダを読める表記に
  const teamLabel = (name) => {
    if (!name) return "";
    if (name.startsWith("__L|") && name.endsWith("__")) {
      const parts = name.slice(4, -2).split("|");
      return (parts[1] || parts[0]) + " の負け";
    }
    return name;
  };
  // 全角は1、半角は0.55として表示幅を見積もる
  const textUnits = (s) => [...String(s)].reduce((n, ch) => n + (/[\x20-\x7e]/.test(ch) ? 0.58 : 1), 0);

  const roundName = (r, rounds) => {
    const d = rounds - r;
    return d === 0 ? "決勝" : d === 1 ? "準決勝" : d === 2 ? "準々決勝" : `${r}回戦`;
  };

  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  // 長すぎる名前は幅に合わせて省略
  function fit(name, maxUnits) {
    if (textUnits(name) <= maxUnits) return name;
    let out = "";
    for (const ch of name) {
      if (textUnits(out + ch) > maxUnits - 1) break;
      out += ch;
    }
    return out + "…";
  }

  /**
   * @param {Array} allMatches  試合配列（エキシビション・3位決定戦を含んでよい）
   * @param {Object} opt
   *   onClick(key), selectedKey, isLive(m)
   *   maxWidth / maxHeight : 表示に使える幅・高さ(px)。配置と縮尺の自動選択に使う
   *   orientation : "h"(横型: 左→右。既定) | "v"(縦型: 下→上、決勝が上)。自動では入れ替えない
   *   fontSize    : 基本の文字サイズ（既定14）
   *   minFontPx   : 画面上でこれより小さくしない（足りなければスクロール）
   *   highlightTeam : このチーム名の段を黄色で強調（「自分のクラス」）
   *   showChampion  : false で表の中の「🏆 優勝」表示を省く（別に最終順位を出すとき）
   * @returns {SVGElement}
   */
  function build(allMatches, opt = {}) {
    const fs = opt.fontSize || 14;
    const third = allMatches.find(m => m.isThirdPlace);
    const matches = allMatches.filter(m => !m.isExhibition && !m.isThirdPlace);
    if (!matches.length) return el("svg", { width: 0, height: 0 });

    const rounds = Math.max(...matches.map(m => m.round));
    const byKey = {};
    matches.forEach(m => (byKey[keyOf(m)] = m));
    const r1 = matches.filter(m => m.round === 1);
    const r1count = Math.max(1, Math.max(...r1.map(m => m.slot)) + 1);
    const half = r1count / 2;

    // ── 向き・形はユーザーの選択とチーム数だけで決める（画面サイズで勝手に入れ替えない）
    const V = opt.orientation === "v";                    // 既定は横型
    // スマホかどうかは画面（端末）の幅で判断する。表を置く枠の幅で判断すると、
    // 試合リストの開閉などで形が変わってしまうため
    const narrow = typeof window !== "undefined" ? window.innerWidth < 600 : !!(opt.maxWidth && opt.maxWidth < 600);
    // 両側型: 縦型は常に（横幅を半分にできる）、横型はスマホ以外で
    const mirrored = rounds >= 3 && r1count >= 4 && (V || !narrow);

    // ── サイズ ───────────────────────────────────────
    const names = [];
    matches.forEach(m => { if (m.teamA) names.push(teamLabel(m.teamA)); if (m.teamB) names.push(teamLabel(m.teamB)); });
    const longest = Math.max(3, ...names.map(textUnits));
    const nameUnits = Math.min(longest, 10);
    const scoreW = Math.round(fs * 2.1);                   // 点数の箱
    const hdrUnits = 8.8;                                  // 見出し「第15試合 10:24 A」が入る幅
    const cardW = Math.round(Math.max(fs * 7, hdrUnits * fs * 0.8 + 16, Math.min(fs * 17, nameUnits * fs * 1.12 + scoreW + 26)));
    const rowH = Math.round(fs * 2.1);
    const cardH = rowH * 2;
    const pad = 12;
    const gapV = 14;
    const colGap = r1count >= 8 ? 24 : 32;
    const colW = cardW + colGap;
    const headH = Math.round(fs * 2.1);
    const labelW = Math.round(fs * 4.6);
    const gapX = r1count >= 8 ? 12 : 20;
    const pitchX = cardW + gapX;
    const vGap = Math.round(fs * 2.4);

    const MIN_SCALE = opt.minFontPx ? Math.min(1.6, Math.max(0.6, opt.minFontPx / fs)) : (narrow ? 0.85 : 0.7);
    const MAX_SCALE = Math.max(1.15, MIN_SCALE);
    const depth = mirrored ? 2 * (rounds - 1) + 1 : rounds;     // 回戦方向の段数
    const spread = mirrored ? half : r1count;                   // 試合が並ぶ数
    const estW = V ? pad * 2 + labelW + spread * pitchX - gapX : pad * 2 + depth * colW - colGap;
    const expScale = opt.maxWidth ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, opt.maxWidth / estW)) : 1;
    const capFs = Math.min(fs * 0.85, Math.max(10.5, fs * 0.74, 9.5 / expScale));
    const capRow = Math.round(capFs + 11);                // カード内の見出し帯
    const boxH = capRow + cardH;
    const headFs = Math.max(12, fs * 0.86, 11 / expScale);

    // ── 位置 ─────────────────────────────────────────
    const span = (r) => Math.pow(2, r - 1);
    const sideOf = (m) => (!mirrored || m.round === rounds) ? "C" : ((m.slot * span(m.round)) < half ? "L" : "R");
    const posOf = (m) => {
      if (mirrored && m.round === rounds) return (half - 1) / 2;
      let p = m.slot * span(m.round) + (span(m.round) - 1) / 2;
      if (mirrored && sideOf(m) === "R") p -= half;
      return p;
    };
    const depthOf = (m) => {
      if (!mirrored) return m.round - 1;
      if (m.round === rounds) return rounds - 1;
      return sideOf(m) === "L" ? m.round - 1 : depth - m.round;
    };
    const roundAtDepth = (d) => !mirrored ? d + 1 : (d <= rounds - 1 ? d + 1 : depth - d);
    const rowStep = boxH + vGap;
    const vRow = (d) => mirrored ? d : (rounds - 1 - d);  // 縦型: 決勝が上
    const cardX = (m) => V ? pad + labelW + posOf(m) * pitchX : pad + depthOf(m) * colW;
    const cardY = (m) => V ? pad + vRow(depthOf(m)) * rowStep : headH + posOf(m) * (boxH + gapV);

    const svg = el("svg", { class: "bv" });
    svg.append(el("style", {}, STYLE));
    const gLines = el("g", {});
    const gCards = el("g", {});
    svg.append(gLines, gCards);
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    const bump = (x, y, w, h) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h); };

    // ── 回戦名 ─────────────────────────────────────
    for (let d = 0; d < depth; d++) {
      const r = roundAtDepth(d);
      const cls = "bvHead" + (r === rounds ? " final" : "");
      if (V) gCards.append(el("text", { x: pad, y: pad + vRow(d) * rowStep + boxH / 2, class: cls, style: `font-size:${headFs}px` }, roundName(r, rounds)));
      else gCards.append(el("text", { x: pad + d * colW + cardW / 2, y: headH * 0.5, "text-anchor": "middle", class: cls, style: `font-size:${headFs}px` }, roundName(r, rounds)));
    }

    // ── 線 ───────────────────────────────────────
    const rowMid = (m, slot) => cardY(m) + capRow + (slot === "B" ? rowH * 1.5 : rowH * 0.5);
    for (const m of matches) {
      if (!m.nextMatchKey || m.isBye) continue;
      const p = byKey[m.nextMatchKey];
      if (!p) continue;
      const cls = "bvLine" + (m.state === "final" && m.winner ? " win" : "");
      let d;
      if (V) {
        const up = vRow(depthOf(p)) < vRow(depthOf(m));
        const x1 = cardX(m) + cardW / 2;
        const y1 = up ? cardY(m) : cardY(m) + boxH;
        const x2 = cardX(p) + cardW * (m.nextSlot === "B" ? 0.72 : 0.28);
        const y2 = up ? cardY(p) + boxH : cardY(p);
        d = `M${x1} ${y1} V${(y1 + y2) / 2} H${x2} V${y2}`;
      } else {
        const right = depthOf(p) > depthOf(m);
        const x1 = right ? cardX(m) + cardW : cardX(m);
        const y1 = cardY(m) + capRow + cardH / 2;
        const x2 = right ? cardX(p) : cardX(p) + cardW;
        const y2 = rowMid(p, m.nextSlot);
        d = `M${x1} ${y1} H${(x1 + x2) / 2} V${y2} H${x2}`;
      }
      gLines.append(el("path", { d, class: cls }));
    }

    // ── カード ──────────────────────────────────────
    const nameMax = (cardW - scoreW - 26) / (fs * 1.08);
    const tfs = Math.max(9.5, capFs * 0.9), tagW = tfs * 4.2, tagH = tfs + 6;
    const headerFit = (m, prefix, avail) => {
      const n = m.matchNum, t = fmtTime(m.scheduledStart), c = m.court || "";
      // 幅が足りないときは コート → 時刻 の順に省く（試合番号は呼び出しに使うので最後まで残す）
      const v = [[n && `第${n}試合`, t, c && c + "コート"], [n && `第${n}試合`, t, c], [n && `第${n}試合`, t], [n && `第${n}試合`], [t, c], [t]]
        .map(x => (prefix ? prefix + " " : "") + x.filter(Boolean).join(" "));
      return v.find(x => textUnits(x) * capFs * 1.05 <= avail) || v[v.length - 1];
    };
    const drawCard = (m, x, y, prefix = "") => {
      const key = keyOf(m);
      const st = m.state || "pending";
      const live = opt.isLive ? opt.isLive(m) : false;
      const tagKind = st === "calling" ? "calling" : (live || st === "playing") ? "playing" : null;
      const tbd = !(m.teamA && m.teamB) && st !== "final";
      const g = el("g", { class: `bvCard st-${st}` + (live ? " live" : "") + (tbd ? " tbd" : "") + (opt.selectedKey === key ? " sel" : ""), "data-key": key });
      g.append(el("rect", { x, y, width: cardW, height: boxH, rx: 8, class: "bvBox" }));
      // 見出し帯（試合番号・時刻・コート、右端に状態）
      g.append(el("path", { d: `M${x + 1} ${y + capRow} V${y + 8} Q${x + 1} ${y + 1} ${x + 8} ${y + 1} H${x + cardW - 8} Q${x + cardW - 1} ${y + 1} ${x + cardW - 1} ${y + 8} V${y + capRow} Z`, class: "bvHdr" }));
      g.append(el("line", { x1: x + 1, x2: x + cardW - 1, y1: y + capRow, y2: y + capRow, class: "bvSep" }));
      const avail = cardW - 16 - (tagKind ? tagW + 6 : 0);
      g.append(el("text", { x: x + 8, y: y + capRow / 2 + 1, class: "bvHdrTxt", style: `font-size:${capFs}px` }, headerFit(m, prefix, avail)));
      if (tagKind) {
        const ty = y + (capRow - tagH) / 2;
        g.append(el("rect", { x: x + cardW - tagW - 6, y: ty, width: tagW, height: tagH, rx: tagH / 2, class: "bvTag " + tagKind }));
        g.append(el("text", { x: x + cardW - tagW / 2 - 6, y: ty + tagH / 2 + 0.5, "text-anchor": "middle", class: "bvTagTxt", style: `font-size:${tfs}px` }, tagKind === "calling" ? "招集中" : "試合中"));
      }
      const top = y + capRow;
      [["A", m.teamA, m.scoreA], ["B", m.teamB, m.scoreB]].forEach(([side, team, score], i) => {
        const ry = top + i * rowH;
        const won = m.winner === side;
        const cls = won ? "win" : (m.winner ? "lose" : "");
        const mine = opt.highlightTeam && team === opt.highlightTeam;
        const bottom = i === 1;
        const bgD = (fill) => el("path", { d: bottom
          ? `M${x + 1} ${ry} H${x + cardW - 1} V${ry + rowH - 8} Q${x + cardW - 1} ${ry + rowH - 1} ${x + cardW - 8} ${ry + rowH - 1} H${x + 8} Q${x + 1} ${ry + rowH - 1} ${x + 1} ${ry + rowH - 8} Z`
          : `M${x + 1} ${ry} H${x + cardW - 1} V${ry + rowH} H${x + 1} Z`, class: fill });
        if (mine) g.append(bgD("bvMineBg"));
        else if (won) g.append(bgD("bvWinBg"));
        if (won || mine) g.append(el("rect", { x: x + 1, y: ry + 4, width: 5, height: rowH - 8, rx: 2.5, class: mine ? "bvMineBar" : "bvWinBar" }));
        const label = team ? fit(teamLabel(team), nameMax) : "未定";
        g.append(el("text", { x: x + 12, y: ry + rowH / 2 + 1, class: `bvName ${cls}` + (team ? "" : " tbd"), "font-size": team ? fs : fs * 0.9 }, label));
        if (score != null && score !== "") {
          const bx = x + cardW - scoreW - 6, bh = rowH - 10;
          g.append(el("rect", { x: bx, y: ry + 5, width: scoreW, height: bh, rx: 5, class: `bvScBox ${cls}` }));
          g.append(el("text", { x: bx + scoreW / 2, y: ry + rowH / 2 + 1, "text-anchor": "middle", class: `bvScore ${cls}`, "font-size": fs * 1.05 }, String(score)));
        }
      });
      g.append(el("line", { x1: x + 1, x2: x + cardW - 1, y1: top + rowH, y2: top + rowH, class: "bvSep" }));
      if (opt.onClick) {
        g.style.cursor = "pointer";
        g.addEventListener("click", () => opt.onClick(key));
      }
      gCards.append(g);
      bump(x, y, cardW, boxH);
    };

    for (const m of matches) {
      if (m.isBye) continue;
      drawCard(m, cardX(m), cardY(m));
    }

    const finalM = matches.find(m => m.round === rounds);
    const champ = opt.showChampion !== false && finalM && finalM.state === "final" && finalM.winner
      ? teamLabel(finalM.winner === "A" ? finalM.teamA : finalM.teamB) : null;
    const champFs = Math.max(13, fs * 0.95);

    if (!V) {
      bump(0, 0, 0, 0);
      for (let d = 0; d < depth; d++) bump(pad + d * colW, 0, cardW, headH);
      if (finalM) {
        const fx = cardX(finalM), fy = cardY(finalM) + boxH + 10;
        let ny = fy;
        if (champ) {
          gCards.append(el("rect", { x: fx, y: fy, width: cardW, height: 28, rx: 14, class: "bvChampBg" }));
          gCards.append(el("text", { x: fx + cardW / 2, y: fy + 14, "text-anchor": "middle", class: "bvChamp", style: `font-size:${champFs}px` }, `🏆 優勝 ${champ}`));
          bump(fx, fy, cardW, 28); ny += 40;
        }
        if (third) drawCard(third, fx, Math.max(ny + 8, fy + 30), "3位決定戦");
      }
      return finish(svg, 0, 0, Math.max(maxX, pad * 2 + depth * colW - colGap) + pad, maxY + pad);
    }

    if (finalM) {
      const fx = cardX(finalM), fy = cardY(finalM);
      if (champ) {
        const txt = `🏆 優勝 ${champ}`;
        const w = textUnits(txt) * champFs + 28, h = champFs * 2.2;
        const cx = fx + cardW + gapX + 6, cy = fy + boxH / 2 - h / 2;
        gLines.append(el("path", { d: `M${fx + cardW} ${fy + boxH / 2} H${cx}`, class: "bvLine win" }));
        gCards.append(el("rect", { x: cx, y: cy, width: w, height: h, rx: h / 2, class: "bvChampBg" }));
        gCards.append(el("text", { x: cx + w / 2, y: cy + h / 2 + 1, "text-anchor": "middle", class: "bvChamp", style: `font-size:${champFs}px` }, txt));
        bump(cx, cy, w, h);
      }
      if (third) drawCard(third, fx - cardW - gapX * 2 - 6, fy, "3位決定戦");
    }
    return finish(svg, minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);

    function finish(svgEl, x0, y0, w, h) {
      svgEl.setAttribute("viewBox", `${x0} ${y0} ${w} ${h}`);
      svgEl.dataset.naturalWidth = w;
      svgEl.dataset.expectedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, opt.maxWidth ? opt.maxWidth / w : 1)).toFixed(3);
      svgEl.dataset.orientation = V ? "v" : "h";
      svgEl.dataset.mirrored = mirrored ? "1" : "0";
      svgEl.style.width = "100%";
      svgEl.style.maxWidth = Math.round(w * MAX_SCALE) + "px";
      svgEl.style.minWidth = Math.round(w * MIN_SCALE) + "px";
      svgEl.style.height = "auto";
      svgEl.style.display = "block";
      svgEl.style.margin = "0 auto";
      return svgEl;
    }
  }

  // 表が横にはみ出しているとき「→ 横にスクロール」の案内を表示する
  function addScrollHint(container, target = container) {
    if (!container) return;
    container.querySelectorAll(".bvScrollHint").forEach(e => e.remove());
    requestAnimationFrame(() => {
      if (container.scrollWidth <= container.clientWidth + 4) return;
      const h = document.createElement("div");
      h.className = "bvScrollHint";
      h.textContent = "← 横にスクロールして決勝まで見られます →";
      h.style.cssText = "position:sticky;left:0;font-size:12px;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:6px 10px;margin:0 0 8px;text-align:center;width:max-content;max-width:100%;";
      const svg = target.querySelector("svg.bv");
      if (svg) svg.before(h); else target.prepend(h);
    });
  }

  window.BracketView = { build, keyOf, addScrollHint };
})();
