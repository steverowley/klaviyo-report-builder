import React, { useState, useEffect, useRef } from "react";
import ReportBuilder from "./ReportBuilder.jsx";
import Settings from "./Settings.jsx";
import SignIn from "./SignIn.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { workerFetch } from "./workerApi.js";
import { useFocusTrap } from "./useFocusTrap.js";
import { getWorkerUrl } from "./config.js";

function CursorDot() {
  const dotRef = useRef(null);
  const pos = useRef({ x: -100, y: -100 });
  const rafRef = useRef(null);
  const hovering = useRef(false);

  // Opt out of the custom cursor for anyone who needs the native pointer: touch /
  // coarse pointers and users who ask for reduced motion. They keep the OS cursor.
  const [enabled] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    return !reduced && !coarse;
  });

  useEffect(() => {
    if (!enabled) return;
    let lastHoverCheck = 0;
    const onMove = (e) => {
      pos.current = { x: e.clientX, y: e.clientY };
      // Throttle the (layout-thrashing) hit-test to ~16/s instead of every mousemove.
      const now = performance.now();
      if (now - lastHoverCheck > 60) {
        lastHoverCheck = now;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        hovering.current = !!(el && (
          el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' ||
          el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' ||
          el.closest('button') || el.closest('a') || el.style?.cursor === 'pointer'
        ));
      }
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
  }, [enabled]);

  return (
    <>
      {enabled && (
        <div ref={dotRef} style={{
          position: "fixed", top: 0, left: 0, width: 5, height: 5,
          borderRadius: "50%", background: "#ffffff",
          pointerEvents: "none", zIndex: 9999,
          mixBlendMode: "difference",
          willChange: "transform, width, height",
          transition: "width 0.15s ease, height 0.15s ease, opacity 0.15s ease",
          transform: "translate(-100px, -100px)",
        }} />
      )}
      <style>{`
        ${enabled ? "* { cursor: none !important; }" : ""}
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #c8c6c0; border-radius: 0; }
        ::-webkit-scrollbar-thumb:hover { background: #6b6b6b; }
        * { scrollbar-width: thin; scrollbar-color: #c8c6c0 transparent; }
        /* Visible keyboard-focus indicator (custom cursor hides the usual hover cue) */
        :focus-visible { outline: 2px solid #0a0a0a !important; outline-offset: 2px; }
      `}</style>
    </>
  );
}

function AdminPanel({ session, onClose, onSignOut }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const panelRef = useRef(null);
  useFocusTrap(panelRef);

  const workerUrl = getWorkerUrl();

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await workerFetch(workerUrl, { action: "admin-users", token: session.token });
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

  // Close on Escape, like a standard dialog.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const checkAuth = (res) => {
    if ((res.status === 401 || res.status === 403) && onSignOut) {
      onSignOut("Your session has expired — please sign in again.");
      return false;
    }
    return res.ok;
  };

  const approve = async (username) => {
    setError("");
    try {
      const res = await workerFetch(workerUrl, {
        action: "admin-approve", method: "POST", token: session.token, body: { username },
      });
      if (!checkAuth(res)) { if (res.ok === false && res.status !== 401 && res.status !== 403) setError(`Could not approve ${username} — please try again.`); return; }
      fetchUsers();
    } catch {
      setError(`Could not approve ${username} — please try again.`);
    }
  };

  const deleteUser = async (username) => {
    setError("");
    try {
      const res = await workerFetch(workerUrl, {
        action: "admin-delete", method: "POST", token: session.token, body: { username },
      });
      if (!checkAuth(res)) { if (res.status !== 401 && res.status !== 403) setError(`Could not remove ${username} — please try again.`); return; }
      fetchUsers();
    } catch {
      setError(`Could not remove ${username} — please try again.`);
    }
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
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="User management" style={{
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
          <button onClick={onClose} aria-label="Close user management" style={{
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
        <AdminPanel session={session} onClose={() => setShowAdmin(false)} onSignOut={handleSignOut} />
      )}
    </>
  );
}
