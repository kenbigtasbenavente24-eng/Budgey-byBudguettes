import { useEffect, useRef, useState } from "react";
import "./Camera.css";
import icons from "./icons";

export default function Camera({ onCapture, onOpenGallery, latestPhoto }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [facing, setFacing] = useState("environment");
  const [cameraError, setCameraError] = useState(false);

  // Photo picked from the upload button
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCapture?.(reader.result);
    reader.readAsDataURL(file);
    e.target.value = ""; // lets you pick the same file again later
  };

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facing } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError(false);
      } catch (err) {
        console.error("Camera error:", err);
        setCameraError(true);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  const flipCamera = () =>
    setFacing((f) => (f === "environment" ? "user" : "environment"));

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || cameraError || !video.videoWidth) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Crop to 3:4 so the photo matches the viewfinder box
    const ratio = 3 / 4;
    let sw = vw;
    let sh = vh;
    if (vw / vh > ratio) sw = vh * ratio;
    else sh = vw / ratio;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");

    // The front camera preview is mirrored, so mirror the photo too
    if (facing === "user") {
      ctx.translate(sw, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

    onCapture?.(canvas.toDataURL("image/jpeg", 0.9));
  };

  return (
    <main className="camera">
      <header className="camera__header">
        <h1 className="camera__logo">budgey</h1>

        <button
          className="camera__upload"
          onClick={() => fileRef.current?.click()}
          aria-label="Upload a photo"
        >
          <img src={icons.upload} width="32" height="32" alt="" />
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleUpload}
        />
      </header>

      <section className="viewfinder" aria-label="Camera preview">
        {cameraError ? (
          <p className="viewfinder__error">
            Camera unavailable. Allow camera access in your browser, then reload.
          </p>
        ) : (
          <video
            ref={videoRef}
            className={`viewfinder__video ${facing === "user" ? "is-mirrored" : ""}`}
            autoPlay
            playsInline
            muted
          />
        )}

        <p className="viewfinder__hint">One item at a time</p>
      </section>

      <footer className="controls">
        <button
          className="controls__gallery"
          aria-label="Open gallery"
          onClick={onOpenGallery}
        >
          {latestPhoto && <img src={latestPhoto} alt="Latest photo" />}
        </button>

        <button
          className="controls__shutter"
          onClick={takePhoto}
          aria-label="Take photo"
        >
          <span />
        </button>

        <button
          className="controls__flip"
          onClick={flipCamera}
          aria-label="Switch camera"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round"
               strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11a8 8 0 0 0-14.3-4.5L4 8" />
            <path d="M4 3v5h5" />
            <path d="M4 13a8 8 0 0 0 14.3 4.5L20 16" />
            <path d="M20 21v-5h-5" />
          </svg>
        </button>
      </footer>
    </main>
  );
}