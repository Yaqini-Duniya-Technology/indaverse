"use client";

import { useEffect, useState } from "react";
import { apiDownload, apiFetch } from "@/lib/api";
import { deliveryError, projectPath } from "@/lib/creatorDelivery";
import type { ProjectImage } from "@/lib/images";

export default function ImageDerivativeEditor({ asset, onSaved }: {asset: ProjectImage; onSaved: () => void}) {
  const [label, setLabel] = useState((asset.label + " — edited").slice(0, 150));
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState({x: "0", y: "0", crop_width: "", crop_height: "", max_edge: ""});
  const [preview, setPreview] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function apply(save: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    setPreview("");
    const body = {
      label, rotation, x: Number(crop.x), y: Number(crop.y),
      crop_width: crop.crop_width ? Number(crop.crop_width) : null,
      crop_height: crop.crop_height ? Number(crop.crop_height) : null,
      max_edge: crop.max_edge ? Number(crop.max_edge) : null,
    };
    const url = projectPath(asset.project_id) + "/images/" + asset.id;
    try {
      if (save) {
        await apiFetch<ProjectImage>(url + "/derivatives", {method: "POST", body});
        setNotice("Edited copy saved to the image library.");
        onSaved();
      } else {
        const blob = await apiDownload(url + "/derivative-preview", new Blob([JSON.stringify(body)]),
          "application/json", "image/webp", AbortSignal.timeout(20000));
        setPreview(URL.createObjectURL(blob));
      }
    } catch (error) {
      setError(deliveryError(error));
    } finally {
      setBusy(false);
    }
  }

  return <details className="my-3">
    <summary>Crop, rotate or resize</summary>
    <fieldset className="mt-2 space-y-2" disabled={busy}>
      <p className="text-sm">Crop uses original pixels, then rotation and resizing. Saving creates a separate library image.</p>
      <label className="block">Copy label <input className="w-full border px-2 py-1" value={label} maxLength={150} onChange={event => setLabel(event.target.value)} /></label>
      {([
        ["x", "Crop left", 0, asset.width - 1], ["y", "Crop top", 0, asset.height - 1],
        ["crop_width", "Crop width (optional)", 1, asset.width], ["crop_height", "Crop height (optional)", 1, asset.height],
        ["max_edge", "Longest edge limit (optional)", 1, 4096],
      ] as const).map(([key, title, min, max]) => <label className="block" key={key}>{title}
        <input className="w-full border px-2 py-1" type="number" min={min} max={max} value={crop[key]}
          onChange={event => {setPreview(""); setCrop({...crop, [key]: event.target.value});}} />
      </label>)}
      <label className="block">Rotate clockwise <select value={rotation} onChange={event => {setPreview(""); setRotation(Number(event.target.value));}}>
        {[0, 90, 180, 270].map(value => <option key={value} value={value}>{value}°</option>)}
      </select></label>
      <button className="rounded border px-2 py-1" type="button" disabled={!label.trim()} onClick={() => void apply(false)}>Preview edit</button>{" "}
      <button className="rounded border px-2 py-1" type="button" disabled={!label.trim()} onClick={() => void apply(true)}>Save as new image</button>
    </fieldset>
    {preview && (
      // eslint-disable-next-line @next/next/no-img-element -- The preview is a private, short-lived object URL.
      <img src={preview} alt="Edited image preview" className="mt-2 max-h-40 object-contain" />
    )}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </details>;
}
