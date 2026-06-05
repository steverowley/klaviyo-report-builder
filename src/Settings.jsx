import React, { useState, useEffect } from "react";

const ANTHROPIC_KEY = "swanky_anthropic_key";
const WORKER_URL = "swanky_worker_url";

export default function Settings({ onSave }) {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [workerUrl, setWorkerUrl] = useState("");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    setAnthropicKey(localStorage.getItem(ANTHROPIC_KEY) || "");
    setWorkerUrl(localStorage.getItem(WORKER_URL) || "");
  }, []);

  const normalizedWorkerUrl = () => {
    const u = workerUrl.trim();
    if (!u) return u;
    return u.startsWith("http") ? u : `https://${u}`;
  };

  const canSave = workerUrl.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    localStorage.setItem(ANTHROPIC_KEY, anthropicKey.trim());
    localStorage.setItem(WORKER_URL, normalizedWorkerUrl());
    setSaved(true);
    setTimeout(() => onSave(), 700);
  };

  const handleClear = () => {
    localStorage.removeItem(ANTHROPIC_KEY);
    localStorage.removeItem(WORKER_URL);
    localStorage.removeItem("swanky_admin_password"); // legacy
    localStorage.removeItem("swanky_klaviyo_key"); // legacy
    localStorage.removeItem("swanky_report_cache"); // legacy
    setAnthropicKey("");
    setWorkerUrl("");
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
        fontFamily: "'DM Sans', -apple-system, sans-serif",
        background: "#f8f6f2",
        color: "#0a0a0a",
        alignItems: "center",
        justifyContent: "center",
        overflowY: "auto",
        padding: "40px 20px",
        boxSizing: "border-box",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Ovo&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap"
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
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <img
            src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png"
            alt="Swanky"
            style={{ height: "22px", opacity: 1, display: "block", margin: "0 auto 28px" }}
          />
          <div
            style={{
              fontFamily: "'Ovo', serif",
              fontSize: "34px",
              fontWeight: 400,
              lineHeight: 1.1,
              marginBottom: "8px",
              letterSpacing: "-0.01em",
            }}
          >
            Admin Settings
          </div>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.2em", color: "#6b6b6b" }}>
            API keys &amp; worker configuration
          </div>
        </div>

        <div style={{ height: "1px", background: "#ededed", marginBottom: "32px" }} />

        <KeyField
          label="Anthropic API key"
          value={anthropicKey}
          onChange={setAnthropicKey}
          onKeyDown={handleKeyDown}
          show={showAnthropicKey}
          onToggleShow={() => setShowAnthropicKey(v => !v)}
          placeholder="sk-ant-..."
          hint="Get yours at console.anthropic.com → API Keys."
          isPassword
        />

        <div style={{ marginBottom: "28px" }}>
          <div style={labelStyle}>Klaviyo proxy worker URL</div>
          <input
            type="url"
            value={workerUrl}
            onChange={e => setWorkerUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://your-worker.workers.dev"
            autoComplete="off"
            spellCheck={false}
            style={inputStyle}
          />
          <div style={hintStyle}>
            Your Cloudflare Worker URL.
          </div>
        </div>

        <div
          style={{
            padding: "14px 16px",
            background: "#f8f6f2",
            border: "1px solid #ededed",
            marginBottom: "24px",
            fontSize: "11px",
            lineHeight: 1.65,
            color: "#6b6b6b",
            fontFamily: "'Ovo', serif",
            fontStyle: "italic",
          }}
        >
          Keys are stored only in this browser's localStorage. They are never sent to Swanky, never committed to code, and leave your machine only as authorisation headers to the Anthropic API and your own Cloudflare Worker.
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave || saved}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: saved ? "#6b6b6b" : canSave ? "#0a0a0a" : "#b8b8b8",
            color: "#ffffff",
            border: "none",
            fontFamily: "'DM Sans', sans-serif",
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

        <button
          onClick={onSave}
          style={{
            width: "100%",
            padding: "12px 20px",
            background: "transparent",
            color: "#2a2a2a",
            border: "1px solid #ededed",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "11px",
            fontWeight: 500,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor: "pointer",
            marginBottom: "10px",
          }}
        >
          Cancel
        </button>

        <button
          onClick={handleClear}
          style={{
            width: "100%",
            padding: "10px 20px",
            background: "transparent",
            color: cleared ? "#6b6b6b" : "#b8b8b8",
            border: "1px solid transparent",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "10px",
            fontWeight: 400,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "color 0.15s ease",
          }}
          onMouseEnter={e => { if (!cleared) e.currentTarget.style.color = "#6b6b6b"; }}
          onMouseLeave={e => { if (!cleared) e.currentTarget.style.color = "#b8b8b8"; }}
        >
          {cleared ? "Keys cleared from this browser" : "Clear all keys from this browser"}
        </button>
      </div>
    </div>
  );
}

function KeyField({ label, value, onChange, onKeyDown, show, onToggleShow, placeholder, hint, isPassword }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ position: "relative" }}>
        <input
          type={isPassword && !show ? "password" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          style={{ ...inputStyle, paddingRight: "48px" }}
        />
        <button
          onClick={onToggleShow}
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
            fontFamily: "'DM Sans', sans-serif",
            padding: "2px 4px",
          }}
        >
          {show ? "hide" : "show"}
        </button>
      </div>
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  );
}

const labelStyle = {
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.16em",
  color: "#6b6b6b",
  marginBottom: "8px",
  fontWeight: 500,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #b8b8b8",
  background: "#ffffff",
  fontSize: "13px",
  fontFamily: "'DM Sans', sans-serif",
  color: "#0a0a0a",
  outline: "none",
  boxSizing: "border-box",
  borderRadius: 0,
};

const hintStyle = {
  marginTop: "6px",
  fontSize: "11px",
  color: "#6b6b6b",
  fontFamily: "'Ovo', serif",
  fontStyle: "italic",
  lineHeight: 1.4,
};
