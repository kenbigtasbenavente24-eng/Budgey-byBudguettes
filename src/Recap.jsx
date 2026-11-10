import { useEffect, useRef, useState } from "react";
import { peso } from "./recapData";
import { shareRecapCard } from "./recapShare";
import "./Recap.css";

const SLIDE_MS = 6000; // how long each slide stays before moving on
const SLIDE_COUNT = 5;
const BAR_COLORS = ["#ee9a2f", "#c47a1c", "#8c6b3f", "#1f1712", "#1b7a3c"];

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/* ---------- small icons ---------- */

const Icon = ({ children, size = 20, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

const CloseIcon = () => (
  <Icon size={22}><path d="M5 5l14 14M19 5L5 19" /></Icon>
);
const ArrowRight = () => (
  <Icon><path d="M4 12h16M14 6l6 6-6 6" /></Icon>
);
const ArrowUp = () => (
  <Icon size={26}><path d="M12 20V4M6 10l6-6 6 6" /></Icon>
);
const ArrowDown = () => (
  <Icon size={26}><path d="M12 4v16M6 14l6 6 6-6" /></Icon>
);
const CameraIcon = () => (
  <Icon size={18}>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);
const StarIcon = () => (
  <Icon size={14}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" /></Icon>
);
const ShareIcon = () => (
  <Icon size={18}>
    <circle cx="6" cy="12" r="2.5" /><circle cx="17" cy="6" r="2.5" /><circle cx="17" cy="18" r="2.5" />
    <path d="M8.2 10.8l6.6-3.6M8.2 13.2l6.6 3.6" />
  </Icon>
);
const SparkleIcon = () => (
  <Icon size={46} strokeWidth="1.4">
    <path d="M12 3c.6 4.2 2.1 5.7 6.3 6.3-4.2.6-5.7 2.1-6.3 6.3-.6-4.2-2.1-5.7-6.3-6.3 4.2-.6 5.7-2.1 6.3-6.3z" />
    <path d="M19 15c.3 1.8.9 2.4 2.7 2.7-1.8.3-2.4.9-2.7 2.7-.3-1.8-.9-2.4-2.7-2.7 1.8-.3 2.4-.9 2.7-2.7z" />
    <circle cx="5" cy="19" r="1.4" />
  </Icon>
);

/* ---------- count-up number ---------- */

// Counts from 0 to `target` when the slide appears
function useCountUp(target, ms = 1000) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const duration = prefersReducedMotion() ? 0 : ms;
    let frame;
    let start;
    const tick = (now) => {
      start ??= now;
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);

  return value;
}

/* ---------- slides ---------- */

function IntroSlide({ recap }) {
  const total = useCountUp(recap.total);
  return (
    <div className="rs rs--orange">
      <span className="chip chip--dark">{recap.label}</span>
      <h2 className="rs__title rs__rise">Your quarterly spending story</h2>

      <div className="rs__logo" aria-hidden="true">
        <span>b<i>.</i></span>
        <SparkleIcon />
      </div>

      <p className="rs__eyebrow">YOU LOGGED A TOTAL OF</p>
      <p className="rs__big rs__big--peso">{peso(Math.round(total))}</p>
      <p className="rs__pill">
        <CameraIcon /> across <b>{recap.snaps}</b> logged {recap.snaps === 1 ? "snap" : "snaps"}
      </p>

      <p className="rs__hint">
        TAP RIGHT FOR NEXT SLIDE <ArrowRight />
      </p>
    </div>
  );
}

function FavoriteSlide({ recap }) {
  const f = recap.favorite;
  return (
    <div className="rs rs--dark">
      <div className="rs__photo">
        <img src={f.photo} alt={f.name} />
        <span className="chip chip--float"><StarIcon /> {f.badge}</span>
      </div>

      <p className="rs__eyebrow rs__eyebrow--soft">{f.label.toUpperCase()}</p>
      <h2 className="rs__item rs__rise">{f.name}</h2>
      <span className="chip chip--outline">{f.category}</span>

      <dl className="rs__stats">
        <div>
          <dt>TIMEFRAME</dt>
          <dd>{f.timeframe}</dd>
        </div>
        <div>
          <dt>SPENT</dt>
          <dd className="is-accent">{peso(f.spent)}</dd>
        </div>
        <div>
          <dt>SNAPS</dt>
          <dd className="is-accent">{f.snaps} {f.snaps === 1 ? "photo" : "photos"}</dd>
        </div>
      </dl>
    </div>
  );
}

function BreakdownSlide({ recap }) {
  return (
    <div className="rs rs--cream">
      <span className="chip chip--orange">BREAKDOWN</span>
      <h2 className="rs__title rs__rise">Where the money went</h2>

      <ol className="rs__rows">
        {recap.rows.map((row, i) => (
          <li key={row.name}>
            <div className="rs__row">
              <span className="rs__rank">{String(i + 1).padStart(2, "0")}</span>
              <span className="rs__name">{row.name}</span>
              <span className="rs__amount">{peso(row.amount)}</span>
            </div>
            <div className="rs__track">
              <span
                className="rs__fill"
                style={{
                  width: `${Math.max(row.share * 100, 3)}%`,
                  background: BAR_COLORS[i],
                  animationDelay: `${0.15 + i * 0.12}s`,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TrendSlide({ recap }) {
  const change = recap.snapChange;
  const count = useCountUp(change === null ? recap.snaps : Math.abs(change));

  let big;
  let title;
  let sub;
  let up = true;

  if (change === null) {
    big = String(Math.round(count));
    title = "A great start!";
    sub = "This is your first recap. Keep logging to see how you grow next quarter.";
  } else if (change > 0) {
    big = `+${Math.round(count)}%`;
    title = "Healthy logging growth!";
    sub = "Steady progress compared to last quarter.";
  } else if (change < 0) {
    big = `−${Math.round(count)}%`;
    title = "A quieter quarter";
    sub = "You logged fewer snaps than last quarter. Every photo counts, so keep going!";
    up = false;
  } else {
    big = "0%";
    title = "Right on pace";
    sub = "You logged just as much as last quarter.";
  }

  return (
    <div className="rs rs--green">
      <span className="chip chip--orange">TREND CHECK</span>

      <div className="rs__rings">
        <span className="rs__ring rs__ring--outer" />
        <span className="rs__ring rs__ring--inner" />
        <p className="rs__big rs__big--xl">{big}</p>
        {change === null && <p className="rs__caption">logged snaps</p>}
        {change !== null && change !== 0 && (
          <span className="rs__arrow">{up ? <ArrowUp /> : <ArrowDown />}</span>
        )}
      </div>

      <h2 className="rs__title rs__title--sm rs__rise">{title}</h2>
      <p className="rs__sub">{sub}</p>
    </div>
  );
}

function SaysSlide({ recap, onClose }) {
  const [status, setStatus] = useState("idle"); // idle | working | downloaded | error

  const share = async () => {
    setStatus("working");
    try {
      const result = await shareRecapCard(recap);
      setStatus(result === "downloaded" ? "downloaded" : "idle");
    } catch (err) {
      console.warn("Could not make the share card:", err);
      setStatus("error");
    }
  };

  const label = {
    idle: "Save & Share Card",
    working: "Preparing…",
    downloaded: "Saved to your device",
    error: "Couldn't make the card. Try again",
  }[status];

  return (
    <div className="rs rs--dark rs--says">
      <span className="chip chip--orange">BUDGEY SAYS</span>

      <div className="rs__says">
        <span className="rs__avatar" aria-hidden="true">b.</span>
        <p className="rs__message rs__rise">
          {recap.message.map((part, i) =>
            part.hl ? <em key={i}>{part.hl}</em> : <span key={i}>{part.text}</span>
          )}
        </p>
      </div>

      <div className="rs__actions">
        <button className="btn btn--solid" onClick={share} disabled={status === "working"}>
          <ShareIcon /> {label}
        </button>
        <button className="btn btn--ghost" onClick={onClose}>
          Back to Feed
        </button>
      </div>
    </div>
  );
}

/* ---------- the story player ---------- */

export default function Recap({ recap, onClose }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [autoplay] = useState(() => !prefersReducedMotion());
  const downAt = useRef(0);

  const go = (step) =>
    setIndex((i) => Math.min(SLIDE_COUNT - 1, Math.max(0, i + step)));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Press and hold pauses the timer. A quick tap changes slide.
  const press = () => {
    downAt.current = performance.now();
    setPaused(true);
  };
  const release = (step) => () => {
    setPaused(false);
    if (performance.now() - downAt.current < 250) go(step);
  };
  const cancel = () => setPaused(false);

  const slides = [
    <IntroSlide key="intro" recap={recap} />,
    <FavoriteSlide key="favorite" recap={recap} />,
    <BreakdownSlide key="breakdown" recap={recap} />,
    <TrendSlide key="trend" recap={recap} />,
    <SaysSlide key="says" recap={recap} onClose={onClose} />,
  ];

  return (
    <div
      className={`recap recap--${index + 1}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Budgey recap, slide ${index + 1} of ${SLIDE_COUNT}`}
    >
      <div className="recap__top">
        <div className="recap__bars" aria-hidden="true">
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <span key={i} className="recap__seg">
              {i < index && <span className="recap__fill is-done" />}
              {i === index && (
                <span
                  key={index}
                  className={`recap__fill ${autoplay ? "is-running" : "is-done"}`}
                  style={{
                    animationDuration: `${SLIDE_MS}ms`,
                    animationPlayState: paused ? "paused" : "running",
                  }}
                  onAnimationEnd={() => go(1)}
                />
              )}
            </span>
          ))}
        </div>
        <div className="recap__bar-row">
          <span className="recap__brand">BUDGEY RECAP</span>
          <button className="recap__close" onClick={onClose} aria-label="Close recap">
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="recap__slide" key={index}>
        {slides[index]}
      </div>

      {/* Invisible tap zones: left goes back, right goes forward */}
      <button className="recap__zone recap__zone--prev" tabIndex={-1} aria-label="Previous slide"
              onPointerDown={press} onPointerUp={release(-1)}
              onPointerLeave={cancel} onPointerCancel={cancel}
              onContextMenu={(e) => e.preventDefault()} />
      <button className="recap__zone recap__zone--next" tabIndex={-1} aria-label="Next slide"
              onPointerDown={press} onPointerUp={release(1)}
              onPointerLeave={cancel} onPointerCancel={cancel}
              onContextMenu={(e) => e.preventDefault()} />
    </div>
  );
}
