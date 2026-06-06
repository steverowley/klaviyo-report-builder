import React, { useState, useEffect, useRef } from "react";
import ReportBuilder from "./ReportBuilder.jsx";
import Settings from "./Settings.jsx";
import SignIn from "./SignIn.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

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
        borderRadius: "50%", background: "#ffffff",
        pointerEvents: "none", zIndex: 9999,
        mixBlendMode: "difference",
        willChange: "transform, width, height",
        transition: "width 0.15s ease, height 0.15s ease, opacity 0.15s ease",
        transform: "translate(-100px, -100px)",
      }} />
      <style>{`
        * { cursor: none !important; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #c8c6c0; border-radius: 0; }
        ::-webkit-scrollbar-thumb:hover { background: #6b6b6b; }
        * { scrollbar-width: thin; scrollbar-color: #c8c6c0 transparent; }
      `}</style>
    </>
  );
}

function AdminPanel({ session, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const workerUrl = localStorage.getItem("swanky_worker_url") || "";

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${workerUrl}?action=admin-users`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const approve = async (username) => {
    await fetch(`${workerUrl}?action=admin-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ username }),
    });
    fetchUsers();
  };

  const deleteUser = async (username) => {
    await fetch(`${workerUrl}?action=admin-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ username }),
    });
    fetchUsers();
  };

  const pending = users.filter(u => !u.approved);
  const approved = users.filter(u => u.approved);

  const labelStyle = {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "9px",
    fontWeight: 500,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: "#6b6b6b",
    marginBottom: "12px",
    display: "block",
  };

  const userRowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid #ededed",
  };

  const smallBtnStyle = (dark) => ({
    padding: "5px 10px",
    background: dark ? "#0a0a0a" : "transparent",
    color: dark ? "#ffffff" : "#6b6b6b",
    border: dark ? "none" : "1px solid #ededed",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "9px",
    fontWeight: 500,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    cursor: "pointer",
    marginLeft: "6px",
  });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      display: "flex", justifyContent: "flex-end",
    }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(400px, 100vw)",
        height: "100%",
        background: "#ffffff",
        borderLeft: "1px solid #ededed",
        overflowY: "auto",
        padding: "40px 32px",
        boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
          <div style={{
            fontFamily: "'Ovo', serif",
            fontSize: "28px",
            fontWeight: 400,
            color: "#0a0a0a",
            letterSpacing: "-0.01em",
          }}>
            User Management
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#6b6b6b",
            fontFamily: "'DM Sans', sans-serif", fontSize: "18px", cursor: "pointer", lineHeight: 1,
            transition: "color 0.15s ease",
          }}
            onMouseEnter={e => e.currentTarget.style.color = "#0a0a0a"}
            onMouseLeave={e => e.currentTarget.style.color = "#6b6b6b"}
          >
            ×
          </button>
        </div>

        <div style={{ height: "1px", background: "#ededed", marginBottom: "32px" }} />

        {loading && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#6b6b6b" }}>
            Loading…
          </div>
        )}
        {error && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#2a2a2a", padding: "10px 14px", border: "1px solid #ededed", background: "#f8f6f2" }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div style={{ marginBottom: "32px" }}>
              <span style={labelStyle}>Pending approval ({pending.length})</span>
              {pending.length === 0 && (
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", fontWeight: 300, color: "#b8b8b8" }}>
                  No pending users
                </div>
              )}
              {pending.map(u => (
                <div key={u.username} style={userRowStyle}>
                  <div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 400, color: "#0a0a0a" }}>
                      {u.username}
                    </div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", fontWeight: 300, color: "#b8b8b8", marginTop: "2px" }}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ""}
                    </div>
                  </div>
                  <div>
                    <button style={smallBtnStyle(true)} onClick={() => approve(u.username)}
                      onMouseEnter={e => e.currentTarget.style.background = "#2a2a2a"}
                      onMouseLeave={e => e.currentTarget.style.background = "#0a0a0a"}
                    >Approve</button>
                    <button style={smallBtnStyle(false)} onClick={() => deleteUser(u.username)}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >Delete</button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <span style={labelStyle}>Approved ({approved.length})</span>
              {approved.length === 0 && (
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", fontWeight: 300, color: "#b8b8b8" }}>
                  No approved users
                </div>
              )}
              {approved.map(u => (
                <div key={u.username} style={userRowStyle}>
                  <div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 400, color: "#0a0a0a" }}>
                      {u.username}
                    </div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", fontWeight: 300, color: "#b8b8b8", marginTop: "2px" }}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ""}
                    </div>
                  </div>
                  <div>
                    <button style={smallBtnStyle(false)} onClick={() => deleteUser(u.username)}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(() => {
    const token = sessionStorage.getItem("swanky_session");
    if (!token) return null;
    return {
      token,
      username: sessionStorage.getItem("swanky_session_user") || "",
      admin: sessionStorage.getItem("swanky_session_admin") === "true",
    };
  });

  const [showSettings, setShowSettings] = useState(false);

  const [settingsVersion, setSettingsVersion] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [authNotice, setAuthNotice] = useState("");

  const handleSettingsSaved = () => {
    setShowSettings(false);
    setSettingsVersion(v => v + 1);
  };

  const handleSignIn = (sessionData) => {
    setAuthNotice("");
    setSession(sessionData);
  };

  // `reason` is an optional message shown on the sign-in screen (e.g. on session
  // expiry). The plain "Sign out" button calls this with the click event, which
  // isn't a string, so no notice is shown in that case.
  const handleSignOut = (reason) => {
    sessionStorage.removeItem("swanky_session");
    sessionStorage.removeItem("swanky_session_user");
    sessionStorage.removeItem("swanky_session_admin");
    // Don't leave the shared Anthropic key behind on shared/kiosk machines.
    localStorage.removeItem("swanky_anthropic_key");
    setAuthNotice(typeof reason === "string" ? reason : "");
    setSession(null);
    setShowAdmin(false);
  };

  if (!session) {
    return (
      <>
        <CursorDot />
        <SignIn onSignIn={handleSignIn} onOpenSettings={() => setShowSettings(true)} notice={authNotice} />
        {showSettings && (
          <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
            <Settings onSave={handleSettingsSaved} />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <CursorDot />

      <ErrorBoundary>
        <ReportBuilder
          onOpenSettings={session.admin ? () => setShowSettings(true) : undefined}
          settingsVersion={settingsVersion}
          sessionToken={session.token}
          session={session}
          onSignOut={handleSignOut}
          onOpenAdmin={session.admin ? () => setShowAdmin(v => !v) : undefined}
          adminPanelOpen={showAdmin}
        />
      </ErrorBoundary>
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
          <Settings onSave={handleSettingsSaved} />
        </div>
      )}
      {showAdmin && session.admin && (
        <AdminPanel session={session} onClose={() => setShowAdmin(false)} />
      )}
    </>
  );
}
