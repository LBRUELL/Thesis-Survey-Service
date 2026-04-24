import { useState, useRef, useCallback, useEffect } from "react";
import { getDeviceId } from "../utils/deviceId.js";
import styles from "./ImageImageQuestion.module.css";

export default function ImageImageQuestion({ imagePrompt, value, onChange }) {
  const [stage, setStage] = useState(
    value?.generatedUrl ? "done" : "idle"
  );
  const [preview, setPreview] = useState(value?.imagePath || null);
  const [generatedUrl, setGeneratedUrl] = useState(value?.generatedUrl || null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  const [quota, setQuota] = useState(null);

  const fileRef = useRef();
  const dragRef = useRef(null);

  useEffect(() => {
    fetch("/api/usage", { headers: { "x-device-id": getDeviceId() } })
      .then((r) => r.json())
      .then((d) => setQuota({ used: d.images, limit: d.limits.images }))
      .catch(() => {});
  }, []);

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
    formData.append(
      "prompt",
      imagePrompt || "Generate a high-quality styled image based on this photo."
    );

    try {
      setProgress({ label: "Sending to Gemini…", pct: 50 });
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "x-device-id": getDeviceId() },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Image generation failed");

      setProgress({ label: "Loading generated image…", pct: 85 });

      // Fetch the image into a blob URL so the server copy can be deleted
      const blobRes = await fetch(data.imageUrl);
      const blob = await blobRes.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Ask server to delete the temporary file
      fetch("/api/image-cleanup", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePath: data.imageUrl }),
      }).catch(() => {});

      setGeneratedUrl(blobUrl);
      setStage("done");
      setProgress(null);
      setQuota((q) => q ? { ...q, used: q.used + 1 } : q);
      onChange({ imagePath: localUrl, generatedUrl: blobUrl });
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

      {/* ── Generating ── */}
      {stage === "generating" && (
        <div className={styles.processingCard}>
          {preview && <img src={preview} alt="Uploaded" className={styles.thumbSmall} />}
          <div className={styles.processingInfo}>
            <div className={styles.progressLabel}>{progress?.label}</div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progress?.pct ?? 0}%` }} />
            </div>
            <p className="text-xs text-muted" style={{ marginTop: 6 }}>
              Gemini is generating your image…
            </p>
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

          <div className={styles.compareRow}>
            <div className={styles.compareCol}>
              <span className={styles.compareLabel}>Your photo</span>
              <img src={preview} alt="Original" className={styles.compareImg} />
            </div>
            <div className={styles.arrow}>→</div>
            <div className={styles.compareCol}>
              <span className={styles.compareLabel}>Generated image</span>
              <img src={generatedUrl} alt="Generated" className={styles.compareImg} />
            </div>
          </div>

          <p className={styles.privacyNote} style={{ margin: "0 0 0 0", borderTop: "1px solid var(--border)", borderRadius: "0 0 var(--radius-lg) var(--radius-lg)", padding: "10px 16px" }}>
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
