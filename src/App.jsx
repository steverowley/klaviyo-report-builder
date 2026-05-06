import React, { useState, useEffect, useRef } from "react";
import ReportBuilder from "./ReportBuilder.jsx";
import Settings from "./Settings.jsx";

function CursorDot() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const pos = useRef({ x: -100, y: -100 });
  const ring = useRef({ x: -100, y: -100 });
  const rafRef = useRef(null);
  const hovering = useRef(false);

  useEffect(() => {
    const onMove = (e) => {
      pos.current = { x: e.clientX, y: e.clientY };
      const el = document.elementFromPoint(e.clientX, e.clientY);
      hovering.current = el && (
        el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' ||
        el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' ||
        el.closest('button') || el.closest('a') || el.style?.cursor === 'pointer'
      );
    };
    document.addEventListener('mousemove', onMove);

    const tick = () => {
      // Dot snaps instantly
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${pos.current.x - 4}px, ${pos.current.y - 4}px)`;
      }
      // Ring lags slightly
      ring.current.x += (pos.current.x - ring.current.x) * 0.18;
      ring.current.y += (pos.current.y - ring.current.y) * 0.18;
      if (ringRef.current) {
        const scale = hovering.current ? 1.8 : 1;
        ringRef.current.style.transform = `translate(${ring.current.x - 18}px, ${ring.current.y - 18}px) scale(${scale})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      {/* Solid dot */}
      <div ref={dotRef} style={{
        position: "fixed", top: 0, left: 0, width: 8, height: 8,
        borderRadius: "50%", background: "#0a0a0a",
        pointerEvents: "none", zIndex: 9999,
        willChange: "transform",
      }} />
      {/* Lagging ring */}
      <div ref={ringRef} style={{
        position: "fixed", top: 0, left: 0, width: 36, height: 36,
        borderRadius: "50%", border: "1px solid #0a0a0a",
        opacity: 0.35,
        pointerEvents: "none", zIndex: 9998,
        willChange: "transform",
        transition: "transform 0.08s linear, opacity 0.15s",
      }} />
      <style>{`* { cursor: none !important; }`}</style>
    </>
  );
}

export default function App() {
  const [showSettings, setShowSettings] = useState(() => {
    const ak = localStorage.getItem("swanky_anthropic_key");
    const wu = localStorage.getItem("swanky_worker_url");
    return !ak || !wu;
  });

  const [settingsVersion, setSettingsVersion] = useState(0);

  const handleSettingsSaved = () => {
    setShowSettings(false);
    setSettingsVersion(v => v + 1);
  };

  return (
    <>
      <CursorDot />
      <ReportBuilder
        onOpenSettings={() => setShowSettings(true)}
        settingsVersion={settingsVersion}
      />
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
          <Settings onSave={handleSettingsSaved} />
        </div>
      )}
    </>
  );
}
