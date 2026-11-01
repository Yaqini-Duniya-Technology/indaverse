"use client";
import { useState } from "react";
import { IMAGE_API_URL } from "@/lib/images";
export default function ImageDownload({ projectId, imageId }: { projectId: number; imageId: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <span className="mt-3 block"><button type="button" disabled={busy} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:opacity-40" onClick={async () => {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${IMAGE_API_URL}/api/v1/projects/${projectId}/images/${imageId}/content`, { credentials: "include" });
      if (!response.ok) throw new Error("Image download unavailable. Check your session and retry.");
      const blob = await response.blob();
      const suffix = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `indaverse-image-${imageId}.${suffix}`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Image downloaded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Download failed."); }
    finally { setBusy(false); }
  }}>{busy ? "Downloading…" : "Download image"}</button><small role="status" className="mt-1 block">{message}</small></span>;
}
