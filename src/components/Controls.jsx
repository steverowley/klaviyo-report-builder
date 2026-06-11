// Small form controls shared by the report-builder sidebar.
import React from "react";
import { inputStyle } from "../theme.js";

export function Field({ label, children }) {
  return (
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
        {label}
      </div>
      {children}
    </div>
  );
}

export function SegmentButton({ active, onClick, children, fullWidth }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "9px 10px",
        background: active ? "#0a0a0a" : "#ffffff",
        color: active ? "#ffffff" : "#2a2a2a",
        border: `1px solid ${active ? "#0a0a0a" : "#b8b8b8"}`,
        fontSize: "11px",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 500,
        letterSpacing: "0.06em",
        cursor: "pointer",
        transition: "all 0.15s ease",
        width: fullWidth ? "100%" : "auto",
        textAlign: "center",
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "#f8f6f2"; e.currentTarget.style.borderColor = "#6b6b6b"; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.borderColor = "#b8b8b8"; } }}
    >
      {children}
    </button>
  );
}

const CONTEXT_EXAMPLES = [
  "e.g. 'Ran a 20% Easter sale — code EASTER20 sent 1st April'",
  "e.g. 'Launched new schoolwear range in March'",
  "e.g. 'Email list migrated from Mailchimp in Jan — deliverability was lower'",
  "e.g. 'Promoted free delivery throughout December'",
  "e.g. 'Rebranded in February — new templates from the 14th'",
  "e.g. 'Back to school campaign ran across August'",
];

export function ContextTextarea({ value, onChange }) {
  const [exIdx, setExIdx] = React.useState(0);
  const [visible, setVisible] = React.useState(true);
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (value || focused) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setExIdx(i => (i + 1) % CONTEXT_EXAMPLES.length);
        setVisible(true);
      }, 400);
    }, 3200);
    return () => clearInterval(id);
  }, [value, focused]);

  return (
    <div style={{ position: "relative" }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={4}
        style={{
          ...inputStyle,
          resize: "vertical",
          lineHeight: "1.6",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "11px",
          color: "#1a1a1a",
          height: "auto",
          background: "transparent",
          position: "relative",
          zIndex: 1,
        }}
      />
      {!value && !focused && (
        <div style={{
          position: "absolute",
          top: "10px",
          left: "12px",
          right: "12px",
          pointerEvents: "none",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "11px",
          color: "#b8b8b8",
          lineHeight: "1.6",
          zIndex: 0,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.35s ease",
        }}>
          {CONTEXT_EXAMPLES[exIdx]}
        </div>
      )}
    </div>
  );
}

// Review sign-off: a report can't be downloaded/sent until a human confirms the
// figures have been checked. Guards against AI-written numbers reaching a client unvetted.
export function SignOffCheckbox({ checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer", marginTop: "12px", marginBottom: "2px" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: "1px", accentColor: "#0a0a0a", width: "13px", height: "13px", flexShrink: 0, cursor: "pointer" }}
      />
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", color: "#6b6b6b", lineHeight: 1.45 }}>
        I’ve reviewed the figures against Klaviyo — this report is ready to send.
      </span>
    </label>
  );
}
