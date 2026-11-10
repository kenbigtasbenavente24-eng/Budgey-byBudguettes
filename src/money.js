// Money formatting for the app.
//
//   formatPeso      short form for tight spaces (photo badges, summary total)
//   formatPesoFull  exact amount, for places with room (details card, labels)
//
// formatPeso keeps amounts at about 5 digits or fewer:
//   948.33     -> ₱948.33
//   12345.67   -> ₱12,346
//   500000     -> ₱500K
//   1200000    -> ₱1.2M

// Most whole digits the amount box accepts (so up to 9,999,999.99)
export const MAX_WHOLE_DIGITS = 7;

const UNITS = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

const SHORT_FROM = 100000; // from here on, use K / M / B

const inPh = (n, maxDecimals) =>
  n.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });

export function formatPesoFull(value) {
  const n = Number(value);
  return "₱" + inPh(Number.isFinite(n) ? n : 0, 2);
}

export function formatPeso(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "₱0";

  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);

  if (Math.round(abs) >= SHORT_FROM) {
    let i = abs >= UNITS[0][0] ? 0 : abs >= UNITS[1][0] ? 1 : 2;
    let scaled = Math.round((abs / UNITS[i][0]) * 10) / 10;
    // 999,950 rounds to "1000K", which should read "1M"
    if (scaled >= 1000 && i > 0) {
      i -= 1;
      scaled = Math.round((abs / UNITS[i][0]) * 10) / 10;
    }
    return `${sign}₱${inPh(scaled, 1)}${UNITS[i][1]}`;
  }

  // Under 10,000 keep the cents; above that they just take up room
  return `${sign}₱${inPh(abs, abs >= 10000 ? 0 : 2)}`;
}