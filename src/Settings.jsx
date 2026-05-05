import React, { useState, useEffect } from "react";

const ANTHROPIC_KEY = "swanky_anthropic_key";
const KLAVIYO_KEY = "swanky_klaviyo_key";

export default function Settings({ onSave }) {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [klaviyoKey, setKlaviyoKey] = useState("");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showKlaviyoKey, setShowKlaviyoKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);

  // Whether keys already existed when this screen opened (determines Cancel button visibility)
  const [hadKeysOnOpen] = useState(() =>
    Boolean(localStorage.getItem(ANTHROPIC_KEY) && localStorage.getItem(KLAVIYO_KEY))
  );

  useEffect(() => {
    setAnthropicKey(localStorage.getItem(ANTHROPIC_KEY) || "");
    setKlaviyoKey(localStorage.getItem(KLAVIYO_KEY) || "");
  }, []);

  const canSave = anthropicKey.trim().length > 0 && klaviyoKey.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    // Write to localStorage — never log key values
    localStorage.setItem(ANTHROPIC_KEY, anthropicKey.trim());
    localStorage.setItem(KLAVIYO_KEY, klaviyoKey.trim());
    setSaved(true);
    setTimeout(() => onSave(), 700);
  };

  const handleClear = () => {
    localStorage.removeItem(ANTHROPIC_KEY);
    localStorage.removeItem(KLAVIYO_KEY);
    setAnthropicKey("");
    setKlaviyoKey("");
    setCleared(true);
    setTimeout(() => setCleared(false), 2500);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && canSave) handleSave();
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        display: "flex",
        fontFamily: "'Inter', -apple-system, sans-serif",
        background: "#f8f6f2",
        color: "#0a0a0a",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500;1,600&family=Inter:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />

      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          padding: "48px",
          background: "#ffffff",
          border: "1px solid #ededed",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <img
            src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png"
            alt="Swanky"
            style={{ height: "22px", opacity: 0.9, marginBottom: "28px", display: "block", margin: "0 auto 28px" }}
          />
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "34px",
              fontWeight: 300,
              lineHeight: 1.1,
              marginBottom: "8px",
              letterSpacing: "-0.01em",
            }}
          >
            {hadKeysOnOpen ? "Settings" : "Welcome"}
          </div>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "#6b6b6b",
            }}
          >
            {hadKeysOnOpen ? "Manage your API keys" : "Paste your API keys to begin"}
          </div>
        </div>

        <div style={{ height: "1px", background: "#ededed", marginBottom: "32px" }} />

        {/* Anthropic key field */}
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "#6b6b6b",
              marginBottom: "8px",
              fontWeight: 500,
            }}
          >
            Anthropic API key
          </div>
          <div style={{ position: "relative" }}>
            <input
              type={showAnthropicKey ? "text" : "password"}
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="sk-ant-..."
              autoComplete="off"
              spellCheck={false}
              style={{
                width: "100%",
                padding: "10px 48px 10px 12px",
                border: "1px solid #b8b8b8",
                background: "#ffffff",
                fontSize: "13px",
                fontFamily: "'Inter', sans-serif",
                color: "#0a0a0a",
                outline: "none",
                boxSizing: "border-box",
                borderRadius: 0,
              }}
            />
            <button
              onClick={() => setShowAnthropicKey((v) => !v)}
              tabIndex={-1}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#6b6b6b",
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontFamily: "'Inter', sans-serif",
                padding: "2px 4px",
              }}
            >
              {showAnthropicKey ? "hide" : "show"}
            </button>
          </div>
          <div
            style={{
              marginTop: "6px",
              fontSize: "11px",
              color: "#6b6b6b",
              fontFamily: "'Cormorant Garamond', serif",
              fontStyle: "italic",
              lineHeight: 1.4,
            }}
          >
            Get yours at console.anthropic.com → API Keys. You'll need a funded account (a few dollars of credits is enough to test).
          </div>
        </div>

        {/* Klaviyo key field */}
        <div style={{ marginBottom: "28px" }}>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "#6b6b6b",
              marginBottom: "8px",
              fontWeight: 500,
            }}
          >
            Klaviyo private API key
          </div>
          <div style={{ position: "relative" }}>
            <input
              type={showKlaviyoKey ? "text" : "password"}
              value={klaviyoKey}
              onChange={(e) => setKlaviyoKey(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="pk_..."
              autoComplete="off"
              spellCheck={false}
              style={{
                width: "100%",
                padding: "10px 48px 10px 12px",
                border: "1px solid #b8b8b8",
                background: "#ffffff",
                fontSize: "13px",
                fontFamily: "'Inter', sans-serif",
                color: "#0a0a0a",
                outline: "none",
                boxSizing: "border-box",
                borderRadius: 0,
              }}
            />
            <button
              onClick={() => setShowKlaviyoKey((v) => !v)}
              tabIndex={-1}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#6b6b6b",
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontFamily: "'Inter', sans-serif",
                padding: "2px 4px",
              }}
            >
              {showKlaviyoKey ? "hide" : "show"}
            </button>
          </div>
          <div
            style={{
              marginTop: "6px",
              fontSize: "11px",
              color: "#6b6b6b",
              fontFamily: "'Cormorant Garamond', serif",
              fontStyle: "italic",
              lineHeight: 1.4,
            }}
          >
            In Klaviyo: Account → Settings → API Keys → Create Private API Key. Scopes needed: Campaigns (read), Flows (read), Metrics (read).
          </div>
        </div>

        {/* Privacy notice */}
        <div
          style={{
            padding: "14px 16px",
            background: "#f8f6f2",
            border: "1px solid #ededed",
            marginBottom: "24px",
            fontSize: "11px",
            lineHeight: 1.65,
            color: "#6b6b6b",
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: "italic",
          }}
        >
          Keys are stored only in this browser's localStorage. They are never sent to Swanky, never committed to code, and never leave your machine except as authorisation headers sent directly to the Anthropic and Klaviyo APIs.
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!canSave || saved}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: saved ? "#6b6b6b" : canSave ? "#0a0a0a" : "#b8b8b8",
            color: "#ffffff",
            border: "none",
            fontFamily: "'Inter', sans-serif",
            fontSize: "12px",
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: canSave && !saved ? "pointer" : "default",
            marginBottom: "10px",
            transition: "background 0.2s ease",
          }}
        >
          {saved ? "Saved  ✓" : "Save keys"}
        </button>

        {/* Cancel (only when keys already existed) */}
        {hadKeysOnOpen && (
          <button
            onClick={onSave}
            style={{
              width: "100%",
              padding: "12px 20px",
              background: "transparent",
              color: "#2a2a2a",
              border: "1px solid #ededed",
              fontFamily: "'Inter', sans-serif",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              cursor: "pointer",
              marginBottom: "10px",
              transition: "border-color 0.15s ease",
            }}
          >
            Cancel
          </button>
        )}

        {/* Clear keys */}
        <button
          onClick={handleClear}
          style={{
            width: "100%",
            padding: "10px 20px",
            background: "transparent",
            color: cleared ? "#6b6b6b" : "#b8b8b8",
            border: "1px solid transparent",
            fontFamily: "'Inter', sans-serif",
            fontSize: "10px",
            fontWeight: 400,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "color 0.15s ease",
          }}
          onMouseEnter={(e) => { if (!cleared) e.currentTarget.style.color = "#6b6b6b"; }}
          onMouseLeave={(e) => { if (!cleared) e.currentTarget.style.color = "#b8b8b8"; }}
        >
          {cleared ? "Keys cleared from this browser" : "Clear all keys from this browser"}
        </button>
      </div>
    </div>
  );
}
