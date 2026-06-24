"use client";

import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Modal } from "./Modal";
import { parseScanned, type PayRequest } from "@/lib/links";

/**
 * Camera QR scanner. On a successful decode of an address / pay link, calls
 * `onResult` with the parsed request and closes.
 */
export function ScanModal({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (req: PayRequest) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !videoRef.current) return;
    let scanner: QrScanner | null = null;
    setError(null);

    scanner = new QrScanner(
      videoRef.current,
      (res) => {
        const req = parseScanned(res.data);
        if (req) {
          scanner?.stop();
          onResult(req);
          onClose();
        }
      },
      { highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true }
    );

    scanner
      .start()
      .catch(() =>
        setError("Couldn't access the camera. Check browser permissions.")
      );

    return () => {
      scanner?.stop();
      scanner?.destroy();
    };
  }, [open, onClose, onResult]);

  return (
    <Modal open={open} onClose={onClose} title="Scan to pay">
      <div className="flex flex-col gap-3">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" />
        </div>
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <p className="text-center text-sm text-zinc-400">
            Point your camera at an address or Universal Pay request QR.
          </p>
        )}
      </div>
    </Modal>
  );
}
