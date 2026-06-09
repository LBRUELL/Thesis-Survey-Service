import { useLocation, Link } from "react-router-dom";
import styles from "./ThankYou.module.css";

export default function ThankYou() {
  const { state } = useLocation();
  const title = state?.surveyTitle || "the survey";
  const completionMessage = state?.completionMessage || "";

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
        <Link to="/" className="btn btn-outline" style={{ marginTop: 32 }}>
          Return home
        </Link>
      </div>
    </div>
  );
}
