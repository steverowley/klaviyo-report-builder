// Bug report / feature request modal. Files a GitHub issue via the Worker's
// server-side token (?action=github-issue), so the user never needs a GitHub
// login — their existing app session authorises the call.
import { useState, useEffect, useRef } from "react";
import { workerFetch } from "../workerApi.js";
import { useFocusTrap } from "../useFocusTrap.js";
import { getWorkerUrl } from "../config.js";
import { SegmentButton } from "./Controls.jsx";

const labelStyle = {
  fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.16em",
  color: "#6b6b6b", marginBottom: "8px", fontWeight: 500,
};

const inputStyle = {
  width: "100%", padding: "10px 12px", border: "1px solid #b8b8b8",
  background: "#fff", fontSize: "13px", fontFamily: "'DM Sans', sans-serif",
  color: "#0a0a0a", outline: "none", boxSizing: "border-box", borderRadius: 0,
};

const hintStyle = {
  marginTop: "6px", fontSize: "11px", color: "#6b6b6b",
  fontFamily: "'Ovo', serif", fontStyle: "italic", lineHeight: 1.4,
};

const TITLE_MAX = 200;
const BODY_MAX = 8000;

export function FeedbackModal({ onClose, sessionToken, onSignOut }) {
  const [type, setType] = useState("bug"); // "bug" | "feature"
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [issueUrl, setIssueUrl] = useState("");
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isBug = type === "bug";
  const canSubmit = title.trim() && status !== "loading";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      setStatus("error");
      setErrorMsg("Worker URL not set. Open Settings and add it first.");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await workerFetch(workerUrl, {
        action: "github-issue", method: "POST", token: sessionToken,
        body: {
          type,
          title: title.trim().slice(0, TITLE_MAX),
          description: description.trim().slice(0, BODY_MAX),
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
        },
      });
      if ((res.status === 401 || res.status === 403) && onSignOut) {
        onSignOut("Your session has expired — please sign in again.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || `Error ${res.status}`);
        return;
      }
      setIssueUrl(data.url || "");
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e.message || "Network error — check your worker URL.");
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(10,10,10,0.55)",
        zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Send feedback" style={{ background: "#fff", width: "min(480px,100%)", border: "1px solid #ededed", padding: "40px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "24px" }}>
          <div>
            <div style={{ fontFamily: "'Ovo', serif", fontSize: "26px", fontWeight: 400, color: "#0a0a0a", marginBottom: "6px" }}>
              Send feedback
            </div>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.18em", color: "#6b6b6b" }}>
              Report a bug or request a feature
            </div>
          </div>
          <button onClick={onClose} aria-label="Close feedback" style={{
            background: "none", border: "none", color: "#b8b8b8",
            fontFamily: "'DM Sans', sans-serif", fontSize: "18px", cursor: "pointer", lineHeight: 1,
            transition: "color 0.15s ease", flexShrink: 0,
          }}
            onMouseEnter={e => e.currentTarget.style.color = "#0a0a0a"}
            onMouseLeave={e => e.currentTarget.style.color = "#b8b8b8"}
          >
            ×
          </button>
        </div>

        <div style={{ height: "1px", background: "#ededed", marginBottom: "24px" }} />

        {status === "success" ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>✓</div>
            <div style={{ fontFamily: "'Ovo', serif", fontSize: "18px", color: "#0a0a0a", marginBottom: "8px" }}>
              Thank you
            </div>
            <div style={{ fontSize: "11px", color: "#6b6b6b", marginBottom: "28px", lineHeight: 1.5 }}>
              Your {isBug ? "bug report" : "feature request"} has been logged{issueUrl ? "" : "."}
              {issueUrl && (
                <>
                  {" as "}
                  <a href={issueUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#0a0a0a", textDecoration: "underline" }}>
                    an issue on GitHub
                  </a>.
                </>
              )}
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
              <div style={labelStyle}>Type</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <SegmentButton active={isBug} onClick={() => setType("bug")} fullWidth>Bug report</SegmentButton>
                <SegmentButton active={!isBug} onClick={() => setType("feature")} fullWidth>Feature request</SegmentButton>
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div style={labelStyle}>{isBug ? "What went wrong?" : "What would you like?"}</div>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value.slice(0, TITLE_MAX))}
                placeholder={isBug ? "Report totals don’t match Klaviyo" : "Add a CSV export button"}
                autoFocus
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div style={labelStyle}>Details <span style={{ textTransform: "none", letterSpacing: 0, color: "#b8b8b8", fontWeight: 400 }}>(optional)</span></div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, BODY_MAX))}
                rows={5}
                placeholder={isBug
                  ? "Which client and date range? What did you expect to see, and what did you see instead?"
                  : "What problem would this solve, and how do you imagine it working?"}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, fontSize: "12px" }}
              />
              <div style={hintStyle}>
                Your browser and the current page are attached automatically to help us track it down.
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
                {status === "loading" ? "Sending…" : "Send feedback"}
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
          </>
        )}
      </div>
    </div>
  );
}
