import styles from "./ProgressBar.module.css";

export default function ProgressBar({ current, total }) {
  const pct = total > 1 ? ((current - 1) / (total - 1)) * 100 : 100;
  return (
    <div className={styles.wrapper}>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.label}>
        Page {current} of {total}
      </span>
    </div>
  );
}
