import styles from "./LikertScale.module.css";

const LABELS_5 = [
  "Strongly\nDisagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly\nAgree",
];
const LABELS_7 = [
  "Strongly\nDisagree",
  "Disagree",
  "Somewhat\nDisagree",
  "Neutral",
  "Somewhat\nAgree",
  "Agree",
  "Strongly\nAgree",
];

export default function LikertScale({ type, value, onChange }) {
  const labels = type === "likert7" ? LABELS_7 : LABELS_5;
  const count = labels.length;

  return (
    <div className={styles.wrapper}>
      <div className={styles.track}>
        {labels.map((label, i) => {
          const num = i + 1;
          const selected = value === num;
          return (
            <button
              key={num}
              type="button"
              className={`${styles.option} ${selected ? styles.selected : ""}`}
              onClick={() => onChange(num)}
              aria-label={`${num} — ${label.replace("\n", " ")}`}
            >
              <span className={styles.circle}>{num}</span>
              <span className={styles.label}>{label}</span>
            </button>
          );
        })}
      </div>
      {value != null && (
        <p className={styles.feedback}>
          You selected <strong>{value}</strong> — {labels[value - 1].replace("\n", " ")}
        </p>
      )}
    </div>
  );
}
