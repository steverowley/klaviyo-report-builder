import React, { useState } from "react";
import ReportBuilder from "./ReportBuilder.jsx";
import Settings from "./Settings.jsx";

export default function App() {
  const [showSettings, setShowSettings] = useState(() => {
    const ak = localStorage.getItem("swanky_anthropic_key");
    const wu = localStorage.getItem("swanky_worker_url");
    return !ak || !wu;
  });
  const [settingsVersion, setSettingsVersion] = useState(0);

  const handleSettingsSave = () => {
    setShowSettings(false);
    setSettingsVersion(v => v + 1);
  };

  return (
    <>
      <ReportBuilder
        onOpenSettings={() => setShowSettings(true)}
        settingsVersion={settingsVersion}
      />
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
          <Settings onSave={handleSettingsSave} />
        </div>
      )}
    </>
  );
}
