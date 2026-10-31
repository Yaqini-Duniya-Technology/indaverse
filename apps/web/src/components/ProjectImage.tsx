"use client";

import { useEffect, useState } from "react";
import { IMAGE_API_URL } from "@/lib/images";

export default function ProjectImage({
  projectId, imageId, alt, className = "",
}: {
  projectId: number; imageId: number; alt: string; className?: string;
}) {
  const [source, setSource] = useState<{ key: string; url: string } | null>(null);
  const [failed, setFailed] = useState("");
  const key = `${projectId}:${imageId}`;

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const controller = new AbortController();
    void fetch(`${IMAGE_API_URL}/api/v1/projects/${projectId}/images/${imageId}/content`, {
      credentials: "include", signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Image unavailable");
      const blob = await response.blob();
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSource({ key, url: objectUrl });
    }).catch(() => {
      if (active) setFailed(key);
    });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, imageId, key]);

  if (source?.key !== key) {
    return <div className={`${className} flex items-center justify-center bg-zinc-950 text-sm text-zinc-500`}
      role="status">{failed === key ? "Image unavailable" : "Loading image..."}</div>;
  }
  // Protected images are fetched with credentials and rendered from local blob URLs.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={source.url} alt={alt} className={className} />;
}
