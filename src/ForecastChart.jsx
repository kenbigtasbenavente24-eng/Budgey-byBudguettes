// Line graph for the forecast slide of the Budgey Recap: weekly spending against
// what the forecast said. It only draws; forecastChart.js decides what to draw.
//
//   chart        the `chart` object from forecastSlideFor()
//   splitLabels  optional { left, right }: small captions on each side of the
//                line where the past ends and the forecast begins
//
// The graph fills the space it is given (one unit of the drawing is one screen
// pixel), so tall phones get a taller graph and short phones a shorter one.
//
// Marks: spending is a solid ink line; the forecast is a dashed amber line with
// its likely range as a light amber band; the target is a thin solid green line.
// Amber and green are hard to tell apart for some colour-blind readers, so the
// forecast is dashed, the target is solid, and both are named on the graph and
// in the legend. Weeks far above the usual ones are cut off at the top of the
// graph and marked with a small triangle. The exact numbers are in a table for
// screen readers (taps on the slide change slides, so there is no hover here).

import { useEffect, useRef, useState } from "react";
import { axisPeso } from "./forecastChart";
import { peso } from "./recapData";
import "./ForecastChart.css";

const M = { top: 20, right: 8, bottom: 22, left: 44 }; // room for captions, peso labels, month labels
const FALLBACK = { w: 340, h: 200 }; // until the real size is measured
const MIN_PLOT = { w: 120, h: 80 };

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekLabel = (key) => {
  const [, m, d] = key.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}`;
};

// "M x,y L x,y ..." through the points, or "" when there are none
const line = (points) => points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

export default function ForecastChart({ chart, splitLabels }) {
  const { slots, splitIndex, bands, target, yMax, ticks, months } = chart;

  // Measure the space the graph has been given
  const plotRef = useRef(null);
  const [size, setSize] = useState(FALLBACK);
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize((prev) =>
          prev.w === Math.round(width) && prev.h === Math.round(height)
            ? prev
            : { w: Math.round(width), h: Math.round(height) }
        );
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = slots.length;
  if (n === 0) return null;

  const W = size.w;
  const H = size.h;
  const plotW = Math.max(MIN_PLOT.w, W - M.left - M.right);
  const plotH = Math.max(MIN_PLOT.h, H - M.top - M.bottom);
  const step = plotW / n;
  const x = (i) => M.left + (i + 0.5) * step;
  const y = (v) => M.top + plotH * (1 - Math.min(Math.max(v, 0), yMax) / yMax);

  const pointsOf = (field) =>
    slots.flatMap((s, i) => (s[field] === null ? [] : [[x(i), y(s[field])]]));
  const actual = pointsOf("actual");
  const forecastRuns = [pointsOf("predicted"), pointsOf("upcoming")].filter((p) => p.length);
  const last = actual[actual.length - 1];
  const clipped = slots.flatMap((s, i) => (s.clipped ? [i] : []));

  const splitX = splitIndex === null ? null : M.left + splitIndex * step;
  const hasForecast = forecastRuns.length > 0;

  // The "TARGET" label sits at the right end, on the side of the target line away from the
  // forecast there, so the dashes never run through the text. It moves to the other side
  // only if there is no room (line near the top or bottom of the graph).
  let targetLabelY = 0;
  if (target) {
    const ahead = slots.slice(-7).map((s) => s.predicted ?? s.upcoming).filter((v) => v !== null);
    const forecastIsAbove = ahead.length > 0 && ahead.reduce((t, v) => t + v, 0) / ahead.length > target;
    const below = y(target) + 12;
    const above = y(target) - 4;
    const roomBelow = below <= M.top + plotH - 2;
    const roomAbove = above - 8 >= M.top;
    targetLabelY = forecastIsAbove ? (roomBelow || !roomAbove ? below : above) : (roomAbove || !roomBelow ? above : below);
  }
  const hasBand = bands.length > 0;

  const summary =
    `Weekly spending in pesos over ${n} weeks` +
    (hasForecast ? ", with Budgey's forecast" : "") +
    (target ? ` and your ${peso(Math.round(target))} weekly target` : "") +
    ". The exact numbers are in the table below.";

  return (
    <figure className="fc">
      <div className="fc__plot" ref={plotRef}>
        <svg className="fc__svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
          {/* grid and peso axis */}
          {ticks.map((t) => (
            <g key={t}>
              <line className="fc__grid" x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} />
              <text className="fc__tick" x={M.left - 6} y={y(t) + 3.5} textAnchor="end">
                {axisPeso(t)}
              </text>
            </g>
          ))}

          {/* month labels */}
          {months.map((m) => (
            <text key={m.index} className="fc__tick" x={M.left + m.index * step + 1} y={H - 6}>
              {m.label}
            </text>
          ))}

          {/* likely range of the forecast */}
          {bands.map((b) => (
            <rect
              key={b.role}
              className="fc__band"
              x={M.left + b.from * step}
              y={y(b.upper)}
              width={(b.to - b.from + 1) * step}
              height={Math.max(0, y(b.lower) - y(b.upper))}
            />
          ))}

          {/* where the past ends and the forecast begins */}
          {splitX !== null && (
            <>
              <line className="fc__split" x1={splitX} x2={splitX} y1={M.top - 4} y2={M.top + plotH} />
              {splitLabels?.left && (
                <text className="fc__cap" x={splitX - 5} y={9} textAnchor="end">{splitLabels.left}</text>
              )}
              {splitLabels?.right && (
                <text className="fc__cap" x={splitX + 5} y={9}>{splitLabels.right}</text>
              )}
            </>
          )}

          {/* target */}
          {target ? (
            <g>
              <line className="fc__target" x1={M.left} x2={M.left + plotW} y1={y(target)} y2={y(target)} />
              <text className="fc__cap" x={M.left + plotW - 2} y={targetLabelY} textAnchor="end">
                TARGET {axisPeso(target)}
              </text>
            </g>
          ) : null}

          {/* forecast */}
          {forecastRuns.map((run, i) => (
            <path key={i} className="fc__forecast" d={line(run)} />
          ))}

          {/* what was spent */}
          {actual.length > 1 && <path className="fc__actual" d={line(actual)} pathLength="1" />}
          {last && <circle className="fc__dot" cx={last[0]} cy={last[1]} r="4" />}
          {clipped.map((i) => (
            <path
              key={i}
              className="fc__clip"
              d={`M${x(i) - 4.5},${M.top + 9} L${x(i) + 4.5},${M.top + 9} L${x(i)},${M.top + 1} Z`}
            />
          ))}
        </svg>
      </div>

      <ul className="fc__legend" aria-hidden="true">
        <li><i className="fc__key fc__key--actual" />Spent</li>
        {hasForecast && <li><i className="fc__key fc__key--forecast" />Forecast</li>}
        {hasBand && <li><i className="fc__key fc__key--band" />Likely range</li>}
        {target ? <li><i className="fc__key fc__key--target" />Target</li> : null}
        {clipped.length > 0 && <li><i className="fc__key fc__key--clip" />Off the chart</li>}
      </ul>

      <div className="sr-only">
        <table>
          <caption>Weekly spending and forecast</caption>
          <thead>
            <tr><th>Week of</th><th>Spent</th><th>Forecast</th></tr>
          </thead>
          <tbody>
            {slots.map((s) => {
              const f = s.predicted ?? s.upcoming;
              return (
                <tr key={s.start}>
                  <td>{weekLabel(s.start)}</td>
                  <td>{s.actual === null ? "not yet" : peso(s.actual)}</td>
                  <td>{f === null ? "none" : peso(f)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
