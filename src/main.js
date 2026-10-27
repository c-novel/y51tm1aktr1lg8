import { CONFIG } from "./config.js";
import { buildMatrix } from "./qr.js";
import { Display } from "./display.js";
import { startCamera, loadVision, detectFace, detectGesture, MotionMeter } from "./vision.js";

const params = new URLSearchParams(location.search);
const debugEl = document.getElementById("debug");
const video = document.getElementById("video");
let debug = params.has("debug");

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function loadImages() {
  const images = {};
  for (const [key, d] of Object.entries(CONFIG.designs)) {
    if (d.image) images[key] = await loadImage(d.image);
  }
  return images;
}

const state = {
  name: "idle", // idle | engaged | qr | busy
  engagedAt: 0,
  lastFaceAt: 0,
  cooldownUntil: 0,
  gesture: null,
  gestureSince: 0,
  lastGestureAt: 0,
  faceWidth: 0,
  energy: 0,
  visionError: null,
  fps: 0,
};

const matrix = buildMatrix(CONFIG.link);
const display = new Display(document.getElementById("screen"), matrix, await loadImages());

async function trigger(key) {
  if (state.name === "qr" || state.name === "busy") return;
  state.name = "busy";
  state.qrKey = key;
  await display.showQR(key);
  state.name = "qr";
  state.lastGestureAt = performance.now();
}

async function release() {
  if (state.name !== "qr") return;
  state.name = "busy";
  await display.hideQR();
  const now = performance.now();
  state.cooldownUntil = now + CONFIG.cooldownMs;
  const present = now - state.lastFaceAt < CONFIG.faceLostMs;
  state.name = present ? "engaged" : "idle";
  state.engagedAt = now;
  display.setMode(state.name);
}

function step(now) {
  const present = now - state.lastFaceAt < CONFIG.faceLostMs;

  if (state.name === "idle" && present) {
    state.name = "engaged";
    state.engagedAt = now;
    display.setMode("engaged");
  } else if (state.name === "engaged") {
    if (!present) {
      state.name = "idle";
      display.setMode("idle");
    } else if (now >= state.cooldownUntil && state.gesture && now - state.gestureSince >= CONFIG.gestureHoldMs) {
      trigger(CONFIG.gestures[state.gesture]);
    }
  } else if (state.name === "qr") {
    if (state.gesture) state.lastGestureAt = now;
    if (now - state.lastGestureAt >= CONFIG.qrHoldAfterGestureMs) release();
  }
}

// 카메라·인식
let vision = null;
const motion = new MotionMeter();
let lastVision = 0;

async function initVision() {
  try {
    await startCamera(video);
    vision = await loadVision();
  } catch (e) {
    state.visionError = String(e?.message || e);
    console.error(e);
  }
}

function runVision(now) {
  if (!vision || video.readyState < 2) return;
  if (now - lastVision < 1000 / CONFIG.visionFps) return;
  lastVision = now;

  state.energy = motion.update(video);
  display.setEnergy(state.energy);

  state.faceWidth = detectFace(vision.face, video, now);
  if (state.faceWidth >= CONFIG.faceMinWidth) state.lastFaceAt = now;

  if (state.name === "engaged" || state.name === "qr") {
    const { name: g, raw } = detectGesture(vision.gesture, video, now);
    state.gestureRaw = raw;
    if (g !== state.gesture) {
      state.gesture = g;
      state.gestureSince = now;
    }
  } else {
    state.gesture = null;
    state.gestureRaw = "얼굴이 기준보다 작아서 동작 인식 안 함";
  }
}

// 디버그 표시
let frames = 0;
let fpsAt = performance.now();
function drawDebug(now) {
  frames++;
  if (now - fpsAt >= 1000) {
    state.fps = frames;
    frames = 0;
    fpsAt = now;
  }
  debugEl.hidden = !debug;
  video.classList.toggle("show", debug);
  if (!debug) return;
  debugEl.textContent = [
    `상태 ${state.name}`,
    `얼굴 폭 ${state.faceWidth.toFixed(2)} (기준 ${CONFIG.faceMinWidth})`,
    `동작 ${state.gesture ?? "-"} (기준 점수 ${CONFIG.gestureMinScore})`,
    `인식기 결과 ${state.gestureRaw ?? "-"}`,
    `움직임 ${state.energy.toFixed(2)}`,
    `머문 시간 ${state.name === "engaged" ? ((now - state.engagedAt) / 1000).toFixed(1) + "s" : "-"}`,
    `화면 ${state.fps}fps`,
    state.visionError ? `카메라/인식 오류: ${state.visionError}` : "",
    "키: 2 엄지척 · 3 브이 · 4 손바닥 · 0 QR 내림 · D 디버그",
  ]
    .filter(Boolean)
    .join("\n");
}

function loop(now) {
  runVision(now);
  step(now);
  display.frame(now);
  drawDebug(now);
  requestAnimationFrame(loop);
}

// 키보드 테스트용
const keyMap = { 2: "thumb", 3: "victory", 4: "palm" };
window.addEventListener("keydown", (e) => {
  if (keyMap[e.key]) trigger(keyMap[e.key]);
  if (e.key === "0") release();
  if (e.key === "d" || e.key === "D") debug = !debug;
});

// 화면 왼쪽 위 모서리를 세 번 누르면 디버그 표시 전환
let taps = [];
window.addEventListener("pointerdown", (e) => {
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  if (e.clientX > 120 || e.clientY > 120) return;
  const now = performance.now();
  taps = taps.filter((t) => now - t < 1200);
  taps.push(now);
  if (taps.length >= 3) {
    debug = !debug;
    taps = [];
  }
});

// 화면 꺼짐 방지
async function keepAwake() {
  try {
    await navigator.wakeLock?.request("screen");
  } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") keepAwake();
});
keepAwake();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js");
}

requestAnimationFrame(loop);
if (!params.has("nocam")) initVision();
