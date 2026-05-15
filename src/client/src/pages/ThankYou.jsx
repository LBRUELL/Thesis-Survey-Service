import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import styles from "./ThankYou.module.css";

export default function ThankYou() {
  const { state } = useLocation();
  const title = state?.surveyTitle || "the survey";
  const completionMessage = state?.completionMessage || "";
  const redirectUrl = state?.redirectUrl || "";

  const [countdown, setCountdown] = useState(redirectUrl ? 3 : null);

  useEffect(() => {
    if (!redirectUrl) return;
    if (countdown === 0) {
      window.location.href = redirectUrl;
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, redirectUrl]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>✦</div>
        <h1>Thank you!</h1>
        <p>
          {completionMessage || (
            <>
              Your response to <em>{title}</em> has been recorded. Your
              contribution is greatly appreciated.
            </>
          )}
        </p>
        {redirectUrl && countdown !== null && (
          <p className={styles.countdown}>
            Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}…
          </p>
        )}
        {!redirectUrl && (
          <Link to="/" className="btn btn-outline" style={{ marginTop: 32 }}>
            Return home
          </Link>
        )}
      </div>
    </div>
  );
}
