// Presentational states for the report pane: the aux-activity banner, the
// empty state, the generation loading theatre, and its completion overlay.
import React, { useState, useRef, useEffect } from "react";

export function ActivityBanner({ label, progress }) {
  return (
    <div style={{
      padding: "10px 14px",
      marginBottom: "8px",
      background: "#ffffff",
      border: "1px solid #ededed",
      flexShrink: 0,
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: "11px",
        color: "#6b6b6b",
      }}>
        <span style={{ fontStyle: "italic", fontFamily: "'Ovo', serif" }}>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "10px", letterSpacing: "0.06em" }}>
          {Math.round(progress)}%
        </span>
      </div>
      <div style={{ width: "100%", height: "2px", background: "#ededed", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${progress}%`,
          background: "#0a0a0a",
          transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
        }} />
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
          animation: "shimmer 1.8s ease-in-out infinite",
          transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>
    </div>
  );
}

export function EmptyState() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "40px",
        color: "#6b6b6b",
      }}
    >
      <img
        src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png"
        alt="Swanky"
        style={{ height: "28px", opacity: 1, marginBottom: "32px" }}
      />
      <div
        style={{
          fontFamily: "'Ovo', serif",
          fontSize: "44px",
          fontWeight: 300,
          color: "#0a0a0a",
          lineHeight: 1.1,
          maxWidth: "480px",
          letterSpacing: "-0.01em",
        }}
      >
        A quiet space, awaiting your numbers.
      </div>
      <div
        style={{
          marginTop: "20px",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "#6b6b6b",
        }}
      >
        Configure parameters &nbsp;·&nbsp; Generate report
      </div>
    </div>
  );
}

const BAR_HEIGHTS = [6,14,22,30,36,40,36,30,22,14,6,10,18,28,38,42,38,28,18,10,6,14];

export function LoadingState({ progress, line, elapsed, justFinished, onDismissCompletion, onNewReport, lastUsage }) {
  const pct = Math.round(progress);
  const formatTime = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);
  const showPatience = elapsed >= 90 && !justFinished;
  const containerRef = useRef(null);
  const barRefs = useRef([]);
  const [ripples, setRipples] = useState([]);

  // Mouse move → opacity spotlight (bars near cursor bright, far bars dim).
  // The bars don't move, so measure their geometry once (re-measuring on resize)
  // instead of calling getBoundingClientRect for every bar on every mousemove.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let rect = el.getBoundingClientRect();
    let centers = barRefs.current.map((bar) => {
      if (!bar) return null;
      const br = bar.getBoundingClientRect();
      return br.left + br.width / 2 - rect.left;
    });
    const remeasure = () => {
      rect = el.getBoundingClientRect();
      centers = barRefs.current.map((bar) => {
        if (!bar) return null;
        const br = bar.getBoundingClientRect();
        return br.left + br.width / 2 - rect.left;
      });
    };
    const onMove = (e) => {
      const mx = e.clientX - rect.left;
      barRefs.current.forEach((bar, i) => {
        if (!bar || centers[i] == null) return;
        const dist = Math.abs(mx - centers[i]);
        bar.style.opacity = 0.12 + 0.88 * Math.exp(-(dist * dist) / (2 * 85 * 85));
      });
    };
    const onLeave = () => {
      barRefs.current.forEach(bar => { if (bar) bar.style.opacity = 1; });
    };
    window.addEventListener('resize', remeasure);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('resize', remeasure);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // Click → crosshair registration mark
  const handleClick = (e) => {
    if (justFinished) return;
    const rect = containerRef.current.getBoundingClientRect();
    const id = Date.now() + Math.random();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRipples(r => [...r, { id, x, y }]);
    setTimeout(() => setRipples(r => r.filter(rip => rip.id !== id)), 700);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 40px",
        position: "relative",
        overflow: "hidden",
        background: "#ffffff",
        animation: "loadIn 0.6s ease-out",
      }}
    >
      <FloatingNumerals />

      {/* Crosshair registration marks — SVG layer, pointer-events none */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 4, overflow: "visible" }}>
        {ripples.map(r => (
          <g key={r.id} transform={`translate(${r.x},${r.y})`} style={{ animation: "crossFade 0.6s ease-out forwards" }}>
            {/* Centre dot */}
            <circle cx="0" cy="0" r="1" fill="#0a0a0a" />
            {/* Vertical arm — draws from centre outward */}
            <line x1="0" y1="-16" x2="0" y2="16" stroke="#0a0a0a" strokeWidth="0.5"
              style={{ transformOrigin: "0px 0px", animation: "armV 0.18s ease-out forwards" }} />
            {/* Horizontal arm — draws from centre outward */}
            <line x1="-16" y1="0" x2="16" y2="0" stroke="#0a0a0a" strokeWidth="0.5"
              style={{ transformOrigin: "0px 0px", animation: "armH 0.18s ease-out forwards" }} />
          </g>
        ))}
      </svg>

      {/* Equalizer bars — mouse-reactive + continuously looping */}
      <div style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "3px",
        height: "48px",
        marginBottom: "44px",
        zIndex: 2,
        animation: "loadIn 0.5s ease-out both",
      }}>
        {BAR_HEIGHTS.map((maxH, i) => (
          <div
            key={i}
            ref={el => barRefs.current[i] = el}
            style={{
              width: "2px",
              background: "#0a0a0a",
              borderRadius: "1px",
              height: "3px",
              animationName: "barPulse",
              animationDuration: `${1.1 + (i % 4) * 0.09}s`,
              animationDelay: `${(i / BAR_HEIGHTS.length) * 1.1}s`,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDirection: "alternate",
              "--bar-max": `${maxH}px`,
            }}
          />
        ))}
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "'Ovo', serif",
        fontSize: "36px",
        fontWeight: 400,
        color: "#0a0a0a",
        fontStyle: "italic",
        lineHeight: 1.15,
        marginBottom: "8px",
        zIndex: 2,
        animation: "loadIn 0.7s ease-out 0.15s both",
      }}>
        Composing your report
      </div>

      {/* Rotating loading line */}
      <div
        key={line}
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.24em",
          color: "#b8b8b8",
          marginBottom: "44px",
          minHeight: "14px",
          fontFamily: "'DM Sans', sans-serif",
          animation: "fadeLine 0.5s ease-out",
          zIndex: 2,
        }}
      >
        {line}
      </div>

      {/* Progress section */}
      <div style={{ width: "min(360px, 60%)", zIndex: 2, animation: "loadIn 0.7s ease-out 0.25s both" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "10px",
        }}>
          <span style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "#c8c6c0",
          }}>
            {formatTime(elapsed)} elapsed
          </span>
          <span style={{
            fontFamily: "'Ovo', serif",
            fontSize: "28px",
            fontWeight: 400,
            color: "#0a0a0a",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}>
            {pct}<span style={{ fontSize: "13px", color: "#c8c6c0", marginLeft: "2px" }}>%</span>
          </span>
        </div>

        {/* Hairline progress bar */}
        <div style={{ width: "100%", height: "1px", background: "#ededed", position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: `${progress}%`,
            background: "#0a0a0a",
            transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }} />
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%)",
            animation: "shimmer 2.4s ease-in-out infinite",
            transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }} />
        </div>

        {showPatience && (
          <div style={{
            marginTop: "28px",
            fontSize: "13px",
            color: "#aaa",
            fontStyle: "italic",
            fontFamily: "'Ovo', serif",
            lineHeight: 1.6,
            animation: "fadeLine 0.8s ease-out",
          }}>
            Still composing. Long periods with many flows can take a moment.
          </div>
        )}
      </div>

      <style>{`
        @keyframes barPulse {
          from { height: 3px; opacity: 0.2; }
          to { height: var(--bar-max); opacity: 0.85; }
        }
        @keyframes armV {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
        @keyframes armH {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes crossFade {
          0%   { opacity: 0; }
          15%  { opacity: 0.65; }
          55%  { opacity: 0.65; }
          100% { opacity: 0; }
        }
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes fadeLine {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loadIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {justFinished && <CompletionOverlay onDismiss={onDismissCompletion} onNewReport={onNewReport} lastUsage={lastUsage} />}
    </div>
  );
}

function CompletionOverlay({ onDismiss, onNewReport, lastUsage }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#f8f6f2",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
        animation: "overlayFadeIn 0.4s ease-out",
      }}
    >
      {/* Checkmark */}
      <svg
        width="48"
        height="48"
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginBottom: "40px", opacity: 0, animation: "markIn 0.5s ease-out 0.3s forwards" }}
      >
        <circle
          cx="32" cy="32" r="30"
          fill="none" stroke="#0a0a0a" strokeWidth="1"
          strokeDasharray="190" strokeDashoffset="190"
          style={{ animation: "drawCircle 0.7s cubic-bezier(0.65, 0, 0.35, 1) 0.3s forwards" }}
        />
        <path
          d="M 18 33 L 28 43 L 46 23"
          fill="none" stroke="#0a0a0a" strokeWidth="1.5"
          strokeLinecap="square" strokeLinejoin="miter"
          strokeDasharray="50" strokeDashoffset="50"
          style={{ animation: "drawCheck 0.4s cubic-bezier(0.65, 0, 0.35, 1) 0.8s forwards" }}
        />
      </svg>

      {/* Hairline above title */}
      <div style={{
        width: "min(480px, 60%)",
        height: "1px",
        background: "#0a0a0a",
        transformOrigin: "left",
        transform: "scaleX(0)",
        animation: "drawHairline 0.5s cubic-bezier(0.65, 0, 0.35, 1) 1s forwards",
      }} />

      {/* Title */}
      <div style={{
        fontFamily: "'Ovo', serif",
        fontSize: "52px",
        fontWeight: 300,
        color: "#0a0a0a",
        letterSpacing: "-0.01em",
        fontStyle: "italic",
        lineHeight: 1.1,
        padding: "16px 0 12px",
        opacity: 0,
        animation: "fadeUp 0.6s ease-out 1.1s forwards",
      }}>
        Ready.
      </div>

      {/* Hairline below title */}
      <div style={{
        width: "min(480px, 60%)",
        height: "1px",
        background: "#0a0a0a",
        transformOrigin: "right",
        transform: "scaleX(0)",
        animation: "drawHairline 0.5s cubic-bezier(0.65, 0, 0.35, 1) 1.05s forwards",
      }} />

      {/* Subtitle */}
      <div style={{
        marginTop: "20px",
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.24em",
        color: "#6b6b6b",
        opacity: 0,
        animation: "fadeUp 0.6s ease-out 1.3s forwards",
      }}>
        Your report is rendered below
      </div>

      {/* Buttons */}
      <div style={{
        marginTop: "36px",
        display: "flex",
        gap: "12px",
        opacity: 0,
        animation: "fadeUp 0.6s ease-out 1.5s forwards",
      }}>
        <button
          onClick={onDismiss}
          style={{
            padding: "12px 28px",
            background: "#0a0a0a",
            color: "#ffffff",
            border: "1px solid #0a0a0a",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "11px",
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "background 0.2s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2a2a")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#0a0a0a")}
        >
          View report
        </button>
        <button
          onClick={onNewReport}
          style={{
            padding: "12px 28px",
            background: "transparent",
            color: "#0a0a0a",
            border: "1px solid #0a0a0a",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "11px",
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "background 0.2s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#ededed")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          New report
        </button>
      </div>

      {lastUsage && (
        <div style={{
          marginTop: "28px",
          display: "flex",
          gap: "24px",
          opacity: 0,
          animation: "fadeUp 0.6s ease-out 1.7s forwards",
        }}>
          {[
            ["Cost", `$${lastUsage.costUsd.toFixed(4)}`],
            ["Output", lastUsage.outputTokens.toLocaleString() + " tk"],
            ...(lastUsage.cacheReadTokens > 0 ? [["Cache hit", lastUsage.cacheReadTokens.toLocaleString() + " tk"]] : []),
            ...(lastUsage.cacheCreationTokens > 0 ? [["Cache write", lastUsage.cacheCreationTokens.toLocaleString() + " tk"]] : []),
          ].map(([label, value]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.2em", color: "#b8b8b8", marginBottom: "3px" }}>{label}</div>
              <div style={{ fontSize: "11px", fontVariantNumeric: "tabular-nums", color: "#6b6b6b", letterSpacing: "0.04em" }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes overlayFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes drawHairline { to { transform: scaleX(1); } }
        @keyframes markIn { to { opacity: 1; } }
        @keyframes drawCircle { to { stroke-dashoffset: 0; } }
        @keyframes drawCheck { to { stroke-dashoffset: 0; } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function FloatingNumerals() {
  const numerals = [
    { text: "12.4%", left: "8%", delay: 0, duration: 18, size: 22 },
    { text: "£48,290", left: "18%", delay: 5, duration: 22, size: 18 },
    { text: "0.84", left: "82%", delay: 2.5, duration: 20, size: 24 },
    { text: "↑ 6.2%", left: "88%", delay: 9, duration: 17, size: 16 },
    { text: "1,247", left: "5%", delay: 13, duration: 21, size: 20 },
    { text: "31.7%", left: "92%", delay: 7, duration: 19, size: 18 },
    { text: "£12.40", left: "12%", delay: 16, duration: 22, size: 16 },
    { text: "0.421", left: "78%", delay: 4, duration: 20, size: 22 },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}>
      {numerals.map((n, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: n.left,
            bottom: "-40px",
            fontFamily: "'Ovo', serif",
            fontSize: `${n.size}px`,
            fontWeight: 400,
            color: "#0a0a0a",
            opacity: 0,
            fontVariantNumeric: "tabular-nums",
            animation: `floatUp ${n.duration}s ease-in-out ${n.delay}s infinite`,
            whiteSpace: "nowrap",
          }}
        >
          {n.text}
        </span>
      ))}
      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0); opacity: 0; }
          15% { opacity: 0.05; }
          85% { opacity: 0.05; }
          100% { transform: translateY(-100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
