# Budgey — Dev-Only Seed Data Importer

A development-only utility for bulk-importing historical, real-photo purchase entries into Budgey (`budgey:entries`) to test gallery views, category breakdowns, and spending forecasts without manual photo-by-photo entry.

> **Note:** This feature is strictly gated behind `import.meta.env.DEV` and will not appear or execute in production builds (`npm run build`).

---

## Folder & CSV Structure

Place your seed folder anywhere on your computer (it does not need to be committed to Git). Organize it with a `seed.csv` file at the root and `YYYY-MM` folders containing day-numbered photos:

```text
Seed Data/
├── seed.csv
├── 2026-07/
│   ├── 1.jpg
│   ├── 3.jpg
│   ├── 3-2.png         # Multiple purchases on the same day use "-2", "-3", etc.
│   └── 24.jpg
├── 2026-08/
│   └── ...
├── 2026-09/
│   └── ...
└── 2026-10/
    └── ...
```

### Naming Rules
* **Month folders:** Must follow `YYYY-MM` format (e.g., `2026-07` through `2026-10`).
* **Image filenames:** Must start with the day of the month (`1`–`31`). For multiple purchases on the same day, append a dash suffix (e.g., `3.jpg`, `3-2.jpg`, `3-3.jpg`). Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`.
* **No category subfolders:** Categories are defined inside `seed.csv`, keeping all photos for a given month directly inside `Seed Data/<YYYY-MM>/`.

---

## `seed.csv` Schema

Create `seed.csv` at the root of `Seed Data/` with the following header columns:

```csv
month,file,name,amount,category,reason
2026-07,1,Chicken Rice Meal,125,Food,Need
2026-07,3,Iced Coffee,110,Beverages,Want
2026-07,3-2,Siomai Snack,55,Food,Reward
2026-07,14,Canvas Shirt,450,Clothing,Want
2026-07,22,Running Shoes,1850,Footwear,Reward
```

### Column Reference
| Column | Required | Format / Accepted Values | Description |
| :--- | :---: | :--- | :--- |
| `month` | Yes | `YYYY-MM` | Must match the parent month folder name (e.g., `2026-07`). |
| `file` | Yes | Base filename (e.g., `3`, `3-2`) | File extensions are optional; the importer matches the base name automatically. |
| `name` | Yes | Non-empty string | Display name of the purchase. Wrap values containing commas in double quotes (`"Burger, Fries & Drink"`). |
| `amount` | Yes | Positive number (`> 0`) | Item price in pesos (omit `₱` and thousand-separator commas, or enter plain decimals like `125.50`). |
| `category` | Yes | `Food`, `Beverages`, `Clothing`, `Footwear`, or custom `Other` label | Normalized via `normalizeCategory()` in `src/categories.js`. |
| `reason` | Yes | `Need`, `Want`, or `Reward` | Case-insensitive purchase motivation tag. |

---

## How to Run & Import

1. **Install dependencies and start the Vite dev server:**
   ```bash
   npm install
   npm run dev
   ```
2. **Open Settings in the browser:**
   Navigate to the local dev URL (typically `http://localhost:5173`) and open the **Settings** screen.
3. **Import the folder:**
   * Click **Import Seed Folder (Dev)**.
   * Select your `Seed Data` root folder in the directory picker and confirm browser file access if prompted.
4. **Verify:**
   * A status message under the button confirms how many entries were imported (or lists any CSV/file validation errors before touching storage).
   * Return to **Gallery** to inspect the imported items, dates, categories, and forecasts.

### What Happens During Import
* **Strict pre-flight validation:** Verifies that `seed.csv` exists, all required columns are present, every image in `YYYY-MM/` has a matching CSV row (and vice versa), no duplicate/ambiguous base names exist, and all calendar dates, amounts, and reasons are valid.
* **Image compression:** Resizes photos to a maximum side of `700px` (`JPEG` quality `0.7`) so large batches (e.g., 70+ photos) fit comfortably within browser `localStorage` limits.
* **Clean state replacement:** Replaces `budgey:entries` with the chronologically sorted seed entries and updates `settings.startedAt` to the earliest imported entry date (`oldestEntryDate`).

---

## Architecture & Modified Files

* **`src/seedImporter.js` (New):** Self-contained module containing the RFC-4180 CSV parser, folder-to-CSV validator, timestamp generator, and image compressor (`importSeedFolder`).
* **`src/App.jsx`:** Imports `importSeedFolder`, defines `handleImportSeed` (gated by `import.meta.env.DEV`), and passes it as an optional `onImportSeed` prop to `<Settings />`.
* **`src/Settings.jsx`:** Renders a dev-only folder picker (`webkitdirectory`) and status readout when `import.meta.env.DEV` is `true`. Uses optional chaining (`onImportSeed?.(...)`) so removing it does not affect existing Settings functionality.

---

## How to Remove Later

When testing is complete and you want to strip the importer from the codebase:

1. Delete `src/seedImporter.js`.
2. In `src/Settings.jsx`, remove `folderInputRef`, `seedStatus`, `handleFolderChange`, `onImportSeed` from props, and the `{import.meta.env.DEV && (...)}` block.
3. In `src/App.jsx`, remove the `importSeedFolder` import, `handleImportSeed`, and the `onImportSeed` prop on `<Settings />`.