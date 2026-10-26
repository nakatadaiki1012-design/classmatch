// クラスマッチ: トーナメント表の描画（admin.html / viewer.html 共通）
// 1試合 = 上下2段のカード。サイズ・配置はチーム名の長さと試合数から自動で決める。
// 8チーム以上は左右から決勝へ向かう「両側型」にして縦の長さを半分にする。
(function () {
  const NS = "http://www.w3.org/2000/svg";

  const STYLE = `
    .bv text { font-family: 'Noto Sans JP','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif; dominant-baseline: middle; }
    .bvHead { font-size: 12px; font-weight: 800; fill: #64748b; letter-spacing: .5px; }
    .bvHead.final { fill: #b45309; }
    .bvLine { fill: none; stroke: #cbd5e1; stroke-width: 1.6; }
    .bvLine.win { stroke: #16a34a; stroke-width: 2.6; }
    .bvBox { fill: #fff; stroke: #cbd5e1; stroke-width: 1.2; }
    .bvCard:hover .bvBox { stroke: #2563eb; stroke-width: 2; }
    .bvCard.sel .bvBox { stroke: #2563eb; stroke-width: 2.4; }
    .bvCard.st-final .bvBox { stroke: #94a3b8; }
    .bvCard.st-playing .bvBox, .bvCard.live .bvBox { stroke: #ef4444; stroke-width: 2.4; }
    .bvCard.st-calling .bvBox { stroke: #f59e0b; stroke-width: 2.2; }
    .bvSep { stroke: #e2e8f0; stroke-width: 1; }
    .bvWinBg { fill: #dcfce7; }
    .bvMineBg { fill: #fef08a; }
    .bvMineBar { fill: #ca8a04; }
    .bvName { fill: #1e293b; font-weight: 600; }
    .bvName.win { fill: #14532d; font-weight: 800; }
    .bvName.lose, .bvScore.lose { fill: #9ca3af; }
    .bvName.tbd { fill: #b6bfcc; font-weight: 400; font-size: 12px; }
    .bvScore { fill: #334155; font-weight: 800; font-family: ui-monospace, monospace; }
    .bvScore.win { fill: #14532d; }
    .bv text.bvCap { font-size: 10px; fill: #64748b; font-weight: 600; dominant-baseline: auto; }
    .bvCapBg { fill: #f1f5f9; }
    .bvCapIn { fill: #475569; font-weight: 700; }
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
   *   orientation : "auto"(既定) | "h"(横型: 左→右) | "v"(縦型: 下→上、決勝が上)
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

    // ── サイズの自動決定 ─────────────────────────────
    const names = [];
    matches.forEach(m => { if (m.teamA) names.push(teamLabel(m.teamA)); if (m.teamB) names.push(teamLabel(m.teamB)); });
    const longest = Math.max(3, ...names.map(textUnits));
    const nameUnits = Math.min(longest, 10);              // 10文字分を上限に省略
    const scoreW = Math.round(fs * 1.9);
    const cardW = Math.round(Math.max(fs * 6, Math.min(fs * 17, nameUnits * fs * 1.12 + scoreW + 22)));
    const rowH = Math.round(fs * 1.9);
    const cardH = rowH * 2;
    const pad = 12;
    // 横型
    const gapV = 12;
    const colGap = r1count >= 8 ? 22 : 30;
    const colW = cardW + colGap;
    const headH = Math.round(fs * 2.1);
    // 縦型
    const labelW = Math.round(fs * 4.6);                  // 左端のラウンド名
    const gapX = r1count >= 8 ? 10 : 18;
    const pitchX = cardW + gapX;
    const vGap = Math.round(fs * 2.4);                    // 段と段の間（線を通す）

    const narrow = opt.maxWidth && opt.maxWidth < 600;
    const MIN_SCALE = opt.minFontPx ? Math.min(1.6, Math.max(0.6, opt.minFontPx / fs)) : (narrow ? 0.85 : 0.7);
    const MAX_SCALE = Math.max(1.15, MIN_SCALE);

    // ── 配置の自動選択 ──────────────────────────────
    // 向き（横型/縦型）× 両側型/片側型 の候補から、画面に出る文字がいちばん大きく、
    // 縦横のはみ出しが少ないものを選ぶ。
    const depthFor = (mir) => mir ? 2 * (rounds - 1) + 1 : rounds;   // 回戦方向の段数
    const spreadFor = (mir) => mir ? half : r1count;                 // 試合が並ぶ数
    const sizeFor = (o, mir, capH) => o === "h"
      ? { w: pad * 2 + depthFor(mir) * colW - colGap,
          h: headH + spreadFor(mir) * (cardH + capH + gapV) + pad + (third ? cardH + capH + gapV + 10 : 0) }
      : { w: pad * 2 + labelW + spreadFor(mir) * pitchX - gapX,
          h: pad * 2 + depthFor(mir) * (cardH + capH + 6 + vGap) - vGap };
    const scaleOf = (sz) => opt.maxWidth ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, opt.maxWidth / sz.w)) : 1;
    const orients = opt.orientation === "h" ? ["h"] : opt.orientation === "v" ? ["v"] : ["h", "v"];
    const mirs = (rounds >= 3 && r1count >= 4) ? [false, true] : [false];
    let orient = orients[0], mirrored = false, best = -Infinity;
    for (const o of orients) for (const mir of mirs) {
      const sz = sizeFor(o, mir, 15);
      const sc = scaleOf(sz);
      const screenH = sz.h * sc;
      let score = sc;
      if (opt.maxHeight && screenH > opt.maxHeight) score *= (screenH > opt.maxHeight * 2 ? 0.5 : 0.8);
      const over = opt.maxWidth ? (sz.w * sc) / opt.maxWidth : 1;
      if (over > 1.02) score /= Math.sqrt(over);         // 横スクロールは縦より使いにくい
      if (o === "v" && orients.length > 1) score *= 0.97; // 自動のときは横型をやや優先
      score -= screenH / 1e5;                            // 同点なら背の低い方
      if (score > best) { best = score; orient = o; mirrored = mir; }
    }
    const expScale = scaleOf(sizeFor(orient, mirrored, 15));
    // 「第n試合 09:00 A」は画面上で 9.5px 以上、かつ本文の7割以上
    const capFs = Math.min(fs * 0.85, Math.max(10, fs * 0.72, 9.5 / expScale));
    const capH = Math.round(capFs + 5);
    const headFs = Math.max(12, fs * 0.86, 11 / expScale);

    // ── 位置（共通）──────────────────────────────────
    const span = (r) => Math.pow(2, r - 1);              // 1試合が覆う1回戦の枠数
    const sideOf = (m) => (!mirrored || m.round === rounds) ? "C" : ((m.slot * span(m.round)) < half ? "L" : "R");
    const posOf = (m) => {                                // 並び方向の位置（1回戦換算）
      if (mirrored && m.round === rounds) return (half - 1) / 2;
      let p = m.slot * span(m.round) + (span(m.round) - 1) / 2;
      if (mirrored && sideOf(m) === "R") p -= half;
      return p;
    };
    const depth = depthFor(mirrored);
    const depthOf = (m) => {                              // 回戦方向の段
      if (!mirrored) return m.round - 1;
      if (m.round === rounds) return rounds - 1;
      return sideOf(m) === "L" ? m.round - 1 : depth - m.round;
    };
    const roundAtDepth = (d) => !mirrored ? d + 1 : (d <= rounds - 1 ? d + 1 : depth - d);

    const V = orient === "v";
    const capRow = capH + 6;                              // 縦型: カード内の見出し行
    const boxH = V ? capRow + cardH : cardH;
    const rowStep = boxH + vGap;
    // 縦型は決勝を上に置く（片側型）／上下から中央の決勝へ（両側型）
    const vRow = (d) => mirrored ? d : (rounds - 1 - d);
    const cardX = (m) => V ? pad + labelW + posOf(m) * pitchX : pad + depthOf(m) * colW;
    const cardY = (m) => V ? pad + vRow(depthOf(m)) * rowStep : headH + posOf(m) * (cardH + capH + gapV) + capH;

    const svg = el("svg", { class: "bv" });
    svg.append(el("style", {}, STYLE));
    const gLines = el("g", {});
    const gCards = el("g", {});
    svg.append(gLines, gCards);
    // 縦型は描いた範囲から表の大きさを決める
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    const bump = (x, y, w, h) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h); };

    // ── 回戦名 ─────────────────────────────────────
    for (let d = 0; d < depth; d++) {
      const r = roundAtDepth(d);
      const cls = "bvHead" + (r === rounds ? " final" : "");
      if (V) {
        gCards.append(el("text", { x: pad, y: pad + vRow(d) * rowStep + boxH / 2, class: cls, style: `font-size:${headFs}px` }, roundName(r, rounds)));
      } else {
        gCards.append(el("text", { x: pad + d * colW + cardW / 2, y: headH * 0.6, "text-anchor": "middle", class: cls, style: `font-size:${headFs}px` }, roundName(r, rounds)));
      }
    }

    // ── 線（子カード → 親カード）─────────────────────
    for (const m of matches) {
      if (!m.nextMatchKey || m.isBye) continue;
      const p = byKey[m.nextMatchKey];
      if (!p) continue;
      const cls = "bvLine" + (m.state === "final" && m.winner ? " win" : "");
      let d;
      if (V) {
        const up = vRow(depthOf(p)) < vRow(depthOf(m));   // 親が上にある
        const x1 = cardX(m) + cardW / 2;
        const y1 = up ? cardY(m) : cardY(m) + boxH;
        const x2 = cardX(p) + cardW * (m.nextSlot === "B" ? 0.72 : 0.28);
        const y2 = up ? cardY(p) + boxH : cardY(p);
        d = `M${x1} ${y1} V${(y1 + y2) / 2} H${x2} V${y2}`;
      } else {
        const right = depthOf(p) > depthOf(m);
        const x1 = right ? cardX(m) + cardW : cardX(m);
        const y1 = cardY(m) + cardH / 2;
        const x2 = right ? cardX(p) : cardX(p) + cardW;
        const y2 = cardY(p) + (m.nextSlot === "B" ? rowH * 1.5 : rowH * 0.5);
        d = `M${x1} ${y1} H${(x1 + x2) / 2} V${y2} H${x2}`;
      }
      gLines.append(el("path", { d, class: cls }));
    }

    // ── カード ──────────────────────────────────────
    const nameMax = (cardW - scoreW - 18) / (fs * 1.08);
    const drawCard = (m, x, y, prefix = "") => {
      const key = keyOf(m);
      const st = m.state || "pending";
      const live = opt.isLive ? opt.isLive(m) : false;
      const hasTag = live || st === "playing" || st === "calling";
      const tfs = Math.max(9, capFs * 0.9), tagW = tfs * 4.4;
      // ラベルはカード右上に置くので、ラベルがあるときは見出しをカード幅の内側に収める
      const avail = hasTag ? cardW - tagW - (V ? 18 : 12) : (V ? cardW - 16 : cardW + colGap * 0.8);
      const caption = captionFit(m, prefix, avail);
      const g = el("g", { class: `bvCard st-${st}` + (live ? " live" : "") + (opt.selectedKey === key ? " sel" : ""), "data-key": key });
      const top = V ? y + capRow : y;                     // チーム名の1段目
      g.append(el("rect", { x, y, width: cardW, height: boxH, rx: 7, class: "bvBox" }));
      if (V) {
        g.append(el("rect", { x: x + 1, y: y + 1, width: cardW - 2, height: capRow - 1, rx: 6, class: "bvCapBg" }));
        g.append(el("text", { x: x + 8, y: y + capRow / 2 + 1, class: "bvCapIn", style: `font-size:${capFs}px` }, caption));
      } else {
        g.append(el("text", { x, y: y - 4, class: "bvCap", style: `font-size:${capFs}px` }, caption));
      }
      [["A", m.teamA, m.scoreA], ["B", m.teamB, m.scoreB]].forEach(([side, team, score], i) => {
        const ry = top + i * rowH;
        const won = m.winner === side;
        const cls = won ? "win" : (m.winner ? "lose" : "");
        const mine = opt.highlightTeam && team === opt.highlightTeam;
        if (mine) g.append(el("rect", { x: x + 1, y: ry + 1, width: cardW - 2, height: rowH - 2, rx: 6, class: "bvMineBg" }));
        else if (won) g.append(el("rect", { x: x + 1, y: ry + 1, width: cardW - 2, height: rowH - 2, rx: 6, class: "bvWinBg" }));
        if (mine) g.append(el("rect", { x: x + 1, y: ry + 3, width: 4, height: rowH - 6, rx: 2, class: "bvMineBar" }));
        const label = team ? fit(teamLabel(team), nameMax) : "未定";
        g.append(el("text", { x: x + 10, y: ry + rowH / 2, class: `bvName ${cls}` + (team ? "" : " tbd"), "font-size": fs }, label));
        if (score != null && score !== "") {
          g.append(el("text", { x: x + cardW - 10, y: ry + rowH / 2, "text-anchor": "end", class: `bvScore ${cls}`, "font-size": fs }, String(score)));
        }
      });
      g.append(el("line", { x1: x + 8, x2: x + cardW - 8, y1: top + rowH, y2: top + rowH, class: "bvSep" }));
      if (hasTag) {
        const t = st === "calling" ? "招集中" : "試合中";
        const bw = tagW, bh = tfs + 5;
        const by = V ? y + (capRow - bh) / 2 : y - bh - 1;
        g.append(el("rect", { x: x + cardW - bw - 4, y: by, width: bw, height: bh, rx: bh / 2, class: "bvTag " + (st === "calling" ? "calling" : "playing") }));
        g.append(el("text", { x: x + cardW - bw / 2 - 4, y: by + bh / 2 + 0.5, "text-anchor": "middle", class: "bvTagTxt", style: `font-size:${tfs}px` }, t));
      }
      if (opt.onClick) {
        g.style.cursor = "pointer";
        g.addEventListener("click", () => opt.onClick(key));
      }
      gCards.append(g);
      bump(x, V ? y : y - capH, cardW, boxH + (V ? 0 : capH));
    };

    // 「第n試合 09:00 A」を入る幅に合わせて短くする
    const captionFit = (m, prefix, avail) => {
      const n = m.matchNum, t = fmtTime(m.scheduledStart), c = m.court || "";
      const variants = [
        [n && `第${n}試合`, t, c], [n && `第${n}`, t, c], [n && `第${n}`, t], [n && `第${n}`], [t],
      ].map(v => (prefix ? prefix + " " : "") + v.filter(Boolean).join(" "));
      return variants.find(v => textUnits(v) * capFs * 1.05 <= avail) || variants[variants.length - 1];
    };

    for (const m of matches) {
      if (m.isBye) continue; // 不戦勝は描かない（勝ち上がったチームが次の回戦に表示される）
      drawCard(m, cardX(m), cardY(m));
    }

    const finalM = matches.find(m => m.round === rounds);
    const champ = opt.showChampion !== false && finalM && finalM.state === "final" && finalM.winner
      ? teamLabel(finalM.winner === "A" ? finalM.teamA : finalM.teamB) : null;
    const champFs = Math.max(13, fs * 0.95);

    if (!V) {
      // 横型: 優勝は決勝の下、3位決定戦はその下
      if (champ) {
        const fx = cardX(finalM), fy = cardY(finalM) + cardH + 8;
        gCards.append(el("rect", { x: fx, y: fy, width: cardW, height: 26, rx: 13, class: "bvChampBg" }));
        gCards.append(el("text", { x: fx + cardW / 2, y: fy + 13, "text-anchor": "middle", class: "bvChamp", style: `font-size:${champFs}px` }, `🏆 優勝 ${champ}`));
      }
      const width = pad * 2 + depth * colW - colGap;
      const rowsN = spreadFor(mirrored);
      let height = headH + rowsN * (cardH + capH + gapV) + pad + (third ? cardH + capH + gapV + 10 : 0);
      if (third && finalM) {
        const ty = Math.max(cardY(finalM) + cardH + 56, headH + rowsN * (cardH + capH + gapV) - cardH + capH);
        drawCard(third, cardX(finalM), Math.min(ty, height - cardH - pad), "3位決定戦");
      }
      return finish(svg, 0, 0, width, height);
    }

    // 縦型: 優勝は決勝の右、3位決定戦は決勝の左
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
      svgEl.dataset.orientation = orient;
      svgEl.dataset.mirrored = mirrored ? "1" : "0";
      // 縮尺: 基本は実寸、画面に合わせて MIN_SCALE〜MAX_SCALE の範囲で伸縮。足りなければスクロール
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
