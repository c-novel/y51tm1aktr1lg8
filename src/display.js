import { CONFIG } from "./config.js";
import { designCells, drawStyledQR } from "./qr.js";

const BLOCK = CONFIG.eqBlock; // 이퀄라이저 박스 하나 = QR BLOCK×BLOCK칸
const GAP = 0.18; // 박스 사이 여백 (QR 칸 크기 대비)
const SPLIT = 0.22; // 입자 진행 중 "쪼개지는" 구간 비율
const MORPH_MS = 900; // 조각 하나가 쪼개져 날아가는 시간
const SWEEP_MS = 420; // 왼쪽 막대 → 오른쪽 막대 시작 시차
const FADE_MS = 300; // 조각 → 완성 QR 크로스페이드

const ease = (t) => 1 - Math.pow(1 - t, 3);
const easeBack = (t) => {
  const c1 = 1.3;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mixColor(a, b, t) {
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}

export class Display {
  constructor(canvas, matrix, images) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.matrix = matrix;
    this.images = images;
    this.mode = "idle"; // idle | engaged
    this.phase = "eq"; // eq | morphIn | qr | morphOut
    this.energy = 0;

    const n = matrix.n;
    if (n % BLOCK !== 0) throw new Error(`QR 칸 수(${n})가 ${BLOCK}의 배수가 아님`);
    this.bars = n / BLOCK; // 막대 개수
    this.maxBoxes = CONFIG.eqMaxBoxes;
    this.levels = Array.from({ length: this.bars }, () => 0);
    this.seeds = this.levels.map(() => [Math.random() * 10, Math.random() * 10, 0.7 + Math.random() * 1.1, 1.6 + Math.random() * 1.8]);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.W = this.canvas.width = Math.round(window.innerWidth * dpr);
    this.H = this.canvas.height = Math.round(window.innerHeight * dpr);
    const n = this.matrix.n;
    this.cell = Math.max(2, Math.floor((this.H * CONFIG.qrHeightRatio) / n));
    this.qrX = Math.round((this.W - n * this.cell) / 2);
    this.qrY = Math.round((this.H - n * this.cell) / 2);

    this.rendered = {};
    for (const [key, design] of Object.entries(CONFIG.designs)) {
      const off = document.createElement("canvas");
      off.width = off.height = n * this.cell;
      drawStyledQR(off.getContext("2d"), this.matrix, design, 0, 0, this.cell, this.images[key]);
      this.rendered[key] = off;
    }
  }

  setMode(mode) {
    if (mode === "engaged" && this.mode === "idle") {
      // 다가오면 한 번 크게 튄다
      for (let i = 0; i < this.bars; i++) this.levels[i] = Math.min(1, this.levels[i] + 0.5 + Math.random() * 0.4);
    }
    this.mode = mode;
  }

  setEnergy(e) {
    this.energy = e;
  }

  boxCount(level) {
    return Math.max(1, Math.min(this.maxBoxes, Math.round(level * this.maxBoxes)));
  }

  // 막대 b의 아래에서 k번째 박스 (픽셀 좌표, 여백 제외)
  boxRect(b, k) {
    const span = BLOCK * this.cell;
    const g = GAP * this.cell;
    const x = this.qrX + b * span + g;
    const y = this.qrY + this.matrix.n * this.cell - (k + 1) * span + g;
    return [x, y, span - 2 * g];
  }

  // 지금 켜진 박스들을 3×3 조각으로 나눈 목록 (막대별)
  eqPieces(levels) {
    const out = [];
    for (let b = 0; b < this.bars; b++) {
      const pieces = [];
      const count = this.boxCount(levels[b]);
      for (let k = 0; k < count; k++) {
        const [x, y, s] = this.boxRect(b, k);
        const p = s / BLOCK;
        for (let i = 0; i < BLOCK; i++) for (let j = 0; j < BLOCK; j++) pieces.push([x + j * p, y + i * p, p]);
      }
      out.push(pieces);
    }
    return out;
  }

  // 디자인의 QR 칸 목록 (막대별: 막대 폭 3칸에 들어가는 칸)
  qrPieces(key) {
    const out = Array.from({ length: this.bars }, () => []);
    for (const [r, c] of designCells(this.matrix, CONFIG.designs[key])) {
      out[Math.floor(c / BLOCK)].push([this.qrX + c * this.cell, this.qrY + r * this.cell, this.cell]);
    }
    return out;
  }

  // 막대마다 박스 조각과 QR 칸을 짝짓는다. 위쪽 조각은 위쪽 칸으로 간다.
  buildParticles(from, to) {
    const byPos = (a, b) => a[1] - b[1] || a[0] - b[0];
    const particles = [];
    for (let b = 0; b < this.bars; b++) {
      const S = from[b].slice().sort(byPos);
      const T = to[b].slice().sort(byPos);
      const m = Math.max(S.length, T.length);
      for (let j = 0; j < m; j++) {
        const s = S.length ? S[Math.floor((j * S.length) / m)] : null;
        const t = T.length ? T[Math.floor((j * T.length) / m)] : null;
        const delay = (b / this.bars) * SWEEP_MS + Math.random() * 120;
        particles.push({ s: s ?? t, t: t ?? s, s0: s ? 1 : 0, s1: t ? 1 : 0, delay });
      }
    }
    return particles;
  }

  showQR(key) {
    this.qrKey = key;
    this.particles = this.buildParticles(this.eqPieces(this.levels), this.qrPieces(key));
    this.reverse = false;
    this.phase = "morphIn";
    this.phaseStart = performance.now();
    return new Promise((res) => (this.onPhaseDone = res));
  }

  hideQR() {
    // 다시 풀려날 이퀄라이저 모양을 정해두고 거기로 돌아간다
    const amp = this.mode === "idle" ? CONFIG.eqIdleAmp : CONFIG.eqEngagedAmp;
    for (let b = 0; b < this.bars; b++) this.levels[b] = clamp01(amp * (0.5 + Math.random() * 0.9));
    this.particles = this.buildParticles(this.eqPieces(this.levels), this.qrPieces(this.qrKey));
    this.reverse = true;
    this.phase = "morphOut";
    this.phaseStart = performance.now();
    return new Promise((res) => (this.onPhaseDone = res));
  }

  updateLevels(now) {
    const t = now / 1000;
    const base = this.mode === "idle" ? CONFIG.eqIdleAmp : CONFIG.eqEngagedAmp;
    const amp = clamp01(base + this.energy * CONFIG.eqMotionGain * (1 - base));
    const speed = 1 + this.energy * 2.5;
    for (let b = 0; b < this.bars; b++) {
      const [p1, p2, f1, f2] = this.seeds[b];
      let v = 0.55 + 0.3 * Math.sin(t * f1 * speed + p1) + 0.25 * Math.sin(t * f2 * speed + p2);
      if (Math.random() < 0.015 + this.energy * 0.2) v += Math.random() * 0.8;
      const target = clamp01(v * amp);
      const k = target > this.levels[b] ? 0.3 : 0.07;
      this.levels[b] += (target - this.levels[b]) * k;
    }
  }

  drawEQ() {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    for (let b = 0; b < this.bars; b++) {
      const count = this.boxCount(this.levels[b]);
      for (let k = 0; k < count; k++) {
        const [x, y, s] = this.boxRect(b, k);
        ctx.fillRect(x, y, s, s);
      }
    }
  }

  // 진행도 p: 0 = 박스 조각 자리, 1 = QR 칸 자리
  drawParticles(elapsed, alpha) {
    const ctx = this.ctx;
    const black = [0, 0, 0];
    const target = hexToRgb(CONFIG.designs[this.qrKey].color);
    ctx.globalAlpha = alpha;
    for (const pt of this.particles) {
      let p = clamp01((elapsed - pt.delay) / MORPH_MS);
      if (this.reverse) p = 1 - clamp01((elapsed - (SWEEP_MS + 120 - pt.delay)) / MORPH_MS);
      const split = clamp01(p / SPLIT); // 박스가 3×3으로 갈라짐
      const move = clamp01((p - SPLIT) / (1 - SPLIT)); // 갈라진 조각이 QR 칸으로 이동
      const em = this.reverse ? ease(move) : easeBack(move);
      const [sx, sy, ss] = pt.s;
      const [tx, ty, ts] = pt.t;
      const presence = lerp(pt.s0, pt.s1, ease(move));
      const size = lerp(ss * (1 - 0.18 * ease(split)), ts, ease(move)) * presence;
      if (size <= 0.5) continue;
      const cx = lerp(sx + ss / 2, tx + ts / 2, em);
      const cy = lerp(sy + ss / 2, ty + ts / 2, em);
      ctx.fillStyle = mixColor(black, target, ease(move));
      ctx.fillRect(cx - size / 2, cy - size / 2, size + 0.5, size + 0.5);
    }
    ctx.globalAlpha = 1;
  }

  frame(now) {
    const ctx = this.ctx;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, this.W, this.H);

    const total = SWEEP_MS + 120 + MORPH_MS;
    const elapsed = now - (this.phaseStart ?? now);

    if (this.phase === "eq") {
      this.updateLevels(now);
      this.drawEQ();
    } else if (this.phase === "morphIn") {
      if (elapsed < total) {
        this.drawParticles(elapsed, 1);
      } else {
        const f = clamp01((elapsed - total) / FADE_MS);
        this.drawParticles(total, 1 - f);
        ctx.globalAlpha = f;
        ctx.drawImage(this.rendered[this.qrKey], this.qrX, this.qrY);
        ctx.globalAlpha = 1;
        if (f >= 1) this.finishPhase("qr");
      }
    } else if (this.phase === "qr") {
      ctx.drawImage(this.rendered[this.qrKey], this.qrX, this.qrY);
    } else if (this.phase === "morphOut") {
      if (elapsed < FADE_MS) {
        const f = clamp01(elapsed / FADE_MS);
        this.drawParticles(0, f);
        ctx.globalAlpha = 1 - f;
        ctx.drawImage(this.rendered[this.qrKey], this.qrX, this.qrY);
        ctx.globalAlpha = 1;
      } else if (elapsed < FADE_MS + total) {
        this.drawParticles(elapsed - FADE_MS, 1);
      } else {
        this.finishPhase("eq");
        this.drawEQ();
      }
    }
  }

  finishPhase(next) {
    this.phase = next;
    const done = this.onPhaseDone;
    this.onPhaseDone = null;
    done?.();
  }
}
