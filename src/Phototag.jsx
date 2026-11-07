import { useEffect, useRef, useState } from "react";
import "./Phototag.css";

const CATEGORIES = ["Food & Drinks", "Personal Care", "Apparel", "Travel", "Other"];

const REASONS = [
  { label: "Want", key: "want" },
  { label: "Reward", key: "reward" },
  { label: "Need", key: "need" },
];

function Chevron({ up }) {
  return (
    <svg
      width="12"
      height="8"
      viewBox="0 0 12 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: up ? "rotate(180deg)" : "none" }}
    >
      <path d="M1 1.5l5 5 5-5" />
    </svg>
  );
}

export default function PhotoTag({
  photo,
  initial,
  suggestion, // category suggested by the classifier; may arrive after the screen opens
  submitLabel = "Add to Gallery",
  onClose,
  onSave,
}) {
  const startsOther =
    !!initial && !CATEGORIES.slice(0, -1).includes(initial.category);

  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [otherMode, setOtherMode] = useState(startsOther);

  // Fill in the suggested category when it arrives, but never overwrite
  // something the user already picked or typed.
  const [seenSuggestion, setSeenSuggestion] = useState(null);
  if (suggestion !== seenSuggestion) {
    setSeenSuggestion(suggestion);
    if (suggestion && !category && !otherMode) setCategory(suggestion);
  }

  const [open, setOpen] = useState(false);
  const [reasonIndex, setReasonIndex] = useState(
    Math.max(0, REASONS.findIndex((r) => r.label === initial?.reason))
  );

  const categoryRef = useRef(null);
  const reason = REASONS[reasonIndex];
  const canSave = name.trim() && Number(amount) > 0 && category.trim();

  // Close the dropdown when clicking outside it or pressing Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!categoryRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Numbers and one decimal point only, max 2 decimal places
  const handleAmount = (e) => {
    const cleaned = e.target.value.replace(/[^0-9.]/g, "");
    const [whole, ...rest] = cleaned.split(".");
    setAmount(rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole);
  };

  const chooseCategory = (c) => {
    if (c === "Other") {
      setOtherMode(true);
      setCategory("");
    } else {
      setOtherMode(false);
      setCategory(c);
    }
    setOpen(false);
  };

  const cycleReason = () => setReasonIndex((i) => (i + 1) % REASONS.length);

  const save = () => {
    if (!canSave) return;
    onSave?.({
      photo,
      name: name.trim(),
      amount: Number(amount),
      category: category.trim(),
      reason: reason.label,
    });
  };

  return (
    <main className="tag">
      <div className="tag__photo">
        <img src={photo} alt="The photo you just took" />
      </div>

      <section className="sheet" aria-label="Tag this photo">
        <div className="sheet__top">
          <span className="sheet__pill">TAG THIS PHOTO</span>
          <button className="sheet__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <h2 className="sheet__title">What did you get?</h2>

        {/* Item name */}
        <label className="field">
          <span className="field__label">ITEM NAME</span>
          <input
            className="box"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Capybara Squishy"
          />
        </label>

        <div className="row">
          {/* Amount */}
          <label className="field">
            <span className="field__label">AMOUNT</span>
            <div className="box box--money">
              <span>₱</span>
              <input
                value={amount}
                onChange={handleAmount}
                inputMode="decimal"
                placeholder="0"
                aria-label="Amount in pesos"
              />
            </div>
          </label>

          {/* Category dropdown */}
          <div className="field field--category" ref={categoryRef}>
            <span className="field__label" id="category-label">
              CATEGORY
            </span>

            {otherMode ? (
              <div className="box box--other">
                <span className="box__other-label">Other:</span>
                <input
                  autoFocus
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  maxLength={24}
                  aria-label="Type your own category"
                />
                <button
                  type="button"
                  className="box__chev"
                  onClick={() => setOpen((o) => !o)}
                  aria-expanded={open}
                  aria-label="Choose a category from the list"
                >
                  <Chevron up={open} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="box box--select"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-labelledby="category-label"
              >
                <span className={category ? "" : "is-placeholder"}>
                  {category || "Choose"}
                </span>
                <span className="box__chev">
                  <Chevron up={open} />
                </span>
              </button>
            )}

            {open && (
              <ul className="menu">
                {CATEGORIES.map((c) => (
                  <li key={c} className={c === category ? "is-selected" : ""}>
                    <button type="button" onClick={() => chooseCategory(c)}>
                      {c}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Reason */}
        <div className="field">
          <span className="field__label">REASON</span>
          <div className="reason">
            <div className="reason__text">
              <strong>What's your reason for purchase?</strong>
              <small>Build mindful spending habits</small>
            </div>
            <button
              type="button"
              className={`reason__btn reason__btn--${reason.key}`}
              onClick={cycleReason}
              aria-label={`Reason: ${reason.label}. Tap to change`}
            >
              {reason.label}
              <span className="reason__dots" aria-hidden="true">
                {REASONS.map((r, i) => (
                  <i key={r.key} className={i === reasonIndex ? "on" : ""} />
                ))}
              </span>
            </button>
          </div>
        </div>

        <button className="sheet__save" onClick={save} disabled={!canSave}>
          {submitLabel}
        </button>
      </section>
    </main>
  );
}