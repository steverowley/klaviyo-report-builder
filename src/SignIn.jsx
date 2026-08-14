import React, { useState, useEffect, useRef } from "react";
import { getWorkerUrl, GOOGLE_CLIENT_ID } from "./config.js";

function signInErrorMessage(data, status) {
  if (data?.error === "pending") {
    return "Your account is awaiting approval. Ask a Swanky admin to approve you in the Users panel, then sign in again.";
  }
  return data?.error || `Sign-in failed (${status}).`;
}

export default function SignIn({ onSignIn, onOpenSettings, notice }) {
  const [workerUrl, setWorkerUrl] = useState(getWorkerUrl);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // Not persisted: the URL comes from getWorkerUrl(), and writing it back would
  // pin the current value in localStorage, shadowing the baked-in URL for every
  // existing browser after the Worker is ever repointed. Settings is the only
  // place that stores an override.
  const workerUrlRef = useRef(workerUrl);
  useEffect(() => { workerUrlRef.current = workerUrl; }, [workerUrl]);

  const onSignInRef = useRef(onSignIn);
  useEffect(() => { onSignInRef.current = onSignIn; }, [onSignIn]);

  // Stored in a ref so the stable GSI callback always calls the latest version
  const credentialHandlerRef = useRef(null);
  credentialHandlerRef.current = async (googleResponse) => {
    const url = workerUrlRef.current;
    if (!url) { setError("Enter the Worker URL below first."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${url}?action=login-google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: googleResponse.credential }),
      });
      let data;
      try { data = await res.json(); } catch {
        setError(`Worker returned an unexpected response (${res.status}). Check the Worker URL in Settings.`);
        return;
      }
      if (!res.ok) { setError(signInErrorMessage(data, res.status)); return; }
      sessionStorage.setItem("swanky_session", data.token);
      sessionStorage.setItem("swanky_session_user", data.username);
      sessionStorage.setItem("swanky_session_admin", String(data.admin));
      onSignInRef.current({ token: data.token, username: data.username, admin: data.admin });
    } catch {
      setError(`Could not reach the worker at ${url} — verify the URL in Settings.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    function initGsi() {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r) => credentialHandlerRef.current(r),
        auto_select: false,
      });
      const btn = document.getElementById("g-signin-btn");
      if (btn && !btn.firstChild) {
        window.google.accounts.id.renderButton(btn, {
          theme: "outline",
          size: "large",
          width: 344,
          text: "signin_with",
        });
      }
    }
    if (window.google?.accounts?.id) {
      initGsi();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGsi;
      document.head.appendChild(script);
    }
  }, []);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    const url = workerUrlRef.current;
    if (!url) { setError("Worker URL not configured."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${url}?action=login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUsername.trim(), password: adminPassword }),
      });
      let data;
      try { data = await res.json(); } catch {
        setError(`Worker returned an unexpected response (${res.status}). Check the Worker URL in Settings.`);
        return;
      }
      if (!res.ok) { setError(signInErrorMessage(data, res.status)); return; }
      sessionStorage.setItem("swanky_session", data.token);
      sessionStorage.setItem("swanky_session_user", data.username);
      sessionStorage.setItem("swanky_session_admin", String(data.admin));
      onSignInRef.current({ token: data.token, username: data.username, admin: data.admin });
    } catch {
      setError("Network error — check the Worker URL.");
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = {
    background: "#ffffff",
    border: "1px solid #ededed",
    padding: "56px 48px",
    width: "min(440px, 100%)",
    boxSizing: "border-box",
    fontFamily: "'DM Sans', -apple-system, sans-serif",
  };

  const labelStyle = {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "10px",
    fontWeight: 500,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#6b6b6b",
    display: "block",
    marginBottom: "8px",
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    border: "1px solid #b8b8b8",
    background: "#ffffff",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "13px",
    fontWeight: 300,
    color: "#0a0a0a",
    outline: "none",
    borderRadius: 0,
  };

  const linkBtnStyle = {
    background: "none",
    border: "none",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "10px",
    fontWeight: 400,
    letterSpacing: "0.12em",
    color: "#b8b8b8",
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    transition: "color 0.15s ease",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8f6f2",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px",
    }}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <img
            src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png"
            alt="Swanky"
            style={{ height: "22px", objectFit: "contain", display: "block", margin: "0 auto" }}
          />
        </div>

        <div style={{ height: "1px", background: "#ededed", marginBottom: "40px" }} />

        <div style={{ marginBottom: "36px", textAlign: "center" }}>
          <div style={{
            fontFamily: "'Ovo', serif",
            fontSize: "34px",
            fontWeight: 400,
            color: "#0a0a0a",
            marginBottom: "8px",
            lineHeight: 1.1,
            letterSpacing: "-0.01em",
          }}>
            Klaviyo Report Builder
          </div>
          <div style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#b8b8b8",
          }}>
            Sign in to continue
          </div>
        </div>

        {notice && (
          <div style={{
            padding: "10px 14px",
            borderLeft: "2px solid #0a0a0a",
            background: "#f8f6f2",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "11px",
            fontWeight: 300,
            color: "#2a2a2a",
            marginBottom: "20px",
            lineHeight: 1.5,
          }}>
            {notice}
          </div>
        )}

        {/* Google Sign-In button rendered by GSI */}
        <div
          id="g-signin-btn"
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: error ? "20px" : "28px",
            opacity: loading ? 0.5 : 1,
            pointerEvents: loading ? "none" : "auto",
            transition: "opacity 0.15s ease",
          }}
        />

        {loading && (
          <div style={{
            textAlign: "center",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "11px",
            fontWeight: 300,
            color: "#6b6b6b",
            marginBottom: "20px",
          }}>
            Signing in…
          </div>
        )}

        {error && (
          <div style={{
            padding: "10px 14px",
            border: "1px solid #ededed",
            background: "#f8f6f2",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "11px",
            fontWeight: 300,
            color: "#2a2a2a",
            marginBottom: "20px",
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {/* Worker URL input — shown only when not configured */}
        {!workerUrl && (
          <div style={{ marginBottom: "24px" }}>
            <label style={labelStyle}>Worker URL</label>
            <input
              type="url"
              value={workerUrl}
              onChange={e => setWorkerUrl(e.target.value.trim())}
              placeholder="https://your-worker.workers.dev"
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
            <div style={{ marginTop: "6px", fontFamily: "'DM Sans', sans-serif", fontSize: "10px", fontWeight: 300, color: "#b8b8b8", fontStyle: "italic" }}>
              Ask your admin for the worker URL.
            </div>
          </div>
        )}

        <div style={{ height: "1px", background: "#ededed", margin: "24px 0" }} />

        {/* Admin sign-in toggle */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            onClick={() => { setShowAdminForm(v => !v); setError(""); }}
            style={linkBtnStyle}
            onMouseEnter={e => e.currentTarget.style.color = "#6b6b6b"}
            onMouseLeave={e => e.currentTarget.style.color = "#b8b8b8"}
          >
            {showAdminForm ? "Cancel" : "Admin sign-in"}
          </button>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              style={linkBtnStyle}
              onMouseEnter={e => e.currentTarget.style.color = "#6b6b6b"}
              onMouseLeave={e => e.currentTarget.style.color = "#b8b8b8"}
            >
              Configure worker URL
            </button>
          )}
        </div>

        {showAdminForm && (
          <form onSubmit={handleAdminLogin} autoComplete="off" style={{ marginTop: "28px" }}>
            <div style={{ height: "1px", background: "#ededed", marginBottom: "24px" }} />
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Username</label>
              <input
                type="text"
                value={adminUsername}
                onChange={e => setAdminUsername(e.target.value)}
                autoComplete="username"
                required
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !adminUsername.trim() || !adminPassword}
              style={{
                width: "100%",
                padding: "14px",
                background: loading || !adminUsername.trim() || !adminPassword ? "#b8b8b8" : "#0a0a0a",
                color: "#ffffff",
                border: "none",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "10px",
                fontWeight: 500,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                cursor: loading || !adminUsername.trim() || !adminPassword ? "default" : "pointer",
              }}
              onMouseEnter={e => { if (!loading && adminUsername.trim() && adminPassword) e.currentTarget.style.background = "#2a2a2a"; }}
              onMouseLeave={e => { if (!loading && adminUsername.trim() && adminPassword) e.currentTarget.style.background = "#0a0a0a"; }}
            >
              {loading ? "Please wait…" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
