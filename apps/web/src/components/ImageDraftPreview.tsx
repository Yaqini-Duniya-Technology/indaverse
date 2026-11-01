"use client";
import { useEffect, useRef } from "react";
export default function ImageDraftPreview({ file }: { file: File | null }) {
  const image = useRef<HTMLImageElement>(null);
  const supported = !!file && ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 10 * 1024 * 1024;
  useEffect(() => {
    if (!file || !supported || !image.current) return;
    const element = image.current;
    const url = URL.createObjectURL(file);
    element.src = url;
    return () => { element.removeAttribute("src"); URL.revokeObjectURL(url); };
  }, [file, supported]);
  if (!file) return null;
  if (!supported) return <p className="mt-3 text-sm">Preview unavailable. Choose a JPEG, PNG or WebP no larger than 10 MB.</p>;
  return <figure className="my-4 rounded-xl border border-zinc-700 p-4">
    {/* Local selected-file preview, not an uploaded/public image. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={image} alt={`Selected file: ${file.name}`} className="max-h-48 max-w-full object-contain" />
    <figcaption className="mt-2 text-xs text-zinc-400">{file.name} / {(file.size / 1024 / 1024).toFixed(2)} MB / Not uploaded yet</figcaption>
  </figure>;
}
