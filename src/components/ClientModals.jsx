// Admin client-management modals: add a new client (validates the Klaviyo
// key server-side) and the destructive offboard flow.
import { useState, useEffect } from "react";
import { workerFetch } from "../workerApi.js";

const modalLabelStyle = {
  fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.16em",
  color: "#6b6b6b", marginBottom: "8px", fontWeight: 500,
};

const modalInputStyle = {
  width: "100%", padding: "10px 12px", border: "1px solid #b8b8b8",
  background: "#fff", fontSize: "13px", fontFamily: "'DM Sans', sans-serif",
  color: "#0a0a0a", outline: "none", boxSizing: "border-box", borderRadius: 0,
};

const modalToggleStyle = {
  position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
  background: "transparent", border: "none", cursor: "pointer", color: "#6b6b6b",
  fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em",
  fontFamily: "'DM Sans', sans-serif", padding: "2px 4px",
};

const modalHintStyle = {
  marginTop: "6px", fontSize: "11px", color: "#6b6b6b",
  fontFamily: "'Ovo', serif", fontStyle: "italic", lineHeight: 1.4,
};

export function AddClientModal({ onClose, onAdded, sessionToken }) {
  const [name, setName] = useState("");
  const [klaviyoKey, setKlaviyoKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState(null); // null | "loading" | "success" | "error"
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit = name.trim() && klaviyoKey.trim() && status !== "loading";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const workerUrl = localStorage.getItem("swanky_worker_url");
    if (!workerUrl) {
      setStatus("error");
      setErrorMsg("Worker URL not set. Open Settings and add it first.");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await workerFetch(workerUrl, {
        action: "add-client", method: "POST", token: sessionToken,
        body: { name: name.trim(), klaviyoKey: klaviyoKey.trim() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(res.status === 403
          ? "Only admins can add clients — ask a Swanky admin."
          : (data.error || `Error ${res.status}`));
        return;
      }
      setStatus("success");
      if (data.clients) onAdded(data.clients);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e.message || "Network error — check your worker URL.");
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(10,10,10,0.55)",
        zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", width: "min(480px,100%)", border: "1px solid #ededed", padding: "40px" }}>
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontFamily: "'Ovo', serif", fontSize: "26px", fontWeight: 400, color: "#0a0a0a", marginBottom: "6px" }}>
            Add new client
          </div>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.18em", color: "#6b6b6b" }}>
            Stored securely in Cloudflare KV
          </div>
        </div>

        <div style={{ height: "1px", background: "#ededed", marginBottom: "24px" }} />

        {status === "success" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>✓</div>
            <div style={{ fontFamily: "'Ovo', serif", fontSize: "18px", color: "#0a0a0a", marginBottom: "8px" }}>
              Client added
            </div>
            <div style={{ fontSize: "11px", color: "#6b6b6b", marginBottom: "28px" }}>
              {name} is now available in the client list.
            </div>
            <button
              onClick={onClose}
              style={{
                padding: "12px 32px", background: "#0a0a0a", color: "#fff",
                border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: "11px",
                fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#2a2a2a"}
              onMouseLeave={e => e.currentTarget.style.background = "#0a0a0a"}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: "20px" }}>
              <div style={modalLabelStyle}>Client name</div>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Acme Clothing Co."
                autoFocus
                style={modalInputStyle}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div style={modalLabelStyle}>Klaviyo private API key</div>
              <div style={{ position: "relative" }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={klaviyoKey}
                  onChange={e => setKlaviyoKey(e.target.value)}
                  placeholder="pk_..."
                  autoComplete="off"
                  spellCheck={false}
                  style={{ ...modalInputStyle, paddingRight: "48px" }}
                />
                <button onClick={() => setShowKey(v => !v)} tabIndex={-1} style={modalToggleStyle}
                  onMouseEnter={e => e.currentTarget.style.color = "#0a0a0a"}
                  onMouseLeave={e => e.currentTarget.style.color = "#6b6b6b"}
                >
                  {showKey ? "hide" : "show"}
                </button>
              </div>
              <div style={modalHintStyle}>
                Klaviyo → Settings → API Keys → Create Private API Key. Needs read access to campaigns, flows and metrics.
              </div>
            </div>

            {status === "error" && (
              <div style={{
                padding: "10px 14px", background: "#fafaf8", border: "1px solid #ededed",
                fontSize: "11px", color: "#6b6b6b", fontFamily: "'Ovo', serif", fontStyle: "italic",
                marginBottom: "20px", lineHeight: 1.5,
              }}>
                {errorMsg}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  flex: 1, padding: "13px 20px",
                  background: canSubmit ? "#0a0a0a" : "#b8b8b8",
                  color: "#fff", border: "none",
                  fontFamily: "'DM Sans', sans-serif", fontSize: "11px",
                  fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase",
                  cursor: canSubmit ? "pointer" : "default",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = "#2a2a2a"; }}
                onMouseLeave={e => { if (canSubmit) e.currentTarget.style.background = "#0a0a0a"; }}
              >
                {status === "loading" ? "Adding…" : "Add client"}
              </button>
              <button
                onClick={onClose}
                style={{
                  padding: "13px 20px", background: "transparent",
                  color: "#2a2a2a", border: "1px solid #ededed",
                  fontFamily: "'DM Sans', sans-serif", fontSize: "11px",
                  fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Admin-only destructive flow: remove a departed client's Klaviyo key, client-list
// entry, and every saved report. Requires typing the client's exact name to confirm.
export function OffboardClientModal({ clients, sessionToken, onClose, onSignOut, onOffboarded }) {
  const [selectedId, setSelectedId] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = clients.find(c => c.id === selectedId) || null;
  const canSubmit = !!selected && confirmText.trim() === selected.name && status !== "loading";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const workerUrl = localStorage.getItem("swanky_worker_url");
    if (!workerUrl) { setStatus("error"); setErrorMsg("Worker URL not set. Open Settings and add it first."); return; }
    setStatus("loading"); setErrorMsg("");
    try {
      const res = await workerFetch(workerUrl, {
        action: "offboard-client", method: "POST", token: sessionToken,
        body: { clientId: selectedId },
      });
      if ((res.status === 401 || res.status === 403) && onSignOut) {
        onSignOut("Your session has expired — please sign in again."); return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus("error"); setErrorMsg(data.error || `Error ${res.status}`); return; }
      onOffboarded(data.clients || [], selectedId);
    } catch (e) {
      setStatus("error"); setErrorMsg(e.message || "Network error — check your worker URL.");
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(10,10,10,0.55)",
        zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", width: "min(480px,100%)", border: "1px solid #ededed", padding: "40px" }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontFamily: "'Ovo', serif", fontSize: "26px", fontWeight: 400, color: "#0a0a0a", marginBottom: "6px" }}>
            Offboard a client
          </div>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.18em", color: "#6b6b6b" }}>
            Permanent — removes the key and all saved reports
          </div>
        </div>

        <div style={{ height: "1px", background: "#ededed", marginBottom: "24px" }} />

        <div style={{ marginBottom: "20px" }}>
          <div style={modalLabelStyle}>Client</div>
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setConfirmText(""); setStatus("idle"); }}
            style={{ ...modalInputStyle, appearance: "auto" }}
          >
            <option value="">— select a client —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selected && (
          <>
            <div style={{
              padding: "12px 14px", background: "#fafaf8", border: "1px solid #0a0a0a",
              fontSize: "11px", color: "#2a2a2a", fontFamily: "'DM Sans', sans-serif",
              lineHeight: 1.55, marginBottom: "20px",
            }}>
              This permanently deletes <strong>{selected.name}</strong>’s Klaviyo key and every saved
              report for them. This cannot be undone. Download anything you need to keep first.
            </div>
            <div style={{ marginBottom: "20px" }}>
              <div style={modalLabelStyle}>Type “{selected.name}” to confirm</div>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={selected.name}
                autoFocus
                style={modalInputStyle}
              />
            </div>
          </>
        )}

        {status === "error" && (
          <div style={{
            padding: "10px 14px", background: "#fafaf8", border: "1px solid #ededed",
            fontSize: "11px", color: "#6b6b6b", fontFamily: "'Ovo', serif", fontStyle: "italic",
            marginBottom: "20px", lineHeight: 1.5,
          }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              flex: 1, padding: "13px 20px",
              background: canSubmit ? "#0a0a0a" : "#b8b8b8",
              color: "#fff", border: "none",
              fontFamily: "'DM Sans', sans-serif", fontSize: "11px",
              fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase",
              cursor: canSubmit ? "pointer" : "default",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = "#2a2a2a"; }}
            onMouseLeave={e => { if (canSubmit) e.currentTarget.style.background = "#0a0a0a"; }}
          >
            {status === "loading" ? "Offboarding…" : "Offboard client"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "13px 20px", background: "transparent",
              color: "#2a2a2a", border: "1px solid #ededed",
              fontFamily: "'DM Sans', sans-serif", fontSize: "11px",
              fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase",
              cursor: "pointer", transition: "background 0.15s ease",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#f8f6f2"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
