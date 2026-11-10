import { useEffect, useMemo, useState } from "react";
import BottomNav from "./Bottomnav";
import "./Gallery.css";
import icons from "./icons";
import { formatPeso, formatPesoFull } from "./money";
import Recap from "./Recap";
import { buildRecap } from "./recapData";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const REASON_ORDER = ["Need", "Reward", "Want"];

const formatDate = (iso) => {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
};

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

export default function Gallery({ entries, onNavigate, onDelete, onEdit }) {
  const [selected, setSelected] = useState(null);
  const [viewing, setViewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const recap = useMemo(() => buildRecap(entries, new Date()), [entries]);

  // Group photos by month, newest first
  const groups = useMemo(() => {
    const map = new Map();
    [...entries]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .forEach((e) => {
        const d = new Date(e.createdAt);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            month: MONTHS[d.getMonth()],
            year: d.getFullYear(),
            items: [],
          });
        }
        map.get(key).items.push(e);
      });
    return [...map.values()];
  }, [entries]);

  // Spending summary: total, split by reason, and top category
  const stats = useMemo(() => {
    const byReason = { Need: 0, Reward: 0, Want: 0 };
    const byCategory = {};
    let total = 0;

    entries.forEach((e) => {
      total += e.amount;
      if (e.reason in byReason) byReason[e.reason] += e.amount;
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });

    const top =
      Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "---";

    return { total, byReason, top };
  }, [entries]);

  // Escape closes the newest layer first
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (confirming) setConfirming(false);
      else if (viewing) setViewing(false);
      else setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [viewing, confirming]);

  const confirmDelete = () => {
    onDelete?.(selected.id);
    setConfirming(false);
    setViewing(false);
    setSelected(null);
  };

  const selDate = selected ? new Date(selected.createdAt) : null;

  return (
    <main className="gallery">
      <header className="gallery__head">
        <h1 className="gallery__title">Spending Summary</h1>

        <p className="gallery__label">Total Spending</p>
        <div className="gallery__total">
          <strong title={formatPesoFull(stats.total)}>{formatPeso(stats.total)}</strong>
          <div className="gallery__top">
            <b>{stats.top}</b>
            <span>Top Category</span>
          </div>
        </div>

        <div
          className="bar"
          role="img"
          aria-label="Spending split by reason: need, reward, want"
        >
          {stats.total > 0 &&
            REASON_ORDER.filter((r) => stats.byReason[r] > 0).map((r) => (
              <span
                key={r}
                className={`bar__seg bar__seg--${r.toLowerCase()}`}
                style={{ flexGrow: stats.byReason[r] }}
              />
            ))}
        </div>

        <ul className="legend">
          {REASON_ORDER.map((r) => (
            <li key={r}>
              <i className={`dot dot--${r.toLowerCase()}`} />
              {r}
            </li>
          ))}
        </ul>
      </header>

            <section className="gallery__body">
        {entries.length === 0 ? (
          <div className="empty">
            <img src={icons.emptyGallery} width="150" height="130" alt="" />
            <p>The photos you took in this app will show up here</p>
          </div>
        ) : (
          <>
            {recap && (
              <button className="recap-banner" onClick={() => setRecapOpen(true)}>
                <span className="recap-banner__logo" aria-hidden="true">b.</span>
                <span className="recap-banner__text">
                  <b>Your {recap.label.replace(" · ", " ")} recap</b>
                  <small>See your spending story</small>
                </span>
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 12h16M14 6l6 6-6 6" />
                </svg>
              </button>
            )}

            {groups.map((g) => (
              <div key={g.key} className="month">
                <h2 className="month__head">
                  {g.month}, {g.year}
                </h2>
                <div className="grid">
                  {g.items.map((e) => (
                    <button
                      key={e.id}
                      className="thumb"
                      onClick={() => setSelected(e)}
                      aria-label={`${e.name}, ${formatPesoFull(e.amount)}`}
                    >
                      <img src={e.photo} alt="" />
                      <span className="thumb__price">{formatPeso(e.amount)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </section>

      <BottomNav active="gallery" onNavigate={onNavigate} />
      {recapOpen && recap && (
      <Recap recap={recap} onClose={() => setRecapOpen(false)} />
)}

      {/* Details card */}
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            aria-label={selected.name}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card__photo">
              <img src={selected.photo} alt={selected.name} />
              <button
                className="card__close"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="card__body">
              <div className="card__row">
                <h3>{selected.name}</h3>
                <strong>{formatPesoFull(selected.amount)}</strong>
              </div>
              <div className="card__row card__row--meta">
                <span>{formatDate(selected.createdAt)}</span>
                <span className="pill">{selected.reason}</span>
              </div>
              <button className="card__view" onClick={() => setViewing(true)}>
                View this photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full photo screen */}
      {selected && viewing && (
        <div className="viewer" role="dialog" aria-modal="true" aria-label="Photo">
          <header className="viewer__head">
            <button
              className="viewer__back"
              onClick={() => setViewing(false)}
              aria-label="Back"
            >
              <svg width="34" height="24" viewBox="0 0 34 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <path d="M32 12H3" />
                <path d="M12 3 3 12l9 9" />
              </svg>
            </button>
            <div>
              <strong>
                {MONTHS[selDate.getMonth()]}, {selDate.getFullYear()}
              </strong>
              <span>{formatTime(selected.createdAt)}</span>
            </div>
          </header>

          <div className="viewer__photo">
            <img src={selected.photo} alt={selected.name} />
          </div>

          <footer className="viewer__bar">
            <button onClick={() => setConfirming(true)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M9 2h6l1 2h4a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2h4l1-2z" />
                <path d="M5 8h14l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8zm4 3v8h2v-8H9zm4 0v8h2v-8h-2z" fillRule="evenodd" />
              </svg>
              Delete
            </button>
            <button onClick={() => onEdit?.(selected)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
                <path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 8 16l1.2-4 9.2-9.4z" />
              </svg>
              Edit Details
            </button>
          </footer>

          {confirming && (
            <div className="confirm" onClick={() => setConfirming(false)}>
              <div
                className="confirm__box"
                role="alertdialog"
                aria-label="Delete selected item?"
                onClick={(e) => e.stopPropagation()}
              >
                <p>Delete selected item?</p>
                <div className="confirm__actions">
                  <button onClick={() => setConfirming(false)}>CANCEL</button>
                  <button className="is-danger" onClick={confirmDelete}>
                    DELETE
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}