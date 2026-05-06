import React, { useState } from "react";
import ReportBuilder from "./ReportBuilder.jsx";
import Settings from "./Settings.jsx";

export default function App() {
  // Show Settings on first launch (missing either key) or when user opens gear
  const [showSettings, setShowSettings] = useState(() => {
    const ak = localStorage.getItem("swanky_anthropic_key");
    const kk = localStorage.getItem("swanky_klaviyo_key");
    const wu = localStorage.getItem("swanky_worker_url");
    return !ak || !kk || !wu;
  });

  return (
    <>
      <ReportBuilder onOpenSettings={() => setShowSettings(true)} />
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
          <Settings onSave={() => setShowSettings(false)} />
        </div>
      )}
    </>
  );
}
