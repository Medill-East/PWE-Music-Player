const CACHE_NAME = "pwe-music-player-shell-v14";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./i18n.js",
  "./license.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./catalog.json",
];

self.addEventListener("install", (event) => {
  // 必须带 cache: "reload"。cache.addAll() 默认允许走浏览器的 HTTP 缓存，
  // 于是即使换了 CACHE_NAME，也可能把**旧文件**装进新缓存桶——
  // 结果是新的 index.html 配上旧的 app.js，前端因为引用了已删除的元素直接起不来，
  // 而且没有任何报错，只停在「正在准备曲库」。必须强制走网络。
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(
      APP_SHELL.map((url) => new Request(url, { cache: "reload" })),
    )),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// stale-while-revalidate：立刻用缓存响应（快、可离线），同时后台拉新版写回缓存，
// 下次打开即是最新。用 cache-first 的话，曲库更新后用户会永远停在旧版本，
// 只能靠手动改 CACHE_NAME 才能推送更新。
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET"
    || event.request.destination === "audio"
    || url.hostname === "archive.org"      // 音频始终走网络，绝不缓存
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (url.origin === self.location.origin && response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch((error) => {
        if (cached) return cached;         // 离线时回落到缓存
        throw error;
      });

      return cached || network;            // 有缓存先给缓存，后台仍在更新
    }),
  );
});
