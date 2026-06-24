"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Renders `value` as a QR code data-URL image. */
export function QrImage({
  value,
  size = 220,
  className = "",
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div
      className={`grid place-items-center rounded-2xl bg-white p-3 ${className}`}
      style={{ width: size + 24, height: size + 24 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="QR code" width={size} height={size} />
      ) : (
        <div className="h-full w-full animate-pulse rounded-lg bg-zinc-200" />
      )}
    </div>
  );
}
