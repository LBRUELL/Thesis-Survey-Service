import { useLocation, Link } from "react-router-dom";
import { useState } from "react";
import styles from "./SurveyCreated.module.css";

export default function SurveyCreated() {
  const { state } = useLocation();
  const [copiedShare, setCopiedShare] = useState(false);
  const [copiedAdmin, setCopiedAdmin] = useState(false);

  if (!state?.id) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p>No survey data found.</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Home</Link>
      </div>
    );
  }

  const origin = window.location.origin;
  const shareUrl = `${origin}/survey/${state.id}`;
  const adminUrl = `${origin}/admin/${state.id}?token=${state.adminToken}`;

  const copy = async (text, setter) => {
    await navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.check}>✓</div>
        <h1>Survey published!</h1>
        <p className="text-muted" style={{ marginTop: 8 }}>
          Share the link below with your participants. Keep the admin link safe — it gives access to all responses.
        </p>

        <div className={styles.linkBlock}>
          <label>Participant link (shareable)</label>
          <div className={styles.linkRow}>
            <input readOnly className="input" value={shareUrl} />
            <button className="btn btn-accent" onClick={() => copy(shareUrl, setCopiedShare)}>
              {copiedShare ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className={styles.linkBlock}>
          <label>Admin link (private — view responses)</label>
          <div className={styles.linkRow}>
            <input readOnly className="input" value={adminUrl} />
            <button className="btn btn-outline" onClick={() => copy(adminUrl, setCopiedAdmin)}>
              {copiedAdmin ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-muted" style={{ marginTop: 6 }}>
            ⚠ Do not share this link — it gives full access to response data.
          </p>
        </div>

        <div className={styles.actions}>
          <Link to={`/survey/${state.id}`} className="btn btn-outline" target="_blank">
            Preview survey ↗
          </Link>
          <Link to="/create" className="btn btn-primary">
            Create another
          </Link>
        </div>
      </div>
    </div>
  );
}
