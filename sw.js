// 以前このアドレスで配信していた別アプリ（リズムトレーナー）の service worker を消すためのファイル。
// 古い service worker が残っている端末でも、これに置き換わって自分を解除し、ページを再読み込みする。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
  })());
});
