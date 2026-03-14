/**
 * Generate Pause (停) PNG icons using the canvas npm package.
 * Run from the icons/ directory: node generate-icons.js
 */

const fs   = require("fs");
const path = require("path");

// Resolve canvas from parent node_modules
const canvasPath = path.join(__dirname, "..", "node_modules", "canvas");
const { createCanvas } = require(canvasPath);

const outDir = __dirname;
const sizes  = [16, 48, 128];

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext("2d");

  // ── Background with rounded corners ──
  const r = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = "#0e0e10";
  ctx.fill();

  // ── 停 character ──
  const fontSize = Math.round(size * 0.65);
  ctx.fillStyle  = "#c8a96e";
  ctx.font       = `bold ${fontSize}px serif`;
  ctx.textAlign  = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("停", size / 2, size * 0.78);

  const buf     = canvas.toBuffer("image/png");
  const outFile = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(outFile, buf);
  console.log(`Written: icon${size}.png  (${buf.length} bytes)`);
}

console.log("Done.");
