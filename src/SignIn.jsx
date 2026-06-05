import React, { useState } from "react";

const WORKER_URL_KEY = "swanky_worker_url";

export default function SignIn({ onSignIn, onOpenSettings }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const workerUrl = localStorage.getItem(WORKER_URL_KEY) || "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!workerUrl) {
      setError("Worker URL not configured — open Settings first.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${workerUrl}?action=${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "pending") {
          setError("pending");
        } else {
          setError(data.error || "Something went wrong.");
        }
        return;
      }
      if (mode === "register") {
        setRegistered(true);
      } else {
        sessionStorage.setItem("swanky_session", data.token);
        sessionStorage.setItem("swanky_session_user", data.username);
        sessionStorage.setItem("swanky_session_admin", String(data.admin));
        if (data.workerUrl && !localStorage.getItem("swanky_worker_url")) {
          localStorage.setItem("swanky_worker_url", data.workerUrl);
        }
        if (data.anthropicKey && !localStorage.getItem("swanky_anthropic_key")) {
          localStorage.setItem("swanky_anthropic_key", data.anthropicKey);
        }
        onSignIn({ token: data.token, username: data.username, admin: data.admin });
      }
    } catch {
      setError("Network error — check your Worker URL in Settings.");
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

  const btnStyle = (active) => ({
    width: "100%",
    padding: "14px",
    background: active ? "#0a0a0a" : "#b8b8b8",
    color: "#ffffff",
    border: "none",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "10px",
    fontWeight: 500,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    cursor: active ? "pointer" : "default",
  });

  if (registered) {
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
        <link href="https://fonts.googleapis.com/css2?family=Ovo&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap" rel="stylesheet" />
        <div style={cardStyle}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <img
              src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png"
              alt="Swanky"
              style={{ height: "22px", objectFit: "contain", display: "block", margin: "0 auto" }}
            />
          </div>
          <div style={{ height: "1px", background: "#ededed", marginBottom: "40px" }} />
          <div style={{
            fontFamily: "'Ovo', serif",
            fontSize: "32px",
            fontWeight: 400,
            color: "#0a0a0a",
            marginBottom: "16px",
            lineHeight: 1.15,
            textAlign: "center",
            letterSpacing: "-0.01em",
          }}>
            Account created
          </div>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "13px",
            fontWeight: 300,
            color: "#6b6b6b",
            textAlign: "center",
            lineHeight: 1.7,
            marginBottom: "32px",
          }}>
            Your account is awaiting admin approval. You'll be able to sign in once it's been reviewed.
          </p>
          <button
            onClick={() => { setRegistered(false); setMode("login"); setUsername(""); setPassword(""); }}
            style={btnStyle(true)}
            onMouseEnter={e => e.currentTarget.style.background = "#2a2a2a"}
            onMouseLeave={e => e.currentTarget.style.background = "#0a0a0a"}
          >
            Back to sign in
          </button>
          {onOpenSettings && (
            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button
                onClick={onOpenSettings}
                style={{
                  background: "none", border: "none",
                  fontFamily: "'DM Sans', sans-serif", fontSize: "10px",
                  fontWeight: 400, letterSpacing: "0.12em", color: "#b8b8b8",
                  cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px",
                  transition: "color 0.15s ease",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "#6b6b6b"}
                onMouseLeave={e => e.currentTarget.style.color = "#b8b8b8"}
              >
                Configure worker URL
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

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
      <link href="https://fonts.googleapis.com/css2?family=Ovo&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap" rel="stylesheet" />
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <img
            src="https://swankyagency.com/wp-content/uploads/2022/05/swanky-2020-black.png"
            alt="Swanky"
            style={{ height: "22px", objectFit: "contain", display: "block", margin: "0 auto" }}
          />
        </div>

        <div style={{ height: "1px", background: "#ededed", marginBottom: "40px" }} />

        <div style={{ marginBottom: "32px", textAlign: "center" }}>
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
            {mode === "login" ? "Sign in to continue" : "Create your account"}
          </div>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: "28px" }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              style={inputStyle}
            />
            {mode === "register" && (
              <div style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "10px",
                fontWeight: 300,
                color: "#b8b8b8",
                marginTop: "6px",
                fontStyle: "italic",
              }}>
                Minimum 8 characters
              </div>
            )}
          </div>

          {error && error !== "pending" && (
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

          {error === "pending" && (
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
              Your account is awaiting admin approval.
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            style={btnStyle(!loading && username.trim() && password)}
            onMouseEnter={e => { if (!loading && username.trim() && password) e.currentTarget.style.background = "#2a2a2a"; }}
            onMouseLeave={e => { if (!loading && username.trim() && password) e.currentTarget.style.background = "#0a0a0a"; }}
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
          </button>
        </form>

        <div style={{ height: "1px", background: "#ededed", margin: "32px 0" }} />

        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            style={{
              background: "none",
              border: "none",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "10px",
              fontWeight: 400,
              letterSpacing: "0.12em",
              color: "#6b6b6b",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#0a0a0a"}
            onMouseLeave={e => e.currentTarget.style.color = "#6b6b6b"}
          >
            {mode === "login" ? "Don't have an account? Register" : "Already have an account? Sign in"}
          </button>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              style={{
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
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#6b6b6b"}
              onMouseLeave={e => e.currentTarget.style.color = "#b8b8b8"}
            >
              Configure worker URL
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
