import { FilesetResolver, FaceDetector, GestureRecognizer } from "../vendor/mediapipe/vision_bundle.mjs";
import { CONFIG } from "./config.js";

const base = new URL("..", import.meta.url).href;

async function create(Task, options) {
  try {
    return await Task.createFromOptions(options.fileset, { ...options.opts, baseOptions: { ...options.opts.baseOptions, delegate: "GPU" } });
  } catch (e) {
    console.warn("GPU 실패, CPU로 재시도", e);
    return await Task.createFromOptions(options.fileset, { ...options.opts, baseOptions: { ...options.opts.baseOptions, delegate: "CPU" } });
  }
}

export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
  });
  video.srcObject = stream;
  await video.play();
}

export async function loadVision() {
  const fileset = await FilesetResolver.forVisionTasks(base + "vendor/mediapipe/wasm");
  const face = await create(FaceDetector, {
    fileset,
    opts: {
      baseOptions: { modelAssetPath: base + "models/blaze_face_short_range.tflite" },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    },
  });
  const gesture = await create(GestureRecognizer, {
    fileset,
    opts: {
      baseOptions: { modelAssetPath: base + "models/gesture_recognizer.task" },
      runningMode: "VIDEO",
      numHands: 2,
    },
  });
  return { face, gesture };
}

// 가장 큰 얼굴의 폭 비율 (0이면 얼굴 없음)
export function detectFace(face, video, ts) {
  const res = face.detectForVideo(video, ts);
  let best = 0;
  for (const d of res.detections) {
    const w = d.boundingBox.width / video.videoWidth;
    if (w > best) best = w;
  }
  return best;
}

// 인식된 동작 이름 (없으면 null)과 인식기 날 결과 (디버그용)
export function detectGesture(gesture, video, ts) {
  const res = gesture.recognizeForVideo(video, ts);
  let best = null;
  const raw = [];
  for (const hand of res.gestures) {
    const top = hand[0];
    if (!top) continue;
    raw.push(`${top.categoryName} ${top.score.toFixed(2)}`);
    if (!(top.categoryName in CONFIG.gestures) || top.score < CONFIG.gestureMinScore) continue;
    if (!best || top.score > best.score) best = top;
  }
  return { name: best ? best.categoryName : null, raw: res.landmarks.length ? raw.join(", ") || "손 잡힘, 동작 없음" : "손 안 잡힘" };
}

// 앞뒤 프레임 차이로 움직임 크기를 잰다 (0~1)
export class MotionMeter {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 64;
    this.canvas.height = 48;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.prev = null;
    this.value = 0;
  }

  update(video) {
    this.ctx.drawImage(video, 0, 0, 64, 48);
    const data = this.ctx.getImageData(0, 0, 64, 48).data;
    const gray = new Uint8Array(64 * 48);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = (data[i * 4] * 3 + data[i * 4 + 1] * 6 + data[i * 4 + 2]) / 10;
    }
    if (this.prev) {
      let changed = 0;
      for (let i = 0; i < gray.length; i++) if (Math.abs(gray[i] - this.prev[i]) > 18) changed++;
      const raw = Math.min(1, (changed / gray.length) * 4);
      this.value += (raw - this.value) * CONFIG.motionSmoothing;
    }
    this.prev = gray;
    return this.value;
  }
}
