import { useState } from "react";
import "./Settings.css";
import { formatPesoFull } from "./money";
import { cleanAmountInput, validTarget } from "./settingsStore";

// Settings screen. For now it has one setting: the target weekly spending.
// It is optional: leaving it empty simply means no target.
export default function Settings({ targetWeekly, onSave, onBack }) {
  const [text, setText] = useState(targetWeekly ? String(targetWeekly) : "");
  const [status, setStatus] = useState("");

  const value = validTarget(text); // null when empty, "0" or "."
  const isEmpty = text.trim() === "";
  const changed = (value ?? null) !== (targetWeekly ?? null);
  const canSave = changed && (isEmpty || value !== null);

  const handleChange = (e) => {
    setText(cleanAmountInput(e.target.value));
    setStatus("");
  };

  const submit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    onSave?.(isEmpty ? null : value);
    setStatus(isEmpty ? "Target removed" : `Target saved: ${formatPesoFull(value)} a week`);
  };

  return (
    <main className="settings">
      <header className="settings__head">
        <button className="settings__back" onClick={onBack} aria-label="Back to gallery">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="settings__title">Settings</h1>
      </header>

      <section className="settings__body">
        <form className="settings__card" onSubmit={submit}>
          <label className="settings__label" htmlFor="target-weekly">
            TARGET WEEKLY SPENDING
          </label>
          <div className="settings__box">
            <span aria-hidden="true">₱</span>
            <input
              id="target-weekly"
              value={text}
              onChange={handleChange}
              inputMode="decimal"
              placeholder="Not set"
              aria-describedby="target-weekly-hint"
            />
            <small aria-hidden="true">a week</small>
          </div>
          <p className="settings__hint" id="target-weekly-hint">
            The average you want to spend each week. Budgey compares your spending
            forecast against it. You can change it anytime, for example when your
            budget grows. Leave it empty to turn it off.
          </p>

          <button className="settings__save" type="submit" disabled={!canSave}>
            Save target
          </button>
          <p className="settings__status" role="status" aria-live="polite">
            {status}
          </p>
        </form>
      </section>
    </main>
  );
}
