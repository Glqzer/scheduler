import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function GoogleCalendarCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Importing your calendar...");
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError("Google calendar access was denied.");
      return;
    }

    if (!code || !state) {
      setError("Something went wrong — missing code or state.");
      return;
    }

    let parsed: { pollId: string; timeMin: string; timeMax: string };
    try {
      parsed = JSON.parse(atob(state));
    } catch {
      setError("Invalid state parameter.");
      return;
    }

    const { pollId, timeMin, timeMax } = parsed;

    fetch(
      `/api/google-calendar?code=${encodeURIComponent(code)}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
    )
      .then(async (r) => {
        const text = await r.text();
        try {
          const data = JSON.parse(text);
          if (data.error) {
            setError(
              `Import failed: ${data.error} — ${JSON.stringify(data.details ?? "")}`,
            );
            setTimeout(() => navigate(`/poll/${pollId}`), 3000);
            return;
          }
          if (data.busy) {
            sessionStorage.setItem(
              `calendar-busy-${pollId}`,
              JSON.stringify(
                data.busy.map((b: { start: string; end: string }) => ({
                  start: b.start,
                  end: b.end,
                  summary: "Busy",
                })),
              ),
            );
            setStatus("Calendar imported! Redirecting...");
            setTimeout(() => navigate(`/poll/${pollId}`), 800);
          }
        } catch {
          setError(`API returned: ${text.slice(0, 200)}`);
          setTimeout(() => navigate(`/poll/${pollId}`), 3000);
        }
      })
      .catch((err) => {
        setError(`Fetch failed: ${err.message}`);
        setTimeout(() => navigate(`/poll/${pollId}`), 2000);
      });
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {error ? (
        <>
          <div style={{ fontSize: 40 }}>😬</div>
          <p style={{ color: "var(--accent)", fontSize: 16, fontWeight: 600 }}>
            {error}
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Taking you back...
          </p>
        </>
      ) : (
        <>
          <div style={{ fontSize: 40 }}>🗓</div>
          <p style={{ color: "var(--text)", fontSize: 16, fontWeight: 600 }}>
            {status}
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            nailong is fetching your calendar...
          </p>
        </>
      )}
    </div>
  );
}
