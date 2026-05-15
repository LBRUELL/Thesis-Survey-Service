import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./PasswordGate.module.css";
import { apiUrl } from "../utils/api.js";

export default function PasswordGate({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/auth/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        // Keep auth in sessionStorage so a page refresh doesn't re-prompt
        sessionStorage.setItem("forma_authed", "1");
        onSuccess();
      } else {
        setError("Incorrect password. Please try again.");
        setPassword("");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Link to="/" className={styles.logo}>AI Try-On Platform</Link>
        <h1>Researcher access</h1>
        <p className={styles.sub}>
          Enter the research team password to create and publish surveys.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className="field">
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password…"
              autoFocus
              autoComplete="current-password"
            />
          </div>

          {error && <p className={styles.error}>⚠ {error}</p>}

          <button
            className="btn btn-primary btn-lg"
            type="submit"
            disabled={loading || !password.trim()}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {loading ? "Verifying…" : "Continue →"}
          </button>
        </form>
      </div>
    </div>
  );
}
