import { useEffect, useRef, useState } from "react";
import "./Phototag.css";

const CATEGORIES = ["Beverages", "Footwear", "Clothing", "Food", "Other"];

// Most digits before the decimal point: 7 digits = up to ₱9,999,999
const MAX_WHOLE_DIGITS = 7;

// How much of the sheet stays on screen when it is dragged all the way down:
// the drag handle plus the "TAG THIS PHOTO" row.
const COLLAPSED_PEEK = 66;

// Budgey is "confident" at or above this (same 85% the backend uses)
const CONFIDENT = 0.85;

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

// Small pill on the photo: what Budgey thinks it is, and how sure it is
function ClassifyPill({ classification }) {
  if (!classification || classification.status === "error") return null;

  if (classification.status === "loading") {
    return (
      <div className="ai-pill" role="status" aria-live="polite">
        <i className="ai-pill__dot ai-pill__dot--loading" />
        <span>Analyzing photo…</span>
      </div>
    );
  }

  const { category, confidence } = classification;
  const pct = confidence == null ? null : Math.round(confidence * 100);
  const sure = confidence != null && confidence >= CONFIDENT;
  const label = category ?? "Not sure";
  const title =
    pct == null
      ? undefined
      : category
        ? `Budgey is ${pct}% confident this is ${category}`
        : `Budgey is only ${pct}% confident, so it left the category for you`;

  return (
    <div className="ai-pill" role="status" aria-live="polite" title={title}>
      <i className={`ai-pill__dot ${sure ? "is-sure" : "is-unsure"}`} />
      <strong>{label}</strong>
      {pct != null && <span>{pct}%</span>}
    </div>
  );
}

export default function PhotoTag({
  photo,
  initial,
  classification, // classifier result; may arrive after the screen opens:
  // null | { status: "loading" } | { status: "error" } |
  // { status: "done", category: "Shoes" | ... | null, confidence: 0..1 }
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
  const suggestion =
    classification?.status === "done" ? classification.category : null;
  const [autofilled, setAutofilled] = useState(false); // shows "Autofilled by Budgey"
  const [seenSuggestion, setSeenSuggestion] = useState(null);
  if (suggestion !== seenSuggestion) {
    setSeenSuggestion(suggestion);
    if (suggestion && !category && !otherMode) {
      setCategory(suggestion);
      setAutofilled(true);
    }
  }

  // Drag handle: pull the sheet down to see more of the photo
  const sheetRef = useRef(null);
  const dragRef = useRef(null);
  const [offset, setOffset] = useState(0); // px the sheet is pushed down
  const [dragging, setDragging] = useState(false);
  const collapsed = offset > 0;

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

  // Numbers and one decimal point only, max 7 digits and 2 decimal places
  const handleAmount = (e) => {
    const cleaned = e.target.value.replace(/[^0-9.]/g, "");
    const [rawWhole, ...rest] = cleaned.split(".");
    const whole = rawWhole.replace(/^0+(?=\d)/, "").slice(0, MAX_WHOLE_DIGITS);
    setAmount(rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole);
  };

  const maxOffset = () =>
    Math.max(0, (sheetRef.current?.offsetHeight ?? 0) - COLLAPSED_PEEK);

  const onDragStart = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startY: e.clientY,
      startOffset: offset,
      max: maxOffset(),
      offset,
      moved: false,
    };
    setDragging(true);
  };

  const onDragMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    d.offset = Math.min(d.max, Math.max(0, d.startOffset + dy));
    setOffset(d.offset);
  };

  const onDragEnd = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDragging(false);
    if (d.moved) {
      // snap to whichever end is closer
      setOffset(d.offset > d.max / 2 ? d.max : 0);
    } else {
      // a plain tap on the handle toggles it
      setOffset(d.startOffset > 0 ? 0 : d.max);
    }
  };

  // Keyboard: Enter / Space on the handle toggles it too (it is a button)
  const onHandleKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOffset((o) => (o > 0 ? 0 : maxOffset()));
    }
  };

  const chooseCategory = (c) => {
    setAutofilled(false); // the user picked this one themselves
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
        <ClassifyPill classification={classification} />
      </div>

      <section
        className={`sheet${dragging ? " is-dragging" : ""}`}
        ref={sheetRef}
        style={{ "--drag": `${offset}px` }}
        aria-label="Tag this photo"
      >
        <button
          type="button"
          className="sheet__handle"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          onKeyDown={onHandleKey}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Show the form" : "Hide the form to see the photo"}
        />

        <div className="sheet__top">
          <span className="sheet__pill">TAG THIS PHOTO</span>
          <button className="sheet__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* inert: while the sheet is pulled down, its fields can't be tabbed to */}
        <div className="sheet__body" inert={collapsed}>
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
            <span className="field__label field__label--split" id="category-label">
              CATEGORY
              {autofilled && (
                <em className="autofill">
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                    <path d="M4 0l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="currentColor" />
                  </svg>
                  Autofilled by Budgey
                </em>
              )}
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
        </div>
      </section>
    </main>
  );
}