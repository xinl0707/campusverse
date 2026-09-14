/* ==========================================================
   地图素材预处理（离线，一次性）
   1. 洪水填充抠掉绿色背景（只从四边连通，保留建筑内部绿植）
   2. 抹掉右下角「豆包AI生成」水印
   3. 裁剪到内容包围盒
   4. 缩放到合适尺寸
   5. 输出透明 PNG + 尺寸清单
   ========================================================== */

const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const SRC_DIR = path.join(__dirname, '地图');
const OUT_DIR = path.join(__dirname, 'tools', 'emotion', 'assets', 'buildings');

const FILES = [
  { key: 'gate',       file: '大门.jpg',   maxW: 620 },
  { key: 'teaching',   file: '教学楼.jpg', maxW: 720 },
  { key: 'library',    file: '图书馆.jpg', maxW: 640 },
  { key: 'dorm',       file: '宿舍.jpg',   maxW: 560 },
  { key: 'canteen',    file: '食堂.jpg',   maxW: 600 },
  { key: 'playground', file: '操场.jpg',   maxW: 900 }
];

fs.mkdirSync(OUT_DIR, { recursive: true });

/* ---------- 工具 ---------- */

function dist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * 采样边缘像素，估计背景色
 */
function sampleBackground(data, W, H) {
  const pts = [];
  const step = 8;
  for (let x = 0; x < W; x += step) {
    pts.push([x, 2], [x, H - 3]);
  }
  for (let y = 0; y < H; y += step) {
    pts.push([2, y], [W - 3, y]);
  }

  let r = 0, g = 0, b = 0;
  pts.forEach(([x, y]) => {
    const i = (y * W + x) * 4;
    r += data[i]; g += data[i + 1]; b += data[i + 2];
  });
  const n = pts.length;
  return { r: r / n, g: g / n, b: b / n };
}

/**
 * 从四边洪水填充，把连通的背景变透明
 */
function knockOutBackground(data, W, H, bg, threshold) {
  const visited = new Uint8Array(W * H);
  const stack = [];

  for (let x = 0; x < W; x++) {
    stack.push(x, 0);
    stack.push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    stack.push(0, y);
    stack.push(W - 1, y);
  }

  let removed = 0;

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;

    const idx = y * W + x;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const i = idx * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];

    // 与背景色差异过大 → 是主体，停止扩散
    if (dist(r, g, b, bg.r, bg.g, bg.b) > threshold) continue;

    data[i + 3] = 0;
    removed++;

    stack.push(x + 1, y);
    stack.push(x - 1, y);
    stack.push(x, y + 1);
    stack.push(x, y - 1);
  }

  return removed;
}

/**
 * 边缘去绿边（despill）：压低半透明边缘的绿色分量
 */
function despill(data, W, H) {
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const i = idx * 4;
      if (data[i + 3] === 0) continue;

      // 只要四邻有透明像素，就算边缘
      const n = [
        ((y - 1) * W + x) * 4,
        ((y + 1) * W + x) * 4,
        (y * W + x - 1) * 4,
        (y * W + x + 1) * 4
      ];
      let edge = false;
      for (const j of n) {
        if (data[j + 3] === 0) { edge = true; break; }
      }
      if (!edge) continue;

      const r = data[i], g = data[i + 1], b = data[i + 2];
      const rb = (r + b) / 2;
      if (g > rb + 12) {
        data[i + 1] = Math.round(rb + 8);
      }
    }
  }
}

/**
 * 抹掉右下角水印
 */
function clearWatermark(data, W, H) {
  const x0 = Math.floor(W * 0.74);
  const y0 = Math.floor(H * 0.90);
  let n = 0;
  for (let y = y0; y < H; y++) {
    for (let x = x0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] !== 0) { data[i + 3] = 0; n++; }
    }
  }
  return n;
}

/**
 * 内容包围盒
 */
function contentBox(data, W, H, pad) {
  let minX = W, minY = H, maxX = -1, maxY = -1;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;

  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad);
  maxY = Math.min(H - 1, maxY + pad);

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * 裁剪
 */
function crop(data, W, box) {
  const out = new Uint8Array(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const srcStart = ((box.y + y) * W + box.x) * 4;
    out.set(data.subarray(srcStart, srcStart + box.w * 4), y * box.w * 4);
  }
  return out;
}

/**
 * 盒式降采样
 */
function downscale(data, W, H, maxW) {
  if (W <= maxW) return { data, width: W, height: H };

  const scale = maxW / W;
  const nw = maxW;
  const nh = Math.max(1, Math.round(H * scale));
  const out = new Uint8Array(nw * nh * 4);

  for (let y = 0; y < nh; y++) {
    const sy0 = Math.floor(y / scale);
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) / scale));
    for (let x = 0; x < nw; x++) {
      const sx0 = Math.floor(x / scale);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) / scale));

      let r = 0, g = 0, b = 0, a = 0, c = 0;
      for (let sy = sy0; sy < sy1 && sy < H; sy++) {
        for (let sx = sx0; sx < sx1 && sx < W; sx++) {
          const i = (sy * W + sx) * 4;
          const al = data[i + 3];
          r += data[i] * al;
          g += data[i + 1] * al;
          b += data[i + 2] * al;
          a += al;
          c++;
        }
      }

      const o = (y * nw + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / c);
      }
    }
  }

  return { data: out, width: nw, height: nh };
}

/* ---------- 主流程 ---------- */

const manifest = [];

FILES.forEach(item => {
  const src = path.join(SRC_DIR, item.file);
  if (!fs.existsSync(src)) {
    console.log(`跳过（不存在）: ${item.file}`);
    return;
  }

  const raw = jpeg.decode(fs.readFileSync(src), { useTArray: true });
  const W = raw.width;
  const H = raw.height;
  const data = raw.data;

  const bg = sampleBackground(data, W, H);
  const removed = knockOutBackground(data, W, H, bg, 78);
  despill(data, W, H);
  const wm = clearWatermark(data, W, H);

  const box = contentBox(data, W, H, 6);
  if (!box) {
    console.log(`失败（无内容）: ${item.file}`);
    return;
  }

  const cropped = crop(data, W, box);
  const scaled = downscale(cropped, box.w, box.h, item.maxW);

  const png = new PNG({ width: scaled.width, height: scaled.height });
  png.data = Buffer.from(scaled.data);
  const buf = PNG.sync.write(png);

  const outName = item.key + '.png';
  fs.writeFileSync(path.join(OUT_DIR, outName), buf);

  manifest.push({
    key: item.key,
    name: outName,
    width: scaled.width,
    height: scaled.height,
    ratio: +(scaled.width / scaled.height).toFixed(4)
  });

  const pct = ((removed / (W * H)) * 100).toFixed(1);
  console.log(
    `${item.file.padEnd(12)} ${W}x${H} → ${scaled.width}x${scaled.height}` +
    `  抠掉背景 ${pct}%  清掉水印 ${wm}px  ${(buf.length / 1024).toFixed(0)}KB`
  );
});

fs.writeFileSync(
  path.join(OUT_DIR, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);

console.log('\n=== 尺寸清单 ===');
manifest.forEach(m => {
  console.log(`${m.key.padEnd(12)} ${m.width}x${m.height}  宽高比 ${m.ratio}`);
});
