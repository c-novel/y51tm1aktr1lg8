import qrcode from "../vendor/qrcode.mjs";

// 링크 → QR 칸 배열. 모든 디자인이 같은 배열을 쓴다.
export function buildMatrix(link) {
  const qr = qrcode(0, "H");
  qr.addData(link);
  qr.make();
  const n = qr.getModuleCount();
  const dark = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    dark.push(row);
  }
  return { n, dark };
}

// 가운데 이미지가 들어갈 칸 범위. 오류 복원 H 단계 안에서 가릴 수 있는 크기로 잡는다.
export function logoBox(n) {
  let size = Math.floor(n * 0.3);
  if (size % 2 !== n % 2) size += 1;
  const start = (n - size) / 2;
  return { start, end: start + size };
}

function inFinder(n, r, c) {
  return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
}

// 디자인별로 실제로 칠할 칸. 가운데 이미지 자리는 비운다.
export function designCells(matrix, design) {
  const { n, dark } = matrix;
  const box = design.image ? logoBox(n) : null;
  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!dark[r][c]) continue;
      if (box && r >= box.start && r < box.end && c >= box.start && c < box.end) continue;
      cells.push([r, c]);
    }
  }
  return cells;
}

function roundRectPath(ctx, x, y, w, h, rad) {
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// 완성된 QR을 그린다. (x, y) = 왼쪽 위, cell = 칸 크기(px)
export function drawStyledQR(ctx, matrix, design, x, y, cell, image) {
  const { n, dark } = matrix;
  ctx.fillStyle = design.color;
  const box = design.image ? logoBox(n) : null;

  if (design.dot === "square") {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!dark[r][c]) continue;
        if (box && r >= box.start && r < box.end && c >= box.start && c < box.end) continue;
        ctx.fillRect(x + c * cell, y + r * cell, cell + 0.5, cell + 0.5);
      }
    }
  } else {
    ctx.beginPath();
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!dark[r][c] || inFinder(n, r, c)) continue;
        if (box && r >= box.start && r < box.end && c >= box.start && c < box.end) continue;
        const cx = x + (c + 0.5) * cell;
        const cy = y + (r + 0.5) * cell;
        ctx.moveTo(cx + cell / 2, cy);
        ctx.arc(cx, cy, cell / 2, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    // 모서리 큰 네모: 둥근 테두리 + 가운데 원
    for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      const fx = x + fc * cell;
      const fy = y + fr * cell;
      ctx.beginPath();
      roundRectPath(ctx, fx, fy, 7 * cell, 7 * cell, 2.6 * cell);
      roundRectPath(ctx, fx + cell, fy + cell, 5 * cell, 5 * cell, 1.7 * cell);
      ctx.fill("evenodd");
      ctx.beginPath();
      ctx.arc(fx + 3.5 * cell, fy + 3.5 * cell, 1.5 * cell, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (box && image) {
    const size = (box.end - box.start) * cell;
    const margin = cell * 0.5;
    const ix = x + box.start * cell + margin;
    const iy = y + box.start * cell + margin;
    const s = size - margin * 2;
    const ratio = image.naturalWidth / image.naturalHeight;
    const w = ratio >= 1 ? s : s * ratio;
    const h = ratio >= 1 ? s / ratio : s;
    ctx.drawImage(image, ix + (s - w) / 2, iy + (s - h) / 2, w, h);
  }
}
