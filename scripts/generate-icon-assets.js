const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const baseSize = 512;

function rgba(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255
  ];
}

function makeCanvas(size) {
  return {
    size,
    pixels: Buffer.alloc(size * size * 4)
  };
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const index = (y * canvas.size + x) * 4;
  canvas.pixels[index] = color[0];
  canvas.pixels[index + 1] = color[1];
  canvas.pixels[index + 2] = color[2];
  canvas.pixels[index + 3] = color[3];
}

function fillRect(canvas, x, y, width, height, color) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      setPixel(canvas, xx, yy, color);
    }
  }
}

function fillTriangle(canvas, p1, p2, p3, color) {
  const minX = Math.floor(Math.min(p1.x, p2.x, p3.x));
  const maxX = Math.ceil(Math.max(p1.x, p2.x, p3.x));
  const minY = Math.floor(Math.min(p1.y, p2.y, p3.y));
  const maxY = Math.ceil(Math.max(p1.y, p2.y, p3.y));
  const area = (p2.y - p3.y) * (p1.x - p3.x) + (p3.x - p2.x) * (p1.y - p3.y);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const a = ((p2.y - p3.y) * (x - p3.x) + (p3.x - p2.x) * (y - p3.y)) / area;
      const b = ((p3.y - p1.y) * (x - p3.x) + (p1.x - p3.x) * (y - p3.y)) / area;
      const c = 1 - a - b;
      if (a >= 0 && b >= 0 && c >= 0) setPixel(canvas, x, y, color);
    }
  }
}

function fill(canvas, color) {
  fillRect(canvas, 0, 0, canvas.size, canvas.size, color);
}

function drawCircle(canvas, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(canvas, x, y, color);
    }
  }
}

function drawEllipse(canvas, cx, cy, rx, ry, color) {
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1) setPixel(canvas, x, y, color);
    }
  }
}

function pointOnCubic(t, p0, p1, p2, p3) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y
  };
}

function drawThread(canvas) {
  const red = rgba("#c93542");
  const points = [
    [{ x: 40, y: 206 }, { x: 124, y: 132 }, { x: 194, y: 256 }, { x: 278, y: 188 }],
    [{ x: 278, y: 188 }, { x: 340, y: 132 }, { x: 386, y: 116 }, { x: 472, y: 202 }]
  ];
  for (const curve of points) {
    for (let i = 0; i <= 140; i += 1) {
      const point = pointOnCubic(i / 140, ...curve);
      drawCircle(canvas, Math.round(point.x), Math.round(point.y), 12, red);
    }
  }
}

function drawCurve(canvas, curve, radius, color, steps = 120) {
  for (let i = 0; i <= steps; i += 1) {
    const point = pointOnCubic(i / steps, ...curve);
    drawCircle(canvas, Math.round(point.x), Math.round(point.y), radius, color);
  }
}

function drawThickLine(canvas, from, to, radius, color) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    drawCircle(canvas, Math.round(from.x + dx * t), Math.round(from.y + dy * t), radius, color);
  }
}

function drawStringPhone(canvas) {
  const colors = {
    bg: rgba("#ffffff"),
    red: rgba("#d71928"),
    cup: rgba("#fbfaf6"),
    cupTop: rgba("#ffffff"),
    band: rgba("#f3f2ee"),
    rim: rgba("#d6d4ce"),
    base: rgba("#dedcd6"),
    line: rgba("#ddd9d2")
  };

  fill(canvas, colors.bg);

  drawCurve(canvas, [
    { x: 102, y: 306 },
    { x: 104, y: 362 },
    { x: 152, y: 418 },
    { x: 246, y: 426 }
  ], 11, colors.red, 90);
  drawCurve(canvas, [
    { x: 246, y: 426 },
    { x: 324, y: 434 },
    { x: 404, y: 402 },
    { x: 480, y: 438 }
  ], 11, colors.red, 90);

  fillTriangle(canvas, { x: 92, y: 112 }, { x: 434, y: 76 }, { x: 80, y: 326 }, colors.cup);
  fillTriangle(canvas, { x: 434, y: 76 }, { x: 414, y: 362 }, { x: 80, y: 326 }, colors.cup);
  fillTriangle(canvas, { x: 92, y: 112 }, { x: 434, y: 76 }, { x: 88, y: 186 }, colors.cupTop);
  fillTriangle(canvas, { x: 434, y: 76 }, { x: 430, y: 150 }, { x: 88, y: 186 }, colors.cupTop);
  fillTriangle(canvas, { x: 86, y: 196 }, { x: 424, y: 162 }, { x: 84, y: 268 }, colors.band);
  fillTriangle(canvas, { x: 424, y: 162 }, { x: 420, y: 234 }, { x: 84, y: 268 }, colors.band);
  drawThickLine(canvas, { x: 92, y: 112 }, { x: 434, y: 76 }, 9, colors.rim);
  drawThickLine(canvas, { x: 80, y: 326 }, { x: 414, y: 362 }, 9, colors.base);
  drawCurve(canvas, [{ x: 154, y: 106 }, { x: 132, y: 168 }, { x: 126, y: 256 }, { x: 148, y: 334 }], 6, colors.line, 90);
  drawCurve(canvas, [{ x: 260, y: 94 }, { x: 238, y: 166 }, { x: 232, y: 266 }, { x: 252, y: 344 }], 6, colors.line, 90);
  drawCurve(canvas, [{ x: 366, y: 84 }, { x: 344, y: 162 }, { x: 338, y: 274 }, { x: 358, y: 354 }], 6, colors.line, 90);
}

function resizeNearest(source, targetSize) {
  const target = makeCanvas(targetSize);
  for (let y = 0; y < targetSize; y += 1) {
    for (let x = 0; x < targetSize; x += 1) {
      const sx = Math.min(source.size - 1, Math.floor(x * source.size / targetSize));
      const sy = Math.min(source.size - 1, Math.floor(y * source.size / targetSize));
      const sourceIndex = (sy * source.size + sx) * 4;
      const targetIndex = (y * targetSize + x) * 4;
      source.pixels.copy(target.pixels, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
  return target;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function png(canvas) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.size, 0);
  header.writeUInt32BE(canvas.size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = canvas.size * 4;
  const raw = Buffer.alloc((stride + 1) * canvas.size);
  for (let y = 0; y < canvas.size; y += 1) {
    raw[y * (stride + 1)] = 0;
    canvas.pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const base = makeCanvas(baseSize);
drawStringPhone(base);

const outputs = [
  ["icon-512.png", 512],
  ["icon-192.png", 192],
  ["apple-touch-icon.png", 180],
  ["favicon-32.png", 32]
];

for (const [file, size] of outputs) {
  const canvas = size === baseSize ? base : resizeNearest(base, size);
  fs.writeFileSync(path.join(publicDir, file), png(canvas));
  console.log(`wrote public/${file}`);
}
