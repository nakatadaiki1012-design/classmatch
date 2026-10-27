// クラスマッチ: Firebase Realtime Database によるリアルタイム共有（admin.html / viewer.html 共通）
// 管理画面が public/ に書き込み、生徒用画面が購読する。SDK は必要になった時に読み込む。
(function () {
  const SDK_VERSION = "10.14.1";
  const SDK = [
    `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-compat.js`,
    `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-database-compat.js`,
  ];
  const CFG_KEY = "cm_fb_config";
  const APP_NAME = "classmatch";

  // Realtime Database のセキュリティルール（管理者の鍵を持つ人だけが書き込める）
  const RULES = `{
  "rules": {
    "tournaments": {
      "$code": {
        ".read": false,
        "secret": { ".read": false },
        "public": {
          ".read": true,
          ".validate": "newData.hasChildren(['tournament'])"
        },
        ".write": "!data.child('secret').exists() || data.child('secret').val() === newData.child('secret').val()"
      }
    }
  }
}`;

  let app = null, db = null, sdkPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = resolve; s.onerror = () => reject(new Error("Firebase SDKを読み込めません（インターネット接続を確認してください）"));
      document.head.appendChild(s);
    });
  }
  function loadSdk() {
    if (window.firebase && window.firebase.database) return Promise.resolve();
    if (!sdkPromise) sdkPromise = SDK.reduce((p, src) => p.then(() => loadScript(src)), Promise.resolve()).catch(e => { sdkPromise = null; throw e; });
    return sdkPromise;
  }

  // ── 設定 ─────────────────────────────────────
  function normalize(cfg) {
    const c = Object.assign({}, cfg);
    if (!c.databaseURL && c.projectId) c.databaseURL = `https://${c.projectId}-default-rtdb.firebaseio.com`;
    return c;
  }
  function validate(cfg) {
    if (!cfg || typeof cfg !== "object") return "設定を読み取れませんでした";
    if (!cfg.apiKey) return "apiKey が見つかりません";
    if (!cfg.projectId) return "projectId が見つかりません";
    return "";
  }
  // Firebase コンソールの「const firebaseConfig = { ... };」や JSON を読み取る（evalは使わない）
  function parseConfigText(text) {
    const src = String(text || "");
    const start = src.indexOf("{"), end = src.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    // 1文字ずつ読み、文字列の外だけを整える（"https://..." の // をコメントと誤認しない）
    const body = src.slice(start, end + 1);
    let out = "", i = 0;
    while (i < body.length) {
      const ch = body[i];
      if (ch === '"' || ch === "'") {                       // 文字列はそのまま（ダブルクォートに統一）
        const q = ch; let j = i + 1, str = "";
        while (j < body.length && body[j] !== q) { if (body[j] === "\\") { str += body[j] + (body[j + 1] || ""); j += 2; } else { str += body[j]; j++; } }
        out += '"' + str.replace(/"/g, '\\"') + '"'; i = j + 1; continue;
      }
      if (ch === "/" && body[i + 1] === "/") { while (i < body.length && body[i] !== "\n") i++; continue; }          // 行コメント
      if (ch === "/" && body[i + 1] === "*") { const e = body.indexOf("*/", i + 2); i = e < 0 ? body.length : e + 2; continue; }  // ブロックコメント
      out += ch; i++;
    }
    out = out.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/,\s*([}\]])/g, "$1");   // キーに引用符・末尾カンマ除去
    try { return JSON.parse(out); } catch { return null; }
  }
  function getConfig() {
    try { const c = JSON.parse(localStorage.getItem(CFG_KEY) || "null"); return c && !validate(c) ? normalize(c) : null; } catch { return null; }
  }
  function setConfig(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(normalize(cfg))); }
  function clearConfig() { localStorage.removeItem(CFG_KEY); }
  // 生徒用リンクに入れる（URLセーフなbase64）。設定値は公開前提の値でパスワードではない
  function encodeConfig(cfg) {
    const c = normalize(cfg), keep = {};
    ["apiKey", "authDomain", "databaseURL", "projectId", "appId"].forEach(k => { if (c[k]) keep[k] = c[k]; });
    return btoa(unescape(encodeURIComponent(JSON.stringify(keep)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeConfig(s) {
    try {
      const b = String(s).replace(/-/g, "+").replace(/_/g, "/"); const pad = "=".repeat((4 - b.length % 4) % 4);
      const c = JSON.parse(decodeURIComponent(escape(atob(b + pad)))); return validate(c) ? null : normalize(c);
    } catch { return null; }
  }

  // ── 接続 ─────────────────────────────────────
  async function init(cfg) {
    cfg = normalize(cfg || getConfig());
    const err = validate(cfg); if (err) throw new Error(err);
    await loadSdk();
    const fb = window.firebase;
    app = fb.apps.find(a => a.name === APP_NAME) || fb.initializeApp(cfg, APP_NAME);
    db = app.database();
    return db;
  }
  const need = () => { if (!db) throw new Error("Firebaseに接続していません"); return db; };

  function makeCode() {
    const abc = "abcdefghjkmnpqrstuvwxyz23456789";   // 紛らわしい文字(i l o 0 1)を除く
    const a = new Uint32Array(8); crypto.getRandomValues(a);
    return Array.from(a, x => abc[x % abc.length]).join("");
  }
  function makeSecret() {
    const a = new Uint8Array(18); crypto.getRandomValues(a);
    return Array.from(a, x => x.toString(16).padStart(2, "0")).join("");
  }

  // 生徒に見せてよい内容だけを取り出す（管理PIN・Webhook・鍵などは含めない）
  function publicState(state) {
    const t = state.tournament || {};
    const pub = {
      tournament: {
        name: t.name || "", date: t.date || "", place: t.place || "",
        classes: t.classes || [], bracketOrient: t.bracketOrient === "v" ? "v" : "h",
        tickerText: t.tickerText || "", updatedAt: t.updatedAt || "",
      },
      events: state.events || [],
    };
    return JSON.parse(JSON.stringify(pub));          // undefined を除く（Firebaseは undefined を拒否する）
  }

  // 管理側: 公開データを書き込む。secret が一致しない/ルール未設定の場合は reject
  function publish(code, secret, state) {
    const pub = publicState(state);
    pub.pubAt = window.firebase.database.ServerValue.TIMESTAMP;   // サーバー時刻（端末の時計に依存しない）
    return need().ref("tournaments/" + code).update({ secret, public: pub });
  }

  // 生徒側: 公開データの購読。返り値は購読解除関数
  function subscribe(code, onData, onError) {
    const ref = need().ref("tournaments/" + code + "/public");
    const h = ref.on("value", snap => onData(snap.val()), err => onError && onError(err));
    return () => ref.off("value", h);
  }
  function onConnection(cb) {
    const ref = need().ref(".info/connected");
    const h = ref.on("value", s => cb(!!s.val()));
    return () => ref.off("value", h);
  }
  function onServerOffset(cb) {
    const ref = need().ref(".info/serverTimeOffset");
    const h = ref.on("value", s => cb(Number(s.val()) || 0));
    return () => ref.off("value", h);
  }

  // エラーを日本語の案内にする
  function explain(e) {
    const m = String((e && (e.code || e.message)) || e);
    if (/PERMISSION_DENIED|permission/i.test(m)) return "書き込みが拒否されました。Realtime Database の「ルール」に表示のルールを貼り付けて公開（Publish）してください。";
    if (/network|offline|Failed to fetch/i.test(m)) return "インターネットに接続できません。";
    if (/databaseURL|Can't determine Firebase Database URL/i.test(m)) return "databaseURL が見つかりません。Realtime Database を作成してから、設定をコピーし直してください。";
    return m;
  }

  window.FirebaseSync = {
    RULES, init, publish, subscribe, onConnection, onServerOffset, publicState,
    getConfig, setConfig, clearConfig, parseConfigText, encodeConfig, decodeConfig, validate,
    makeCode, makeSecret, explain, get connected() { return !!db; },
    // 後方互換: 以前のコードが参照していた enabled / save は使わない
    enabled: false,
  };
})();
