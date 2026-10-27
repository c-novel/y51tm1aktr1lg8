// 처음 한 번 받아두면 인터넷 없이 동작하도록 전부 캐시한다.
// 파일을 바꿔 올릴 때는 VERSION 을 올린다.
const VERSION = "v1";
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "src/config.js",
  "src/main.js",
  "src/display.js",
  "src/qr.js",
  "src/vision.js",
  "vendor/qrcode.mjs",
  "vendor/mediapipe/vision_bundle.mjs",
  "vendor/mediapipe/wasm/vision_wasm_internal.js",
  "vendor/mediapipe/wasm/vision_wasm_internal.wasm",
  "vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
  "models/gesture_recognizer.task",
  "models/blaze_face_short_range.tflite",
  "assets/ghost.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
