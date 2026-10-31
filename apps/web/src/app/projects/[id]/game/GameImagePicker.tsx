"use client";

import { useEffect, useState } from "react";
import ProjectImage from "@/components/ProjectImage";
import { listImages, type ProjectImage as ImageRecord } from "@/lib/images";
import styles from "./game.module.css";

export default function GameImagePicker({
  projectId, imageId, onChange, label,
}: {
  projectId: number;
  imageId: number | null;
  onChange: (id: number | null) => void;
  label: string;
}) {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void listImages(projectId, offset).then((page) => {
      if (!active) return;
      setImages((current) => {
        const combined = offset === 0 ? page.items : [...current, ...page.items];
        return Array.from(new Map(combined.map((item) => [item.id, item])).values());
      });
      setHasMore(page.has_more);
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : "Unable to load images.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projectId, offset, retry]);

  return (
    <div className="mt-5">
      <label>{label}
        <select value={imageId ?? ""} onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : null)}>
          <option value="">No image linked</option>
          {imageId !== null && !images.some((item) => item.id === imageId) && (
            <option value={imageId}>Current image #{imageId} (not in loaded list)</option>
          )}
          {images.map((image) => <option key={image.id} value={image.id}>{image.label} / {image.category}</option>)}
        </select>
      </label>
      {imageId !== null && <ProjectImage key={`${projectId}:${imageId}`}
        projectId={projectId} imageId={imageId} alt={label}
        className="mt-3 h-48 w-full rounded-xl object-contain" />}
      {loading && <p role="status">Loading project images...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && images.length === 0 && (
        <p>Upload reference images from your project home, then refresh this list.</p>
      )}
      <div className={styles.actions}>
        <button className={styles.secondary} disabled={loading} onClick={() => {
          setOffset(0);
          setRetry((value) => value + 1);
        }}>Refresh images</button>
        {error ? (
          <button className={styles.secondary} disabled={loading}
            onClick={() => setRetry((value) => value + 1)}>Retry image list</button>
        ) : hasMore && (
          <button className={styles.secondary} disabled={loading}
            onClick={() => setOffset((value) => value + 20)}>Load more images</button>
        )}
      </div>
    </div>
  );
}
