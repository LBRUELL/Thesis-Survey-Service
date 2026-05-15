import { Link } from "react-router-dom";
import styles from "./Home.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.logo}>AI Try-On Platform</span>
      </header>

      <main className={styles.hero}>
        <div className={styles.badge}>Research-grade surveys</div>
        <h1 className={styles.title}>
          Collect richer
          <br />
          <em>research insights</em>
        </h1>
        <p className={styles.sub}>
          Build shareable surveys with Likert scales, image uploads, and
          AI-powered video generation via Gemini VEO — all in one place.
        </p>
        <div className={styles.actions}>
          <Link to="/create" className="btn btn-primary btn-lg">
            Create a survey →
          </Link>
        </div>
      </main>

      <section className={styles.features}>
        {[
          {
            icon: "⬡",
            title: "Multi-page flows",
            desc: "Organise questions across pages with smooth navigation.",
          },
          {
            icon: "◈",
            title: "Likert scales",
            desc: "Industry-standard 5 or 7-point agreement scales.",
          },
          {
            icon: "⬟",
            title: "Image → Video",
            desc: "Participants upload images; Gemini VEO transforms them into videos live.",
          },
          {
            icon: "◇",
            title: "Shareable links",
            desc: "One click to copy and share your survey with participants.",
          },
        ].map((f) => (
          <div key={f.title} className={styles.feature}>
            <span className={styles.featureIcon}>{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>
        <span>AI Try-On Platform · Built for research</span>
      </footer>
    </div>
  );
}
