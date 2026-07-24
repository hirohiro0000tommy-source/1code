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

function drawCorgi(canvas) {
  const colors = {
    bg: rgba("#08090b"),
    dark: rgba("#111111"),
    brown: rgba("#8b5b2b"),
    orange: rgba("#c98235"),
    orangeLight: rgba("#d59142"),
    orangeMid: rgba("#b87732"),
    orangeDark: rgba("#a8662e"),
    cream: rgba("#f4ead3"),
    white: rgba("#ffffff")
  };

  fill(canvas, colors.bg);
  drawThread(canvas);

  const rects = [
    [64, 80, 112, 128, colors.brown],
    [336, 80, 112, 128, colors.brown],
    [80, 184, 112, 104, colors.orangeMid],
    [320, 184, 112, 104, colors.orangeMid],
    [96, 128, 320, 320, colors.orange],
    [160, 96, 192, 72, colors.orangeLight],
    [88, 232, 336, 128, colors.orangeLight],
    [168, 176, 176, 264, colors.cream],
    [128, 248, 72, 128, colors.cream],
    [312, 248, 72, 128, colors.cream],
    [200, 400, 112, 40, colors.cream],
    [152, 240, 48, 48, colors.dark],
    [312, 240, 48, 48, colors.dark],
    [176, 224, 16, 16, colors.white],
    [336, 224, 16, 16, colors.white],
    [232, 312, 48, 48, colors.dark],
    [216, 376, 80, 16, colors.dark],
    [200, 360, 24, 16, colors.dark],
    [288, 360, 24, 16, colors.dark],
    [0, 480, 512, 32, colors.bg]
  ];

  for (const [x, y, w, h, color] of rects) fillRect(canvas, x, y, w, h, color);
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
drawCorgi(base);

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
