// Budgey LONG fake-data seeder (for testing the forecast AND the recap).
// Paste into DevTools console (F12 > Console) on the Budgey page, run budgeySeedLong(), reload.
//
//   budgeySeedLong()     -> 4 months of weekly spending (default)
//   budgeySeedLong(8)    -> 8 months back
//   budgeySeedLong(12)   -> a full year
//   budgeySeedClear()    -> removes only the fake entries (ids start with "seed-")
//
// Data starts on the 1st-2nd of the month N months ago and runs up to today.
// Replaces any earlier "seed-" entries.
//
// Forecast note: the forecast is due on the 1st of the 4th month after the first entry.
//   months = 4 or more -> forecast is already overdue/ready
//   months = 3 or less -> forecast is NOT due yet (handy for testing the "not ready" state)
// The recap (last month) always has data as long as months >= 1.

(function () {
  const KEY = "budgey:entries";

  // Deterministic random numbers, so you get the same data every run
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const COLORS = { Food: "#e08a1e", Beverages: "#2f7d5b", Clothing: "#7b5ea7", Footwear: "#c0443c", Other: "#4a6fa5" };

  // Smaller canvas = smaller base64 string = less localStorage used (matters for long ranges)
  const PHOTO_SIZE = 200;

  function fakePhoto(label, color) {
    const c = document.createElement("canvas");
    c.width = PHOTO_SIZE; c.height = PHOTO_SIZE;
    const g = c.getContext("2d");
    g.fillStyle = color; g.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.font = "bold " + Math.round(PHOTO_SIZE / 10) + "px sans-serif"; g.textAlign = "center";
    g.fillText(label, PHOTO_SIZE / 2, PHOTO_SIZE / 2 + 6);
    return c.toDataURL("image/jpeg", 0.6);
  }

  // [name, category, reason, typical amount]
  const ITEMS = [
    ["Milk Tea", "Beverages", "Reward", 120],
    ["Milk Tea", "Beverages", "Reward", 120],
    ["Iced Coffee", "Beverages", "Want", 110],
    ["Chicken Rice", "Food", "Need", 180],
    ["Burger Meal", "Food", "Want", 245],
    ["Ramen", "Food", "Reward", 320],
    ["Groceries", "Food", "Need", 900],
    ["Plain Tee", "Clothing", "Need", 399],
    ["Hoodie", "Clothing", "Want", 899],
    ["Phone Case", "Other", "Want", 250],
    ["Notebook", "Other", "Need", 85],
  ];

  function generate(now, months) {
    const rand = rng(2026);
    // First day of the month `months` months ago; weeks start on its 2nd day (matches forecast.js,
    // which drops leftover days at the start)
    const startMonth = new Date(now.getFullYear(), now.getMonth() - months, 1);
    const firstDay = new Date(startMonth.getFullYear(), startMonth.getMonth(), 2);
    const entries = [];
    let n = 0;

    // Approximate number of weeks in the range. Used to stretch the spending trend
    // and to place the special weeks proportionally.
    const totalWeeks = Math.max(1, Math.ceil(months * 4.35));
    const emptyWeek = Math.floor(totalWeeks * 0.3);  // one quiet week with no spending
    const shoesWeek = Math.floor(totalWeeks * 0.4);  // one big one-off purchase

    for (let w = 0; ; w++) {
      const weekStart = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + 7 * w);
      if (weekStart > now) break; // stop once we reach today

      // One quiet week with no spending at all (shows that 0-weeks are handled)
      if (w === emptyWeek) continue;

      // Amounts scale from 0.8x at the start to 1.4x later, but the number of purchases
      // per week is random, so weekly totals bounce around
      const trend = 0.8 + 0.6 * Math.min(1, w / totalWeeks);
      const count = 2 + Math.floor(rand() * 3); // 2 to 4 purchases a week

      for (let i = 0; i < count; i++) {
        const [name, category, reason, base] = ITEMS[Math.floor(rand() * ITEMS.length)];
        const day = Math.floor(rand() * 7);
        const when = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + day, 12, 0, 0);
        if (when > now) continue;
        const amount = Math.round(base * trend * (0.9 + rand() * 0.2));
        entries.push({ name, category, reason, amount, createdAt: when.toISOString() });
      }

      // One big one-off purchase (the backend should cap it so it isn't treated as a habit)
      if (w === shoesWeek) {
        const when = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 2, 12, 0, 0);
        entries.push({ name: "Running Shoes", category: "Footwear", reason: "Want", amount: 4500, createdAt: when.toISOString() });
      }
    }

    entries.forEach((e) => { e.id = `seed-long-${n++}`; });
    return entries;
  }

  window.budgeySeedLong = function (months = 4) {
    if (!Number.isInteger(months) || months < 1) {
      console.log("Pass a whole number of months, like budgeySeedLong(6).");
      return;
    }
    const now = new Date();
    const fake = generate(now, months).map((e) => ({ ...e, photo: fakePhoto(e.name, COLORS[e.category] || "#555") }));
    if (!fake.length) {
      console.log("No entries were generated.");
      return;
    }
    const real = JSON.parse(localStorage.getItem(KEY) || "[]").filter((e) => !String(e.id).startsWith("seed-"));
    try {
      localStorage.setItem(KEY, JSON.stringify([...fake, ...real].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))));
    } catch (err) {
      console.log("localStorage is full. Try fewer months, or lower PHOTO_SIZE at the top of the script.", err);
      return;
    }
    const first = fake.reduce((a, e) => (e.createdAt < a ? e.createdAt : a), fake[0].createdAt);
    console.log(`Seeded ${fake.length} fake entries over ${months} months, first one on ${first.slice(0, 10)}. Reload the page.`);
  };

  window.budgeySeedClear = function () {
    const kept = JSON.parse(localStorage.getItem(KEY) || "[]").filter((e) => !String(e.id).startsWith("seed-"));
    localStorage.setItem(KEY, JSON.stringify(kept));
    console.log("Removed fake entries. Reload the page.");
  };

  window.__budgeyGenerateLong = generate; // for testing in Node: generate(new Date(), 6)
  console.log("Ready. Run budgeySeedLong() or budgeySeedLong(8), then reload.");
})();

//Pag maga tanggal ka ng previous forecast to make a new one if that makes sense
//localStorage.removeItem("budgey:forecasts");
