// Dev-only Seed Data folder + seed.csv importer.
import { normalizeCategory } from "./categories";

const VALID_REASONS = new Map([
  ["need", "Need"],
  ["want", "Want"],
  ["reward", "Reward"],
]);

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)$/i;
const MONTH_FOLDER_RE = /^(\d{4})-(\d{2})$/;

function stripExtension(filename) {
  return filename.replace(/\.[^.]+$/, "");
}

// Lightweight RFC-4180 style CSV parser supporting quoted values and commas
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else if (ch === "\n" || ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function daysInMonth(year, month1Based) {
  return new Date(year, month1Based, 0).getDate();
}

function parseDayFromBaseName(baseName) {
  const match = baseName.match(/^(\d{1,2})(?:-.+)?$/);
  return match ? Number(match[1]) : NaN;
}

function buildIsoTimestamp(year, month1Based, day, indexInBucket) {
  const maxDay = daysInMonth(year, month1Based);
  if (day < 1 || day > maxDay) {
    throw new Error(
      `Invalid day "${day}" for ${year}-${String(month1Based).padStart(2, "0")} (max ${maxDay}).`
    );
  }
  const hour = 9 + ((indexInBucket * 3) % 11);
  const minute = (indexInBucket * 17) % 60;
  return new Date(year, month1Based - 1, day, hour, minute, 0).toISOString();
}

function makeEntryId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read image file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function shrinkSeedPhoto(dataUrl, maxSide = 700, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function importSeedFolder(fileList) {
  if (!import.meta.env.DEV) {
    throw new Error("Seed importer is only available in development mode.");
  }

  const files = Array.from(fileList ?? []);
  if (files.length === 0) {
    throw new Error("No files selected.");
  }

  let csvFile = null;
  const imageByKey = new Map(); // `${month}/${baseName}` -> { file, fileName }
  const errors = [];

  for (const file of files) {
    const relPath = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
    const parts = relPath.split("/").filter(Boolean);

    if (parts.length === 2 && parts[1].toLowerCase() === "seed.csv") {
      csvFile = file;
      continue;
    }

    if (IMAGE_EXT_RE.test(parts[parts.length - 1])) {
      if (parts.length !== 3) {
        errors.push(`Unexpected image path "${relPath}". Expected <Seed Data>/<YYYY-MM>/<file>.`);
        continue;
      }
      const monthFolder = parts[1];
      const fileName = parts[2];
      if (!MONTH_FOLDER_RE.test(monthFolder)) {
        errors.push(`Invalid month folder "${monthFolder}" in "${relPath}". Use YYYY-MM.`);
        continue;
      }
      const baseName = stripExtension(fileName);
      const key = `${monthFolder}/${baseName}`;
      if (imageByKey.has(key)) {
        const prev = imageByKey.get(key);
        errors.push(
          `Ambiguous base name "${key}" in ${monthFolder}: found both "${prev.fileName}" and "${fileName}".`
        );
      } else {
        imageByKey.set(key, { file, fileName });
      }
    }
  }

  if (!csvFile) {
    throw new Error("Missing seed.csv at the root of the selected Seed Data folder.");
  }

  const csvText = (await csvFile.text()).replace(/^\uFEFF/, "");
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new Error("seed.csv has no data rows.");
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const requiredCols = ["month", "file", "name", "amount", "category", "reason"];
  const colIndex = Object.fromEntries(requiredCols.map((col) => [col, headers.indexOf(col)]));

  const missingCols = requiredCols.filter((col) => colIndex[col] === -1);
  if (missingCols.length > 0) {
    throw new Error(`seed.csv is missing required columns: ${missingCols.join(", ")}`);
  }

  const seenCsvKeys = new Set();
  const parsedItems = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const lineNum = r + 1;

    const month = (row[colIndex.month] ?? "").trim();
    const rawFile = (row[colIndex.file] ?? "").trim();
    const baseName = stripExtension(rawFile);
    const name = (row[colIndex.name] ?? "").trim();
    const rawAmount = (row[colIndex.amount] ?? "").trim().replace(/[₱,]/g, "");
    const rawCategory = (row[colIndex.category] ?? "").trim();
    const rawReason = (row[colIndex.reason] ?? "").trim().toLowerCase();

    const monthMatch = month.match(MONTH_FOLDER_RE);
    if (!monthMatch) {
      errors.push(`Row ${lineNum}: invalid month "${month}" (expected YYYY-MM).`);
      continue;
    }

    if (!baseName) {
      errors.push(`Row ${lineNum}: missing file name.`);
      continue;
    }

    const key = `${month}/${baseName}`;
    if (seenCsvKeys.has(key)) {
      errors.push(`Row ${lineNum}: duplicate CSV entry for "${key}".`);
      continue;
    }
    seenCsvKeys.add(key);

    if (!imageByKey.has(key)) {
      errors.push(`Row ${lineNum}: no image matching "${key}" was found in the selected folder.`);
      continue;
    }

    if (!name) {
      errors.push(`Row ${lineNum} (${key}): missing item name.`);
      continue;
    }

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`Row ${lineNum} (${key}): invalid amount "${row[colIndex.amount]}".`);
      continue;
    }

    const reason = VALID_REASONS.get(rawReason);
    if (!reason) {
      errors.push(
        `Row ${lineNum} (${key}): invalid reason "${row[colIndex.reason]}" (use Need, Want, or Reward).`
      );
      continue;
    }

    const day = parseDayFromBaseName(baseName);
    if (Number.isNaN(day)) {
      errors.push(
        `Row ${lineNum} (${key}): file name must start with the day of the month (e.g., 3 or 3-2).`
      );
      continue;
    }

    const year = Number(monthMatch[1]);
    const month1Based = Number(monthMatch[2]);

    try {
      const createdAt = buildIsoTimestamp(year, month1Based, day, parsedItems.length);
      parsedItems.push({
        key,
        file: imageByKey.get(key).file,
        name,
        amount,
        category: normalizeCategory(rawCategory),
        reason,
        createdAt,
      });
    } catch (err) {
      errors.push(`Row ${lineNum} (${key}): ${err.message}`);
    }
  }

  for (const [key, info] of imageByKey.entries()) {
    if (!seenCsvKeys.has(key)) {
      errors.push(`Image "${key}" ("${info.fileName}") exists in folder but has no matching row in seed.csv.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Seed validation failed:\n• ${errors.join("\n• ")}`);
  }

  parsedItems.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const entries = [];
  for (const item of parsedItems) {
    const rawDataUrl = await readFileAsDataUrl(item.file);
    const photo = await shrinkSeedPhoto(rawDataUrl);
    entries.push({
      id: makeEntryId(),
      photo,
      name: item.name,
      amount: item.amount,
      category: item.category,
      reason: item.reason,
      createdAt: item.createdAt,
    });
  }

  return entries;
}