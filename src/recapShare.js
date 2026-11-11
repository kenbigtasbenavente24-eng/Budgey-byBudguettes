// src/recapShare.js
// Draws the "Save & Share Card" image (1080 x 1920) and shares or downloads it.
// Photos are left off the card on purpose: it only has totals.
import { peso } from "./recapData";

const W = 1080;
const H = 1920;
const ORANGE = "#ee9a2f";
const INK = "#140c07";
const FONT = '"Poppins", system-ui, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function text(ctx, str, x, y, { size, weight = 600, color = INK, align = "left", spacing = 0 }) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(str, x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

// Largest font size (up to `max`) at which `str` still fits in `width`
function fitSize(ctx, str, width, max, weight) {
  let size = max;
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (size > 40 && ctx.measureText(str).width > width) {
    size -= 4;
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

function trendText(recap) {
  if (recap.snapChange === null) return "First recap";
  if (recap.snapChange > 0) return `+${recap.snapChange}% logging`;
  if (recap.snapChange < 0) return `${recap.snapChange}% logging`;
  return "Same pace";
}

async function drawCard(recap) {
  // Make sure Poppins is ready before drawing, or the canvas uses a fallback
  try {
    await Promise.all([
      document.fonts.load(`700 80px Poppins`),
      document.fonts.load(`600 40px Poppins`),
      document.fonts.load(`400 40px Poppins`),
    ]);
  } catch {
    /* draw with the fallback font */
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, 0, W, H);

  const pad = 90;

  text(ctx, "BUDGEY RECAP", pad, 150, { size: 30, weight: 600, spacing: 6 });

  // Month chip
  roundRect(ctx, pad, 210, 250, 76, 38);
  ctx.fillStyle = INK;
  ctx.fill();
  text(ctx, recap.label, pad + 125, 260, { size: 32, weight: 600, color: "#fff", align: "center" });

  // Title
  text(ctx, "My monthly", pad, 440, { size: 110, weight: 600 });
  text(ctx, "spending story", pad, 560, { size: 110, weight: 600 });

  // Big faded logo
  text(ctx, "b", 330, 1090, { size: 560, weight: 700, color: "rgba(20,12,7,0.14)" });
  text(ctx, ".", 640, 1090, { size: 560, weight: 700, color: "rgba(20,12,7,0.14)" });

  // Total
  text(ctx, "I LOGGED A TOTAL OF", pad, 1200, { size: 30, weight: 600, spacing: 5 });
  const totalStr = peso(Math.round(recap.total));
  const totalSize = fitSize(ctx, totalStr, W - pad * 2, 190, 700);
  text(ctx, totalStr, pad - 6, 1370, { size: totalSize, weight: 700 });

  // Snaps pill
  roundRect(ctx, pad, 1430, W - pad * 2, 130, 65);
  ctx.fillStyle = INK;
  ctx.fill();
  text(ctx, `across ${recap.snaps} logged snaps`, W / 2, 1514, {
    size: 44,
    weight: 400,
    color: "#fff",
    align: "center",
  });

  // Two stat boxes
  const boxW = (W - pad * 2 - 30) / 2;
  [
    ["TOP CATEGORY", recap.topCategory],
    ["VS LAST MONTH", trendText(recap)],
  ].forEach(([label, value], i) => {
    const x = pad + i * (boxW + 30);
    roundRect(ctx, x, 1600, boxW, 170, 28);
    ctx.fillStyle = "rgba(20,12,7,0.12)";
    ctx.fill();
    text(ctx, label, x + 34, 1660, { size: 22, weight: 600, spacing: 4 });
    text(ctx, value, x + 34, 1725, { size: 40, weight: 600 });
  });

  text(ctx, "Tracked with Budgey", W / 2, 1850, {
    size: 28,
    weight: 400,
    align: "center",
    color: "rgba(20,12,7,0.7)",
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not make the card"))),
      "image/png"
    )
  );
}

// Returns "shared", "downloaded", or "cancelled"
export async function shareRecapCard(recap) {
  const blob = await drawCard(recap);
  const fileName = `budgey-${recap.year}-${String(recap.month).padStart(2, "0")}-recap.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "My Budgey Recap" });
      return "shared";
    } catch (err) {
      if (err.name === "AbortError") return "cancelled";
      // Any other share failure: fall through to a plain download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
