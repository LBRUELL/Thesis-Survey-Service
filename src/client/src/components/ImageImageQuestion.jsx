import { useState, useRef, useCallback, useEffect } from "react";
import { getDeviceId } from "../utils/deviceId.js";
import { apiUrl } from "../utils/api.js";
import CameraCapture from "./CameraCapture.jsx";
import styles from "./ImageImageQuestion.module.css";

export default function ImageImageQuestion({ surveyId, imagePrompt, value, onChange }) {
  const [stage, setStage] = useState(
    value?.generatedUrl ? "done" : "idle"
  );
  const [preview, setPreview] = useState(value?.imagePath || null);
  const [generatedUrl, setGeneratedUrl] = useState(value?.generatedUrl || null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  const [quota, setQuota] = useState(null);

  const [showCamera, setShowCamera] = useState(false);

  const fileRef = useRef();
  const dragRef = useRef(null);

  useEffect(() => {
    const url = surveyId ? apiUrl(`/api/usage?surveyId=${surveyId}`) : apiUrl("/api/usage");
    fetch(url, { headers: { "x-device-id": getDeviceId() } })
      .then((r) => r.json())
      .then((d) => setQuota({ used: d.images, limit: d.limits.images }))
      .catch(() => {});
  }, [surveyId]);

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload an image file (JPEG, PNG, WebP, etc.)");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Image must be under 20 MB.");
      return;
    }

    setError(null);
    setStage("generating");
    setProgress({ label: "Uploading image…", pct: 30 });

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    const formData = new FormData();
    formData.append("image", file);
    formData.append("prompt", imagePrompt || "Generate a high-quality styled image.");
    if (surveyId) formData.append("surveyId", surveyId);

    const MAX_RETRIES = 4;
    const RETRY_DELAYS = [4000, 8000, 16000, 30000];

    try {
      let res, data;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const wait = RETRY_DELAYS[attempt - 1];
          const secs = Math.round(wait / 1000);
          setProgress({
            label: `Servers busy — retrying in ${secs}s… (attempt ${attempt + 1} of ${MAX_RETRIES + 1})`,
            pct: 20 + attempt * 5,
            retry: true,
          });
          await new Promise((r) => setTimeout(r, wait));
          setProgress({
            label: `Retrying… (attempt ${attempt + 1} of ${MAX_RETRIES + 1})`,
            pct: 25 + attempt * 5,
          });
        } else {
          setProgress({ label: "Pre-processing image...", pct: 30 });
        }

        res = await fetch(apiUrl("/api/generate-image"), {
          method: "POST",
          headers: { "x-device-id": getDeviceId() },
          body: formData,
        });
        data = await res.json();

        const isOverloaded = res.status === 503 || res.status === 429 || (data.error || "").includes("high demand");
        if (res.ok || !isOverloaded) break;

        if (attempt === MAX_RETRIES) {
          throw new Error("The image generation service is currently overloaded. Please wait a minute and try uploading again.");
        }
      }

      if (!res.ok) throw new Error(data.details || data.error || "Generation failed");

      // SUCCESS: We expect 'data.imageBase64' from the server now
      // It should look like "data:image/png;base64,iVBORw0KG..."
      const finalImageUrl = data.imageBase64;

      setGeneratedUrl(finalImageUrl);
      setStage("done");
      setProgress(null);
      setQuota((q) => q ? { ...q, used: q.used + 1 } : q);

      onChange({ imagePath: localUrl, generatedUrl: finalImageUrl });
    } catch (err) {
      setError(err.message);
      setStage("idle");
      setProgress(null);
    }
  }, [imagePrompt, onChange]);

  // ── Drag and drop ────────────────────────────────────────────────────────
  const onDragOver = (e) => {
    e.preventDefault();
    dragRef.current?.classList.add(styles.dragOver);
  };
  const onDragLeave = () => dragRef.current?.classList.remove(styles.dragOver);
  const onDrop = (e) => {
    e.preventDefault();
    dragRef.current?.classList.remove(styles.dragOver);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const reset = () => {
    setStage("idle");
    setShowCamera(false);
    setPreview(null);
    setGeneratedUrl(null);
    setProgress(null);
    setError(null);
    onChange(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className={styles.wrapper}>
      {/* ── Idle ── */}
      {stage === "idle" && (
        <>
          {showCamera ? (
            <CameraCapture
              onCapture={(file) => { setShowCamera(false); handleFile(file); }}
              onCancel={() => setShowCamera(false)}
            />
          ) : (
            <>
              <button className={styles.cameraBtn} onClick={() => setShowCamera(true)}>
                <span>📷</span>
                <span>Take a photo with your camera</span>
              </button>
              <div className={styles.divider}><span>or</span></div>
              <div
                ref={dragRef}
                className={styles.dropZone}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <span className={styles.dropIcon}>◈</span>
                <p>Drop your selfie here, or <strong>click to browse</strong></p>
                <p className="text-xs text-muted">JPEG, PNG, WebP · max 20 MB</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
                />
              </div>
              {quota && quota.limit > 0 && (
                <p className={styles.quotaBadge}>
                  {quota.limit - quota.used > 0
                    ? `${quota.limit - quota.used} of ${quota.limit} image generations remaining on this device`
                    : "⚠ You have used all image generations allowed on this device"}
                </p>
              )}
              <p className={styles.privacyNote}>
                🔒 The generated image is displayed only to you. It is not stored in any database and is automatically removed from our server as soon as it has loaded in your browser.
              </p>
            </>
          )}
        </>
      )}

      {/* ── Generating ── */}
      {stage === "generating" && (
        <div className={styles.processingCard}>
          {preview && <img src={preview} alt="Uploaded" className={styles.thumbSmall} />}
          <div className={styles.processingInfo}>
            <div className={styles.progressLabel}>{progress?.label}</div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progress?.pct ?? 0}%` }} />
            </div>
            {progress?.retry && (
              <p className={styles.retryNote}>
                ⏳ Gemini servers are busy right now — your request will retry automatically. Please keep this page open.
              </p>
            )}
            {!progress?.retry && (
              <p className="text-xs text-muted" style={{ marginTop: 6 }}>
                Gemini is generating your image…
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {stage === "done" && generatedUrl && (
        <div className={styles.resultCard}>
          <div className={styles.resultHeader}>
            <span className={styles.badge}>✓ AI Image generated</span>
            <button className={styles.resetBtn} onClick={reset}>
              Upload different image
            </button>
          </div>

          <img src={generatedUrl} alt="Generated" className={styles.generatedImg} />

          <p className={styles.privacyNote} style={{ margin: "0", borderTop: "1px solid var(--border)", borderRadius: "0 0 var(--radius-lg) var(--radius-lg)", padding: "10px 16px" }}>
            🔒 This image is displayed only to you and has already been removed from our server.
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className={styles.errorBox}>
          <strong>⚠ {error}</strong>
          <button className="btn btn-ghost text-sm" onClick={reset}>Try again</button>
        </div>
      )}
    </div>
  );
}