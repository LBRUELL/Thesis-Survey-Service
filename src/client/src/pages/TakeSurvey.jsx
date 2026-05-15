import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LikertScale from "../components/LikertScale.jsx";
import ImageVideoQuestion from "../components/ImageVideoQuestion.jsx";
import ImageImageQuestion from "../components/ImageImageQuestion.jsx";
import ProgressBar from "../components/ProgressBar.jsx";
import { apiUrl } from "../utils/api.js";
import styles from "./TakeSurvey.module.css";

// ── Resolve {{variableName}} placeholders using previous answers ──────────────
function interpolatePrompt(template, answers, allQuestions) {
  if (!template) return template;
  return template.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const trimmed = varName.trim();
    const q = allQuestions.find(
      (q) => q.variableName && q.variableName.trim() === trimmed
    );
    if (q && answers[q.id] != null && answers[q.id] !== "") {
      return String(answers[q.id]);
    }
    return `[${trimmed}]`;
  });
}

export default function TakeSurvey() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentPage, setCurrentPage] = useState(0);
  const [answers, setAnswers] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [videoComplete, setVideoComplete] = useState({});
  const [shakeId, setShakeId] = useState(null);

  const topRef = useRef(null);
  const videoWarningRefs = useRef({});

  useEffect(() => {
    fetch(apiUrl(`/api/surveys/${id}`))
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSurvey(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className={styles.centered}>
        <div className="spinner" />
        <p className="text-muted" style={{ marginTop: 16 }}>Loading survey…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.centered}>
        <h2>Survey not found</h2>
        <p className="text-muted" style={{ marginTop: 8 }}>{error}</p>
      </div>
    );
  }

  const pages = survey.pages;
  const page = pages[currentPage];
  const isLast = currentPage === pages.length - 1;
  const allQuestions = pages.flatMap((p) => p.questions);

  const setAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      delete next[questionId + "_video"];
      return next;
    });
  };

  const markVideoComplete = (questionId) => {
    setVideoComplete((prev) => ({ ...prev, [questionId]: true }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[questionId + "_video"];
      return next;
    });
  };

  const validatePage = () => {
    const errors = {};

    for (const q of page.questions) {
      const val = answers[q.id];

      if (q.required) {
        if (q.type === "text" || q.type === "textarea") {
          if (!val?.trim()) errors[q.id] = "This question is required.";
        } else if (q.type === "likert5" || q.type === "likert7") {
          if (val == null) errors[q.id] = "Please select a rating.";
        } else if (q.type === "image_video" || q.type === "image_image") {
          if (!val) errors[q.id] = "Please upload an image.";
        }
      }

      // Numbers-only validation (applies whether required or not, if a value was entered)
      if (q.type === "text" && q.numbersOnly && val?.trim()) {
        if (isNaN(Number(val.trim()))) {
          errors[q.id] = "Please enter a valid number.";
        }
      }

      if (q.type === "image_video" && answers[q.id]?.videoUrl && !videoComplete[q.id]) {
        errors[q.id + "_video"] = "Please watch the entire video before continuing.";
      }
    }

    setValidationErrors(errors);

    const videoErrors = Object.keys(errors).filter((k) => k.endsWith("_video"));
    if (videoErrors.length) {
      const qId = videoErrors[0].replace("_video", "");
      setShakeId(qId);
      setTimeout(() => setShakeId(null), 600);
      videoWarningRefs.current[qId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    return Object.keys(errors).length === 0;
  };

  const goNext = () => {
    if (!validatePage()) return;
    setCurrentPage((p) => p + 1);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async () => {
    if (!validatePage()) return;
    setSubmitting(true);
    try {
      const serialised = {};
      for (const [k, v] of Object.entries(answers)) {
        if (typeof v === "object" && v !== null) {
          serialised[k] = { hasImage: true, hasVideo: !!v.videoUrl };
        } else {
          serialised[k] = v;
        }
      }
      const res = await fetch(apiUrl(`/api/surveys/${id}/responses`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: serialised }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      navigate("/thank-you", { state: { surveyTitle: survey.title, completionMessage: survey.completionMessage, redirectUrl: survey.redirectUrl } });
    } catch (err) {
      setValidationErrors({ _submit: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div ref={topRef} />

      <header className={styles.header}>
        <span className={styles.logo}>AI Try-On Platform</span>
        <div className={styles.progressWrap}>
          <ProgressBar current={currentPage + 1} total={pages.length} />
        </div>
      </header>

      <main className={styles.main}>
        {currentPage === 0 && (
          <div className={styles.surveyIntro}>
            <h1>{survey.title}</h1>
            {survey.description && (
              <p className={styles.surveyDesc}>{survey.description}</p>
            )}
          </div>
        )}

        <div className={`${styles.pageCard} fade-in`} key={currentPage}>
          {page.title && <h2 className={styles.pageTitle}>{page.title}</h2>}

          <div className={styles.questions}>
            {page.questions.map((q, qi) => {
              const promptTemplate = q.type === "image_image" ? q.imagePrompt : q.videoPrompt;
              const resolvedPrompt = interpolatePrompt(promptTemplate, answers, allQuestions);

              return (
                <div key={q.id} className={styles.question}>
                  <p className={styles.questionText}>
                    {qi + 1}. {q.question}
                    {q.required && <span className={styles.required}>*</span>}
                  </p>

                  {q.type === "text" && !q.numbersOnly && (
                    <input
                      className="input"
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="Your answer…"
                    />
                  )}

                  {q.type === "text" && q.numbersOnly && (
                    <input
                      className="input"
                      type="number"
                      inputMode="decimal"
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="Enter a number…"
                      style={{ maxWidth: 200 }}
                    />
                  )}

                  {q.type === "textarea" && (
                    <textarea
                      className="input textarea"
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="Your answer…"
                    />
                  )}

                  {(q.type === "likert5" || q.type === "likert7") && (
                    <LikertScale
                      type={q.type}
                      value={answers[q.id] ?? null}
                      onChange={(v) => setAnswer(q.id, v)}
                    />
                  )}

                  {q.type === "image_video" && (
                    <>
                      <ImageVideoQuestion
                        videoPrompt={resolvedPrompt}
                        value={answers[q.id] || null}
                        onChange={(val) => {
                          setAnswer(q.id, val);
                          if (!val?.videoUrl) {
                            setVideoComplete((prev) => {
                              const next = { ...prev };
                              delete next[q.id];
                              return next;
                            });
                          }
                        }}
                        onVideoComplete={() => markVideoComplete(q.id)}
                      />

                      {answers[q.id]?.videoUrl && !videoComplete[q.id] && (
                        <div
                          ref={(el) => (videoWarningRefs.current[q.id] = el)}
                          className={`${styles.videoGateWarning} ${shakeId === q.id ? styles.shake : ""}`}
                        >
                          <span className={styles.videoGateIcon}>▶</span>
                          <span>
                            You must watch the entire video before you can continue. Press play and let it finish — the "Next" button will unlock automatically.
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {q.type === "image_image" && (
                    <ImageImageQuestion
                      imagePrompt={resolvedPrompt}
                      value={answers[q.id] || null}
                      onChange={(val) => setAnswer(q.id, val)}
                    />
                  )}

                  {validationErrors[q.id] && (
                    <p className={styles.fieldError}>{validationErrors[q.id]}</p>
                  )}
                </div>
              );
            })}
          </div>

          {validationErrors._submit && (
            <div className={styles.submitError}>⚠ {validationErrors._submit}</div>
          )}
        </div>

        <div className={styles.nav}>
          {isLast ? (
            <button
              className="btn btn-accent btn-lg"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Submit survey"}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={goNext}>
              Next →
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
