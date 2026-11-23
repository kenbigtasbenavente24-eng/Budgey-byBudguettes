import { useEffect, useRef, useState } from "react";
import "./FilterSheet.css";
import {
  EMPTY_FILTER,
  categoryOptions,
  countActive,
  monthOptions,
  reasonOptions,
  showYearFilter,
  yearOptions,
} from "./galleryFilter";

// One dropdown row: shows the chosen value, opens a list of options inline.
// Options are { value, label, dot?, disabled? }. "All" (null) is always first.
function Dropdown({ id, title, options, value, open, onToggle, onPick }) {
  const chosen = options.find((o) => o.value === value);
  const label = chosen ? chosen.label : "All";
  const menuId = `fsheet-menu-${id}`;

  const pick = (next) => {
    onPick(next);
    onToggle(); // close this dropdown
  };

  return (
    <div className="fsheet__dd" data-open={open} data-active={value !== null}>
      <button
        type="button"
        className="fsheet__trigger"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={onToggle}
      >
        <span className="fsheet__trigger-title">{title}</span>
        <span className="fsheet__trigger-value">
          {chosen?.dot && <i className={`dot dot--${chosen.dot}`} aria-hidden="true" />}
          {label}
        </span>
        <i className="fsheet__chevron" aria-hidden="true" />
      </button>

      {open && (
        <div id={menuId} className="fsheet__menu" role="group" aria-label={title}>
          <button
            type="button"
            className="fsheet__opt"
            aria-pressed={value === null}
            onClick={() => pick(null)}
          >
            All
          </button>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="fsheet__opt"
              aria-pressed={value === o.value}
              disabled={o.disabled}
              onClick={() => pick(o.value)}
            >
              {o.dot && <i className={`dot dot--${o.dot}`} aria-hidden="true" />}
              {o.label}
              {o.disabled && <small>No purchases</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Bottom sheet for the Gallery. Changes apply straight away, so the summary
// behind the sheet updates while you pick.
export default function FilterSheet({ entries, filter, resultCount, onChange, onClose }) {
  const panelRef = useRef(null);
  const [open, setOpen] = useState(null); // which dropdown is open: "year" | "month" | ...
  const active = countActive(filter);

  // Move keyboard focus into the sheet when it opens
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Keep a freshly opened list in view inside the scrolling sheet
  useEffect(() => {
    if (open) document.getElementById(`fsheet-menu-${open}`)?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const toggle = (id) => () => setOpen((cur) => (cur === id ? null : id));
  const set = (key) => (value) => onChange({ ...filter, [key]: value });

  // Escape closes an open dropdown first; the Gallery only sees it if none is open
  const onKeyDown = (e) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(null);
    }
  };

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
        onKeyDown={onKeyDown}
      >
        <header className="fsheet__head">
          <h2>Filter</h2>
          <div className="fsheet__head-actions">
            <button
              type="button"
              className="fsheet__clear"
              onClick={() => {
                onChange(EMPTY_FILTER);
                setOpen(null);
              }}
              disabled={active === 0}
            >
              Clear
            </button>
            <button type="button" className="fsheet__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </header>

        <div className="fsheet__body">
          {showYearFilter(entries) && (
            <Dropdown
              id="year"
              title="Year"
              options={yearOptions(entries, filter)}
              value={filter.year}
              open={open === "year"}
              onToggle={toggle("year")}
              onPick={set("year")}
            />
          )}
          <Dropdown
            id="month"
            title="Month"
            options={monthOptions(entries, filter)}
            value={filter.month}
            open={open === "month"}
            onToggle={toggle("month")}
            onPick={set("month")}
          />
          <Dropdown
            id="category"
            title="Category"
            options={categoryOptions(entries, filter)}
            value={filter.category}
            open={open === "category"}
            onToggle={toggle("category")}
            onPick={set("category")}
          />
          <Dropdown
            id="reason"
            title="Reason"
            options={reasonOptions(entries, filter)}
            value={filter.reason}
            open={open === "reason"}
            onToggle={toggle("reason")}
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
