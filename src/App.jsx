import React, { useState, useEffect, useRef } from "react";
import ReportBuilder from "./ReportBuilder.jsx";
import Settings from "./Settings.jsx";

function CursorDot() {
  const dotRef = useRef(null);
  const pos = useRef({ x: -100, y: -100 });
  const rafRef = useRef(null);
  const hovering = useRef(false);

  useEffect(() => {
    const onMove = (e) => {
      pos.current = { x: e.clientX, y: e.clientY };
      const el = document.elementFromPoint(e.clientX, e.clientY);
      hovering.current = !!(el && (
        el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' ||
        el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' ||
        el.closest('button') || el.closest('a') || el.style?.cursor === 'pointer'
      ));
    };
    const onIframeMove = (e) => {
      pos.current = { x: e.detail.x, y: e.detail.y };
      hovering.current = false;
    };
    document.addEventListener('mousemove', onMove);
    window.addEventListener('iframe-cursor-move', onIframeMove);

    const tick = () => {
      if (dotRef.current) {
        const size = hovering.current ? 10 : 5;
        const offset = size / 2;
        dotRef.current.style.transform = `translate(${pos.current.x - offset}px, ${pos.current.y - offset}px)`;
        dotRef.current.style.width = `${size}px`;
        dotRef.current.style.height = `${size}px`;
        dotRef.current.style.opacity = hovering.current ? "0.5" : "1";
        dotRef.current.style.borderRadius = "50%";
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener('mousemove', onMove);
      window.removeEventListener('iframe-cursor-move', onIframeMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      <div ref={dotRef} style={{
        position: "fixed", top: 0, left: 0, width: 5, height: 5,
        borderRadius: "50%", background: "#0a0a0a",
        pointerEvents: "none", zIndex: 9999,
        willChange: "transform, width, height",
        transition: "width 0.15s ease, height 0.15s ease, opacity 0.15s ease",
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
