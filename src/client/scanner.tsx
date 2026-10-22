import { useEffect, useRef, useState } from "react";
import { Sheet } from "./sales/ui";

type Detector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => Detector;
  }
}
export const cameraScanSupported = () =>
  typeof window !== "undefined" && !!window.BarcodeDetector;

/** Short beep and buzz so a scan is noticed without looking at the screen. */
export function scanFeedback(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 40 : [60, 40, 60]);
    const ctx = new AudioContext();
    const tone = ctx.createOscillator();
    const gain = ctx.createGain();
    tone.frequency.value = ok ? 1400 : 300;
    gain.gain.value = 0.08;
    tone.connect(gain).connect(ctx.destination);
    tone.start();
    tone.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
    tone.onended = () => void ctx.close();
  } catch {
    // Sound and vibration are extras.
  }
}

/**
 * Camera scanning via the BarcodeDetector API (Chrome on Android, desktop
 * Chrome/Edge). USB and Bluetooth scanners type into a search box instead.
 * `continuous` keeps the camera open for counting; the same code is ignored
 * for a moment so one scan counts once.
 */
export function Scanner({
  onDetect,
  onClose,
  continuous = false,
  title = "Scan barcode",
  status,
}: {
  /** Return false when the code matched nothing, for error feedback. */
  onDetect: (code: string) => boolean | void;
  onClose: () => void;
  continuous?: boolean;
  title?: string;
  /** Shown under the camera, e.g. the last product counted. */
  status?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("Point the camera at a barcode.");
  const [manual, setManual] = useState("");
  const supported = cameraScanSupported();
  const detected = useRef(onDetect);
  useEffect(() => {
    detected.current = onDetect;
  });
  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let last = { code: "", at: 0 };
    const detector = new window.BarcodeDetector!({
      formats: [
        "ean_13",
        "ean_8",
        "code_128",
        "code_39",
        "upc_a",
        "upc_e",
        "qr_code",
        "itf",
      ],
    });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        video.current!.srcObject = s;
        await video.current!.play();
        const loop = async () => {
          if (stopped) return;
          try {
            const code = (await detector.detect(video.current!))[0]?.rawValue;
            const now = Date.now();
            if (code && (code !== last.code || now - last.at > 1500)) {
              last = { code, at: now };
              const ok = detected.current(code) !== false;
              scanFeedback(ok);
              if (!continuous) return;
              setMessage(ok ? `Read ${code}` : `${code}: no matching product`);
            }
          } catch {
            /* Frame not ready yet. */
          }
          frame = window.setTimeout(loop, 150);
        };
        void loop();
      })
      .catch(() =>
        setMessage("Camera access was blocked. Type the code instead."),
      );
    return () => {
      stopped = true;
      clearTimeout(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [supported, continuous]);
  return (
    <Sheet title={title} onClose={onClose}>
      {supported ? (
        <div className="scanner">
          <video ref={video} muted playsInline aria-label="Camera preview" />
          <span className="scanner-frame" aria-hidden="true" />
          <p role="status">{status ?? message}</p>
        </div>
      ) : (
        <p className="muted sheet-section">
          This browser cannot scan with the camera (use Chrome on Android, or
          Chrome or Edge on a computer). A USB or Bluetooth scanner works
          everywhere, or type the code below.
        </p>
      )}
      <form
        className="sheet-section inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!manual.trim()) return;
          scanFeedback(onDetect(manual.trim()) !== false);
          setManual("");
        }}
      >
        <label>
          Product code or barcode
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>
        <button className="btn btn-primary">
          {continuous ? "Add" : "Find"}
        </button>
      </form>
      {continuous && (
        <div className="sheet-actions">
          <button className="btn btn-primary grow" onClick={onClose}>
            Done scanning
          </button>
        </div>
      )}
    </Sheet>
  );
}
