import React from "react";

// Catches render-time crashes so a single component error shows a friendly,
// recoverable panel instead of a blank white screen (which looks like an outage
// to a non-technical user). Monochrome, matching the report design system.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface in the console for diagnosis; never block the recovery UI.
    console.error("Render error caught by ErrorBoundary:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          gap: "16px",
          padding: "40px",
          textAlign: "center",
          fontFamily: "'DM Sans', sans-serif",
          color: "#2a2a2a",
        }}
      >
        <div style={{ fontFamily: "'Ovo', serif", fontSize: "26px", color: "#0a0a0a" }}>
          Something went wrong displaying this view
        </div>
        <div style={{ fontSize: "13px", fontWeight: 300, maxWidth: "420px", lineHeight: 1.6 }}>
          The page hit an unexpected error. Your sign-in and saved reports are safe — reloading
          usually clears it. If it keeps happening, let Rowley know.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: "8px",
            border: "1px solid #0a0a0a",
            background: "#0a0a0a",
            color: "#fff",
            padding: "10px 22px",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
