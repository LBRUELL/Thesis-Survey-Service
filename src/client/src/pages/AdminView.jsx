import { useState, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import styles from "./AdminView.module.css";
import { apiUrl } from "../utils/api.js";

export default function AdminView() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setError("No admin token provided.");
      setLoading(false);
      return;
    }
    fetch(apiUrl(`/api/surveys/${id}/responses?token=${token}`))
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  if (loading) {
    return (
      <div className={styles.centered}>
        <div className="spinner" />
        <p className="text-muted" style={{ marginTop: 16 }}>Loading responses…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centered}>
        <h2>Access denied</h2>
        <p className="text-muted" style={{ marginTop: 8 }}>{error}</p>
        <Link to="/" className="btn btn-outline" style={{ marginTop: 20 }}>Home</Link>
      </div>
    );
  }

  const { survey, responses } = data;

  const downloadCSV = () => {
    if (!responses.length) return;
    const allKeys = [...new Set(responses.flatMap((r) => Object.keys(r.answers || {})))];
    const header = ["Response ID", "Submitted At", ...allKeys].join(",");
    const rows = responses.map((r) =>
      [
        r.id,
        r.submittedAt,
        ...allKeys.map((k) => {
          const v = r.answers?.[k];
          if (typeof v === "object" && v !== null) return `"[image/video]"`;
          return `"${String(v ?? "").replace(/"/g, '""')}"`;
        }),
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${survey.title}-responses.csv`;
    a.click();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>Forma</Link>
        <span className={styles.adminBadge}>Admin</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-outline" onClick={downloadCSV} disabled={!responses.length}>
          ↓ Export CSV
        </button>
      </header>

      <main className={styles.main}>
        <div className={styles.topRow}>
          <div>
            <h1>{survey.title}</h1>
            <p className="text-muted" style={{ marginTop: 4 }}>
              {responses.length} response{responses.length !== 1 ? "s" : ""} collected
            </p>
          </div>
        </div>

        {responses.length === 0 ? (
          <div className={styles.empty}>
            <span>No responses yet.</span>
            <p className="text-muted text-sm">Share the survey link to start collecting data.</p>
          </div>
        ) : (
          <div className={styles.responseList}>
            {responses.map((r, i) => (
              <div key={r.id} className={styles.responseCard}>
                <div className={styles.responseHeader}>
                  <span className={styles.responseNum}>#{i + 1}</span>
                  <span className="text-xs text-muted">
                    {new Date(r.submittedAt).toLocaleString()}
                  </span>
                </div>
                <div className={styles.answers}>
                  {Object.entries(r.answers || {}).map(([key, val]) => (
                    <div key={key} className={styles.answer}>
                      <span className={styles.answerKey}>{key}</span>
                      <span className={styles.answerVal}>
                        {typeof val === "object" && val !== null
                          ? val.videoUrl
                            ? <a href={val.videoUrl} target="_blank" rel="noreferrer">View video ↗</a>
                            : "[image uploaded]"
                          : String(val ?? "—")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
