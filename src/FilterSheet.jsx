import { useEffect, useRef } from "react";
import "./FilterSheet.css";
import {
  EMPTY_FILTER,
  categoryOptions,
  countActive,
  monthOptions,
  reasonOptions,
} from "./galleryFilter";

// One group of chips. Tapping the chosen chip again goes back to "All".
function ChipGroup({ id, title, options, value, onPick }) {
  if (options.length === 0) return null;
  return (
    <section className="fsheet__section" aria-labelledby={`fsheet-${id}`}>
      <h3 id={`fsheet-${id}`}>{title}</h3>
      <div className="fsheet__chips">
        <button
          type="button"
          className="fsheet__chip"
          aria-pressed={value === null}
          onClick={() => onPick(null)}
        >
          All
        </button>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="fsheet__chip"
            aria-pressed={value === o.value}
            onClick={() => onPick(value === o.value ? null : o.value)}
          >
            {o.dot && <i className={`dot dot--${o.dot}`} aria-hidden="true" />}
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}

// Bottom sheet for the Gallery. Changes apply straight away, so the summary
// behind the sheet updates while you pick.
export default function FilterSheet({ entries, filter, resultCount, onChange, onClose }) {
  const panelRef = useRef(null);
  const active = countActive(filter);

  // Move keyboard focus into the sheet when it opens
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const set = (key) => (value) => onChange({ ...filter, [key]: value });

  return (
    <div className="fsheet" onClick={onClose}>
      <div
        ref={panelRef}
        className="fsheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Filter purchases"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fsheet__head">
          <h2>Filter</h2>
          <div className="fsheet__head-actions">
            <button
              type="button"
              className="fsheet__clear"
              onClick={() => onChange(EMPTY_FILTER)}
              disabled={active === 0}
            >
              Clear
            </button>
            <button
              type="button"
              className="fsheet__close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </header>

        <div className="fsheet__body">
          <ChipGroup
            id="month"
            title="Month"
            options={monthOptions(entries)}
            value={filter.month}
            onPick={set("month")}
          />
          <ChipGroup
            id="category"
            title="Category"
            options={categoryOptions(entries)}
            value={filter.category}
            onPick={set("category")}
          />
          <ChipGroup
            id="reason"
            title="Reason"
            options={reasonOptions(entries)}
            value={filter.reason}
            onPick={set("reason")}
          />
        </div>

        <footer className="fsheet__foot">
          <button
            type="button"
            className="fsheet__done"
            onClick={onClose}
            disabled={resultCount === 0}
          >
            {resultCount === 0
              ? "No purchases match"
              : `Show ${resultCount} ${resultCount === 1 ? "purchase" : "purchases"}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
