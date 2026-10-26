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
    .bvName { fill: #1e293b; font-weight: 600; }
    .bvName.win { fill: #14532d; font-weight: 800; }
    .bvName.lose, .bvScore.lose { fill: #9ca3af; }
    .bvName.tbd { fill: #b6bfcc; font-weight: 400; font-size: 12px; }
    .bvScore { fill: #334155; font-weight: 800; font-family: ui-monospace, monospace; }
    .bvScore.win { fill: #14532d; }
    .bv text.bvCap { font-size: 10px; fill: #64748b; font-weight: 600; dominant-baseline: auto; }
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
   * @param {Object} opt  { onClick(key), selectedKey, isLive(m) -> bool, fontSize }
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
    const r1 = matches.filter(m => m.round === 1).sort((a, b) => a.slot - b.slot);
    const r1count = Math.max(1, Math.max(...r1.map(m => m.slot)) + 1);

    // ── サイズの自動決定 ─────────────────────────────
    const names = [];
    matches.forEach(m => { if (m.teamA) names.push(teamLabel(m.teamA)); if (m.teamB) names.push(teamLabel(m.teamB)); });
    const longest = Math.max(3, ...names.map(textUnits));
    const nameUnits = Math.min(longest, 10);              // 10文字分を上限に省略
    const scoreW = 26;
    const cardW = Math.round(Math.max(84, Math.min(240, nameUnits * fs * 1.12 + scoreW + 22)));
    const rowH = Math.round(fs * 1.9);
    const cardH = rowH * 2;
    const capH = 15;                                      // カード上の「第n試合 09:00 A」
    const gapV = 12;
    const pitch = cardH + capH + gapV;
    const colGap = r1count >= 8 ? 22 : 30;            // 大きい大会ほど列間を詰める
    const colW = cardW + colGap;
    const headH = 30;
    const pad = 12;

    // 8チーム以上(1回戦4試合以上)は両側型。ただし画面が狭くて収まらないときは片側型
    const widthFor = (nCols) => pad * 2 + nCols * colW - colGap;
    let mirrored = rounds >= 3 && r1count >= 4;
    if (mirrored && opt.maxWidth && widthFor(2 * (rounds - 1) + 1) * 0.7 > opt.maxWidth
        && widthFor(rounds) < widthFor(2 * (rounds - 1) + 1)) mirrored = false;
    const half = r1count / 2;

    // 各試合の「1回戦換算の位置」(縦方向) を求める: 1回戦 slot s → s、上位ラウンドは子の平均
    const span = (r) => Math.pow(2, r - 1);              // 1試合が覆う1回戦の枠数
    const sideOf = (m) => {
      if (!mirrored || m.round === rounds) return "C";
      return (m.slot * span(m.round)) < half ? "L" : "R";
    };
    const posOf = (m) => {
      const first = m.slot * span(m.round);               // 覆う1回戦の先頭
      let p = first + (span(m.round) - 1) / 2;
      if (mirrored && sideOf(m) === "R") p -= half;
      if (mirrored && m.round === rounds) p = (half - 1) / 2;
      return p;
    };
    const rows = mirrored ? half : r1count;

    // 列の位置
    const cols = mirrored ? 2 * (rounds - 1) + 1 : rounds;
    const colOf = (m) => {
      if (!mirrored) return m.round - 1;
      if (m.round === rounds) return rounds - 1;
      return sideOf(m) === "L" ? m.round - 1 : cols - m.round;
    };

    const width = pad * 2 + cols * colW - colGap;
    const height = headH + rows * pitch + pad + (third ? pitch + 10 : 0);
    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, class: "bv" });
    svg.dataset.naturalWidth = width;
    // 自動で縮尺: 基本は実寸、画面が狭ければ75%まで縮め、それ以上は横スクロール
    svg.style.width = "100%";
    svg.style.maxWidth = Math.round(width * 1.15) + "px";
    svg.style.minWidth = Math.round(width * 0.7) + "px";
    svg.style.height = "auto";
    svg.style.display = "block";
    svg.style.margin = "0 auto";

    svg.append(el("style", {}, STYLE));
    const gLines = el("g", {});
    const gCards = el("g", {});
    svg.append(gLines, gCards);

    const cardX = (m) => pad + colOf(m) * colW;
    const cardY = (m) => headH + posOf(m) * pitch + capH;

    // ── 列見出し ─────────────────────────────────────
    for (let c = 0; c < cols; c++) {
      let r;
      if (!mirrored) r = c + 1;
      else r = c <= rounds - 1 ? c + 1 : cols - c;
      const isFinal = r === rounds;
      gCards.append(el("text", {
        x: pad + c * colW + cardW / 2, y: 18, "text-anchor": "middle",
        class: "bvHead" + (isFinal ? " final" : ""),
      }, roundName(r, rounds)));
    }

    // ── 線（子カード → 親カードの該当段へ） ─────────────
    for (const m of matches) {
      if (!m.nextMatchKey || m.isBye) continue;
      const p = byKey[m.nextMatchKey];
      if (!p) continue;
      const decided = m.state === "final" && m.winner;
      const fromRight = colOf(p) > colOf(m);              // 親が右にある
      const x1 = fromRight ? cardX(m) + cardW : cardX(m);
      const y1 = cardY(m) + cardH / 2;
      const x2 = fromRight ? cardX(p) : cardX(p) + cardW;
      const y2 = cardY(p) + (m.nextSlot === "B" ? rowH * 1.5 : rowH * 0.5);
      const mx = (x1 + x2) / 2;
      gLines.append(el("path", {
        d: `M${x1} ${y1} H${mx} V${y2} H${x2}`,
        class: "bvLine" + (decided ? " win" : ""),
      }));
    }

    // ── カード ──────────────────────────────────────
    const nameMax = (cardW - scoreW - 18) / (fs * 1.08);
    const drawCard = (m, x, y, caption) => {
      const key = keyOf(m);
      const st = m.state || "pending";
      const live = opt.isLive ? opt.isLive(m) : false;
      const g = el("g", { class: `bvCard st-${st}` + (live ? " live" : "") + (opt.selectedKey === key ? " sel" : ""), "data-key": key });
      g.append(el("text", { x, y: y - 4, class: "bvCap" }, caption));
      g.append(el("rect", { x, y, width: cardW, height: cardH, rx: 7, class: "bvBox" }));
      [["A", m.teamA, m.scoreA], ["B", m.teamB, m.scoreB]].forEach(([side, team, score], i) => {
        const ry = y + i * rowH;
        const won = m.winner === side;
        const lost = m.winner && !won;
        const cls = won ? "win" : lost ? "lose" : "";
        if (won) g.append(el("rect", { x: x + 1, y: ry + 1, width: cardW - 2, height: rowH - 2, rx: 6, class: "bvWinBg" }));
        const label = team ? fit(teamLabel(team), nameMax) : "未定";
        g.append(el("text", { x: x + 10, y: ry + rowH / 2, class: `bvName ${cls}` + (team ? "" : " tbd"), "font-size": fs }, label));
        if (score != null && score !== "") {
          g.append(el("text", { x: x + cardW - 10, y: ry + rowH / 2, "text-anchor": "end", class: `bvScore ${cls}`, "font-size": fs }, String(score)));
        }
      });
      g.append(el("line", { x1: x + 8, x2: x + cardW - 8, y1: y + rowH, y2: y + rowH, class: "bvSep" }));
      if (live || st === "playing" || st === "calling") {
        const t = st === "calling" ? "招集中" : "試合中";
        const bw = 42;
        g.append(el("rect", { x: x + cardW - bw - 4, y: y - 14, width: bw, height: 13, rx: 6.5, class: "bvTag " + (st === "calling" ? "calling" : "playing") }));
        g.append(el("text", { x: x + cardW - bw / 2 - 4, y: y - 7.5, "text-anchor": "middle", class: "bvTagTxt" }, t));
      }
      if (opt.onClick) {
        g.style.cursor = "pointer";
        g.addEventListener("click", () => opt.onClick(key));
      }
      gCards.append(g);
    };

    const captionOf = (m) => [m.matchNum ? `第${m.matchNum}試合` : "", fmtTime(m.scheduledStart), m.court || ""].filter(Boolean).join("  ");

    for (const m of matches) {
      if (m.isBye) continue; // 不戦勝は描かない（勝ち上がったチームが次の回戦に表示される）
      drawCard(m, cardX(m), cardY(m), captionOf(m));
    }

    // 優勝表示
    const finalM = matches.find(m => m.round === rounds);
    if (finalM && finalM.state === "final" && finalM.winner) {
      const champ = teamLabel(finalM.winner === "A" ? finalM.teamA : finalM.teamB);
      const fx = cardX(finalM), fy = cardY(finalM) + cardH + 8;
      gCards.append(el("rect", { x: fx, y: fy, width: cardW, height: 26, rx: 13, class: "bvChampBg" }));
      gCards.append(el("text", { x: fx + cardW / 2, y: fy + 13, "text-anchor": "middle", class: "bvChamp" }, `🏆 優勝 ${champ}`));
    }

    // 3位決定戦（決勝の下）
    if (third && finalM) {
      const tx = cardX(finalM);
      const ty = Math.max(cardY(finalM) + cardH + 56, headH + rows * pitch - cardH + capH);
      drawCard(third, tx, Math.min(ty, height - cardH - pad), "3位決定戦  " + captionOf(third));
    }

    return svg;
  }

  window.BracketView = { build, keyOf };
})();
