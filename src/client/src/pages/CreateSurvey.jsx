import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import styles from "./CreateSurvey.module.css";
import PasswordGate from "../components/PasswordGate.jsx";
import { apiUrl } from "../utils/api.js";

const QUESTION_TYPES = [
  { value: "text", label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "likert5", label: "Likert Scale (1–5)" },
  { value: "likert7", label: "Likert Scale (1–7)" },
  { value: "image_video", label: "Image Upload + AI Video (VEO)" },
  { value: "image_image", label: "Image Upload + AI Image (Imagen)" },
];

const DEFAULT_VEO_PROMPT =
  `Attached please find a selfie of a person, who is {{height}} cm tall, weighs {{weight}} kg, and has {{body_fat_min}}% – {{body_fat_max}}% body fat. Additionally, please find pictures of {{clothing_item}} in color {{clothing_color}}. Please generate a video of the person wearing {{clothing_item}} in size {{clothing_size}} in a setting of a try-on stall that one would find in a typical mall. The person should not be speaking.`;

const DEFAULT_IMAGE_PROMPT =
  `Generate a photorealistic image of the person in the uploaded selfie wearing {{clothing_item}} in color {{clothing_color}} and size {{clothing_size}}. Show the person standing in a well-lit mall fitting room. Keep the person's face, body shape, and proportions exactly as they appear in the selfie.`;

function newQuestion() {
  return {
    id: crypto.randomUUID(),
    type: "text",
    question: "",
    required: false,
    numbersOnly: false,
    variableName: "",
    videoPrompt: DEFAULT_VEO_PROMPT,
    imagePrompt: DEFAULT_IMAGE_PROMPT,
  };
}

function newPage() {
  return { id: crypto.randomUUID(), title: "", questions: [newQuestion()] };
}

function CreateSurveyBuilder() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [completionMessage, setCompletionMessage] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [pages, setPages] = useState([newPage()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // ── Page helpers ──────────────────────────────────────────────────────────
  const addPage = () => setPages((p) => [...p, newPage()]);
  const removePage = (pageId) =>
    setPages((p) => p.filter((pg) => pg.id !== pageId));
  const updatePage = (pageId, key, val) =>
    setPages((p) =>
      p.map((pg) => (pg.id === pageId ? { ...pg, [key]: val } : pg))
    );

  // ── Question helpers ──────────────────────────────────────────────────────
  const addQuestion = (pageId) =>
    setPages((p) =>
      p.map((pg) =>
        pg.id === pageId
          ? { ...pg, questions: [...pg.questions, newQuestion()] }
          : pg
      )
    );
  const removeQuestion = (pageId, qId) =>
    setPages((p) =>
      p.map((pg) =>
        pg.id === pageId
          ? { ...pg, questions: pg.questions.filter((q) => q.id !== qId) }
          : pg
      )
    );
  const updateQuestion = (pageId, qId, key, val) =>
    setPages((p) =>
      p.map((pg) =>
        pg.id === pageId
          ? {
              ...pg,
              questions: pg.questions.map((q) =>
                q.id === qId ? { ...q, [key]: val } : q
              ),
            }
          : pg
      )
    );

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setError("Survey title is required.");
    for (const pg of pages) {
      for (const q of pg.questions) {
        if (!q.question.trim())
          return setError("All questions must have text.");
        if (q.type === "image_video" && !q.videoPrompt?.trim())
          return setError("Image/Video questions need a video generation prompt.");
      }
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/surveys"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description, pages, completionMessage, redirectUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create survey");
      navigate("/survey-created", { state: data });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.back}>← Back</Link>
        <span className={styles.logo}>AI Try-On Platform</span>
        <button
          className="btn btn-accent"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "Publishing…" : "Publish survey"}
        </button>
      </header>

      <div className={styles.layout}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarSection}>
            <h3>Pages</h3>
            {pages.map((pg, i) => (
              <div key={pg.id} className={styles.sidebarPage}>
                <span>Page {i + 1}{pg.title ? ` — ${pg.title}` : ""}</span>
                <span className={styles.sidebarCount}>
                  {pg.questions.length}q
                </span>
              </div>
            ))}
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={addPage}>
              + Add page
            </button>
          </div>
        </aside>

        {/* Main editor */}
        <main className={styles.editor}>
          {error && (
            <div className={styles.errorBanner}>⚠ {error}</div>
          )}

          {/* Survey metadata */}
          <div className={`${styles.surveyMeta} card`}>
            <h2>Survey Details</h2>
            <div className="field" style={{ marginTop: 16 }}>
              <label>Survey Title *</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. User Experience Research Q1 2025"
              />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Description (optional)</label>
              <textarea
                className="input textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell participants what this survey is about…"
              />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Completion message (optional)</label>
              <textarea
                className="input textarea"
                value={completionMessage}
                onChange={(e) => setCompletionMessage(e.target.value)}
                placeholder="Message shown to participants after submitting. Defaults to a generic thank-you message."
              />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Redirect URL after completion (optional)</label>
              <input
                className="input"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="https://example.com/next-step"
              />
              <span className="text-xs text-muted" style={{ marginTop: 3 }}>
                Participants will be automatically redirected here 3 seconds after submitting.
              </span>
            </div>
          </div>

          {/* Pages */}
          {pages.map((pg, pageIdx) => (
            <div key={pg.id} className={styles.pageBlock}>
              <div className={styles.pageHeader}>
                <div className={styles.pageNum}>Page {pageIdx + 1}</div>
                <input
                  className={`input ${styles.pageTitle}`}
                  value={pg.title}
                  onChange={(e) => updatePage(pg.id, "title", e.target.value)}
                  placeholder="Page title (optional)"
                />
                {pages.length > 1 && (
                  <button
                    className="btn btn-ghost text-sm"
                    onClick={() => removePage(pg.id)}
                    title="Remove page"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className={styles.questions}>
                {pg.questions.map((q, qIdx) => (
                  <QuestionEditor
                    key={q.id}
                    question={q}
                    index={qIdx}
                    onChange={(key, val) => updateQuestion(pg.id, q.id, key, val)}
                    onRemove={() => removeQuestion(pg.id, q.id)}
                    canRemove={pg.questions.length > 1}
                    allQuestions={pages.flatMap((p) => p.questions)}
                  />
                ))}
              </div>

              <button
                className="btn btn-outline"
                style={{ marginTop: 8 }}
                onClick={() => addQuestion(pg.id)}
              >
                + Add question
              </button>
            </div>
          ))}

          <button className="btn btn-outline" onClick={addPage} style={{ width: "100%", justifyContent: "center" }}>
            + Add another page
          </button>
        </main>
      </div>
    </div>
  );
}

// ── Question editor sub-component ─────────────────────────────────────────────
function QuestionEditor({ question, index, onChange, onRemove, canRemove, allQuestions }) {
  // Gather all defined variable names (except self) for prompt reference hints
  const availableVars = allQuestions
    .filter((q) => q.id !== question.id && q.variableName?.trim())
    .map((q) => q.variableName.trim());

  return (
    <div className={styles.questionCard}>
      <div className={styles.questionTop}>
        <span className={styles.questionNum}>Q{index + 1}</span>
        <select
          className={`input ${styles.typeSelect}`}
          value={question.type}
          onChange={(e) => onChange("type", e.target.value)}
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className={styles.requiredToggle}>
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => onChange("required", e.target.checked)}
          />
          Required
        </label>
        {canRemove && (
          <button className="btn btn-ghost text-sm" onClick={onRemove} title="Remove">
            ✕
          </button>
        )}
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label>Question text *</label>
        <textarea
          className="input textarea"
          style={{ minHeight: 60 }}
          value={question.question}
          onChange={(e) => onChange("question", e.target.value)}
          placeholder="Type your question here…"
        />
      </div>

      {question.type === "text" && (
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={question.numbersOnly || false}
            onChange={(e) => onChange("numbersOnly", e.target.checked)}
          />
          <span>Numbers only</span>
          <span className={styles.toggleHint}>Accepts digits, decimals, and negatives — useful for height, weight, percentages, etc.</span>
        </label>
      )}

      {/* Variable name — used in VEO prompt interpolation */}
      <div className="field" style={{ marginTop: 10 }}>
        <label>Variable name <span className={styles.optional}>(for prompt interpolation)</span></label>
        <input
          className="input"
          value={question.variableName || ""}
          onChange={(e) =>
            onChange("variableName", e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase())
          }
          placeholder="e.g. height, weight, clothing_item"
        />
        <span className="text-xs text-muted" style={{ marginTop: 3 }}>
          Use <code className={styles.code}>{"{{variable_name}}"}</code> in the VEO prompt to insert this answer automatically.
        </span>
      </div>

      {question.type === "image_video" && (
        <div className="field" style={{ marginTop: 12 }}>
          <label>Gemini VEO Prompt</label>
          <textarea
            className="input textarea"
            style={{ minHeight: 100 }}
            value={question.videoPrompt}
            onChange={(e) => onChange("videoPrompt", e.target.value)}
          />
          {availableVars.length > 0 && (
            <div className={styles.varHints}>
              <span className="text-xs text-muted">Available variables from earlier questions:</span>
              <div className={styles.varChips}>
                {availableVars.map((v) => (
                  <code
                    key={v}
                    className={styles.varChip}
                    title={`Click to copy {{${v}}}`}
                    onClick={() => {
                      onChange("videoPrompt", question.videoPrompt + `{{${v}}}`);
                    }}
                  >
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </div>
          )}
          <span className="text-xs text-muted" style={{ marginTop: 4 }}>
            This prompt (with answers substituted in) + the participant's selfie are sent to Gemini VEO.
          </span>
        </div>
      )}

      {question.type === "image_image" && (
        <div className="field" style={{ marginTop: 12 }}>
          <label>Gemini Image Generation Prompt</label>
          <textarea
            className="input textarea"
            style={{ minHeight: 100 }}
            value={question.imagePrompt || ""}
            onChange={(e) => onChange("imagePrompt", e.target.value)}
          />
          {availableVars.length > 0 && (
            <div className={styles.varHints}>
              <span className="text-xs text-muted">Available variables from earlier questions:</span>
              <div className={styles.varChips}>
                {availableVars.map((v) => (
                  <code
                    key={v}
                    className={styles.varChip}
                    title={`Click to copy {{${v}}}`}
                    onClick={() => {
                      onChange("imagePrompt", (question.imagePrompt || "") + `{{${v}}}`);
                    }}
                  >
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </div>
          )}
          <span className="text-xs text-muted" style={{ marginTop: 4 }}>
            This prompt + the participant's selfie are sent to Gemini to generate a still image. Result appears instantly (no polling needed).
          </span>
        </div>
      )}

      {question.type === "likert5" && (
        <div className={styles.likertPreview}>
          {["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"].map((l, i) => (
            <div key={i} className={styles.likertPreviewItem}>
              <div className={styles.likertPreviewCircle}>{i + 1}</div>
              <span>{l}</span>
            </div>
          ))}
        </div>
      )}

      {question.type === "likert7" && (
        <div className={styles.likertPreview}>
          {["Strongly\nDisagree", "Disagree", "Somewhat\nDisagree", "Neutral", "Somewhat\nAgree", "Agree", "Strongly\nAgree"].map((l, i) => (
            <div key={i} className={styles.likertPreviewItem}>
              <div className={styles.likertPreviewCircle}>{i + 1}</div>
              <span>{l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CreateSurvey() {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem("forma_authed") === "1"
  );
  if (!authed) {
    return <PasswordGate onSuccess={() => setAuthed(true)} />;
  }
  return <CreateSurveyBuilder />;
}
