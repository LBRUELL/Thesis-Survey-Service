import { useState, useRef, useCallback, useEffect } from "react";
import { getDeviceId } from "../utils/deviceId.js";
import { apiUrl } from "../utils/api.js";
import CameraCapture from "./CameraCapture.jsx";
import styles from "./ImageVideoQuestion.module.css";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60; // 3 minutes max
const MOCK_VIDEO_URL = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";


export default function ImageVideoQuestion({ surveyId, videoPrompt, value, onChange, onVideoComplete }) {
  const [stage, setStage] = useState(
      value?.videoUrl ? "done" : value?.imagePath ? "uploaded" : "idle"
  );
  const [preview, setPreview] = useState(value?.imagePath || null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [videoUrl, setVideoUrl] = useState(value?.videoUrl || null);
  const [watchPct, setWatchPct] = useState(0);
  const [videoEnded, setVideoEnded] = useState(false);
  const [quota, setQuota] = useState(null);
  const [showCamera, setShowCamera] = useState(false);

  const fileRef = useRef();
  const videoRef = useRef();
  const pollCountRef = useRef(0);
  const pollTimerRef = useRef(null);
  const dragRef = useRef(null);
  const maxWatchedRef = useRef(0);

  useEffect(() => {
    const url = surveyId ? apiUrl(`/api/usage?surveyId=${surveyId}`) : apiUrl("/api/usage");
    fetch(url, { headers: { "x-device-id": getDeviceId() } })
        .then((r) => r.json())
        .then((d) => setQuota({ used: d.videos, limit: d.limits.videos }))
        .catch(() => {});
  }, [surveyId]);

  // ── Video playback tracking ──────────────────────────────────────────────
  const handleTimeUpdate = useCallback(() => {
    const el = videoRef.current;
    if (!el || !el.duration) return;
    if (el.currentTime > maxWatchedRef.current) {
      maxWatchedRef.current = el.currentTime;
    }
    const pct = Math.min((maxWatchedRef.current / el.duration) * 100, 100);
    setWatchPct(pct);
  }, []);

  const handleEnded = useCallback(() => {
    setWatchPct(100);
    setVideoEnded(true);
    onVideoComplete?.();
  }, [onVideoComplete]);

  const handleSeeked = useCallback(() => {
    const el = videoRef.current;
    if (!el || !el.duration) return;
    if (maxWatchedRef.current / el.duration >= 0.98) {
      setVideoEnded(true);
      onVideoComplete?.();
    }
  }, [onVideoComplete]);

  // ── File handling ────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    const isDevMode = new URLSearchParams(window.location.search).get('dev') === 'true';
    if (isDevMode) {
      const localUrl = URL.createObjectURL(file);
      setPreview(localUrl);
      setStage("generating");
      setProgress({ label: "Fetching test video...", pct: 80 });

      try {
        const res = await fetch(apiUrl("/api/test-video-result"));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Test fetch failed");

        const bytes = Uint8Array.from(atob(data.videoBase64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "video/mp4" });
        const blobUrl = URL.createObjectURL(blob);

        setVideoUrl(blobUrl);
        setStage("done");
        setProgress(null);
        onChange({ imagePath: localUrl, videoUrl: blobUrl });
      } catch (err) {
        setError(err.message);
        setStage("idle");
        setProgress(null);
      }
      return;
    }
    
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload an image file (JPEG, PNG, WebP, etc.)");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Image must be under 20 MB.");
      return;
    }

    setError(null);
    setStage("uploading");
    setProgress({ label: "Uploading image…", pct: 20 });

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    const formData = new FormData();
    formData.append("image", file);
    formData.append("prompt", videoPrompt || "Animate this image into a short cinematic scene.");
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
          setProgress({ label: "Sending to Gemini VEO…", pct: 40 });
        }

        res = await fetch(apiUrl("/api/generate-video"), {
          method: "POST",
          headers: { "x-device-id": getDeviceId() },
          body: formData,
        });
        data = await res.json();

        if (res.ok || (res.status !== 503 && res.status !== 429)) break;

        if (attempt === MAX_RETRIES) {
          throw new Error("The video generation service is currently overloaded. Please wait a minute and try uploading again.");
        }
      }

      if (!res.ok) throw new Error(data.details || data.error || "Video generation failed");

      setStage("generating");
      setProgress({ label: "Generating video with Gemini VEO…", pct: 55 });
      onChange({ imagePath: localUrl, operationName: data.operationName });
      setQuota((q) => q ? { ...q, used: q.used + 1 } : q);

      pollCountRef.current = 0;
      pollVideo(data.operationName, localUrl);
    } catch (err) {
      setError(err.message);
      setStage("idle");
      setProgress(null);
    }
  }, [videoPrompt, onChange]);

  const pollVideo = useCallback((operationName, currentPreview) => {
    clearTimeout(pollTimerRef.current);
    pollTimerRef.current = setTimeout(async () => {
      pollCountRef.current++;
      const pct = Math.min(55 + pollCountRef.current * 1.5, 90);
      setProgress({ label: "AI is creating your video…", pct });

      try {
        const res = await fetch(
            `${apiUrl("/api/video-status")}?operationName=${encodeURIComponent(operationName)}`
        );
        const data = await res.json();

        if (data.status === "complete") {
          clearTimeout(pollTimerRef.current);
          setProgress({ label: "Downloading video...", pct: 95 });

          const resultRes = await fetch(
              `${apiUrl("/api/get-video-result")}?operationName=${encodeURIComponent(operationName)}`
          );
          const resultData = await resultRes.json();

          if (!resultRes.ok) {
            throw new Error(resultData.error || "Failed to get final video.");
          }

          // Convert base64 → Blob → blob URL (supports seeking, no CORS, no disk)
          const byteArray = Uint8Array.from(atob(resultData.videoBase64), c => c.charCodeAt(0));
          const blob = new Blob([byteArray], { type: "video/mp4" });
          const blobUrl = URL.createObjectURL(blob);

          setVideoUrl(blobUrl);
          setStage("done");
          setProgress(null);
          setWatchPct(0);
          setVideoEnded(false);
          maxWatchedRef.current = 0;
          onChange({ imagePath: currentPreview, videoUrl: blobUrl });

        } else if (data.status === "error") {
          throw new Error(data.error || "Video generation failed");
        } else if (pollCountRef.current >= MAX_POLLS) {
          throw new Error("Video generation timed out. Please try again.");
        } else {
          pollVideo(operationName, currentPreview);
        }
      } catch (err) {
        console.error("Polling error:", err);
        setError(err.message);
        setStage("idle");
        setProgress(null);
      }
    }, POLL_INTERVAL_MS);
  }, [onChange]);

  // ── Drag-and-drop ────────────────────────────────────────────────────────
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
    clearTimeout(pollTimerRef.current);
    if (videoUrl && videoUrl.startsWith("blob:")) {
      URL.revokeObjectURL(videoUrl);
    }
    setStage("idle");
    setShowCamera(false);
    setPreview(null);
    setVideoUrl(null);
    setProgress(null);
    setError(null);
    setWatchPct(0);
    setVideoEnded(false);
    maxWatchedRef.current = 0;
    onChange(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
      <div className={styles.wrapper}>
        {/* ── Idle / drop zone ── */}
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
                      <span className={styles.dropIcon}>⬡</span>
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
                              ? `${quota.limit - quota.used} of ${quota.limit} video generations remaining on this device`
                              : "⚠ You have used all video generations allowed on this device"}
                        </p>
                    )}
                    <p className={styles.privacyNote}>
                      🔒 The generated video is displayed only to you. It is not stored in any database and is automatically removed from our server as soon as it has loaded in your browser.
                    </p>
                  </>
              )}
            </>
        )}

        {/* ── Uploading / generating ── */}
        {(stage === "uploading" || stage === "generating") && (
            <div className={styles.processingCard}>
              {preview && (
                  <img src={preview} alt="Uploaded" className={styles.thumbSmall} />
              )}
              <div className={styles.processingInfo}>
                <div className={styles.progressLabel}>{progress?.label}</div>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progress?.pct ?? 0}%` }} />
                </div>
                {progress?.retry ? (
                    <p className={styles.retryNote}>
                      ⏳ Gemini VEO servers are busy right now — your request will retry automatically. Please keep this page open.
                    </p>
                ) : (
                    <p className="text-xs text-muted" style={{ marginTop: 6 }}>
                      Gemini VEO is transforming your image using the configured prompt.
                    </p>
                )}
              </div>
            </div>
        )}

        {/* ── Done — show video ── */}
        {stage === "done" && videoUrl && (
            <div className={styles.videoCard}>
              <div className={styles.videoHeader}>
                <span className={styles.badge}>✓ AI Video generated</span>
                <button className={styles.resetBtn} onClick={reset}>
                  Upload different image
                </button>
              </div>

              <video
                  key={videoUrl}
                  ref={videoRef}
                  width="100%"
                  controls
                  autoPlay
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleEnded}
                  onSeeked={handleSeeked}
              >
                <source src={videoUrl} type="video/mp4" />
                Your browser does not support the video tag.
              </video>

              {/* Watch progress bar */}
              <div className={styles.watchBar}>
                <div className={styles.watchBarTrack}>
                  <div className={styles.watchBarFill} style={{ width: `${watchPct}%` }} />
                </div>
                <span className={styles.watchBarLabel}>
              {videoEnded
                  ? "✓ Watched"
                  : watchPct > 0
                      ? `${Math.round(watchPct)}% watched`
                      : "Play the full video to continue"}
            </span>
              </div>

              {/* Must-watch notice — shown until complete */}
              {!videoEnded && (
                  <div className={styles.mustWatchNotice}>
                    <span>⚠</span>
                    <span>You must watch the entire video before you can continue to the next page.</span>
                  </div>
              )}

              <p className={styles.privacyNote} style={{ margin: "0 16px 14px" }}>
                🔒 This video is displayed only to you and has already been removed from our server.
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