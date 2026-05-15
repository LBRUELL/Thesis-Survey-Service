import { useEffect, useRef, useState } from "react";
import styles from "./CameraCapture.module.css";

export default function CameraCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not supported in this browser. Please upload a file instead.");
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
              ? "Camera access was denied. Please allow camera access in your browser settings and try again."
              : "Could not start the camera. Please try uploading a photo instead."
          );
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => onCapture(new File([blob], "selfie.jpg", { type: "image/jpeg" })),
      "image/jpeg",
      0.92
    );
  };

  if (error) {
    return (
      <div className={styles.error}>
        <p>{error}</p>
        <button className="btn btn-outline" onClick={onCancel}>Go back</button>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.viewfinder}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={styles.liveVideo}
          onCanPlay={() => setReady(true)}
        />
        {!ready && (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Starting camera…</span>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div className={styles.controls}>
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button
          className={`btn btn-primary ${styles.snapBtn}`}
          onClick={capture}
          disabled={!ready}
        >
          📷 Take photo
        </button>
      </div>
    </div>
  );
}
