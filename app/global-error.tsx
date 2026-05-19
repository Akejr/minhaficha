"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary. Catches errors thrown during the root layout
 * itself (something went wrong before <body> could render). Must include
 * its own <html> + <body> tags because no layout above it will run.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ficha-ai] global error:", error);
  }, [error]);

  return (
    <html lang="pt-PT">
      <body
        style={{
          backgroundColor: "#0a0a0a",
          color: "#e5e2e1",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginBottom: 12,
              background:
                "linear-gradient(90deg, #ff6b00, #e60000)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Ficha AI
          </div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Algo correu mal</h1>
          <p style={{ opacity: 0.7, marginBottom: 24, fontSize: 14 }}>
            Tivemos um problema crítico. Tenta de novo.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "linear-gradient(90deg, #ff6b00, #e60000)",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "12px 24px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
