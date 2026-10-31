"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  getImageRequests, saveImageRequest,
  type ImagePurpose, type ImageRequest, type ImageRequestPage,
} from "@/lib/imageGeneration";

const button = "rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40";
const input = "mt-2 w-full rounded-lg border border-zinc-700 bg-black p-3";

export default function ImageGenerationRequests({
  projectId,
}: {
  projectId: number;
}) {
  const id = useId();
  const [label, setLabel] = useState("");
  const [purpose, setPurpose] = useState<ImagePurpose>("character");
  const [prompt, setPrompt] = useState("");
  const [page, setPage] = useState<ImageRequestPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setHistoryError("");
    setPage(null);
    void getImageRequests(projectId, offset)
      .then((result) => { if (active) setPage(result); })
      .catch((err: unknown) => {
        if (active) setHistoryError(
          err instanceof Error ? err.message : "Unable to load image requests.",
        );
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, offset, refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !label.trim() || !prompt.trim()) return;
    lock.current = true;
    setSaving(true);
    setFormError("");
    setNotice("");
    try {
      await saveImageRequest(projectId, {
        label: label.trim(), purpose, prompt: prompt.trim(),
      });
      setNotice(
        "Request saved. Generation is unavailable until a provider is connected. No image was generated.",
      );
      setOffset(0);
      setRefresh((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save request.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  function reuse(request: ImageRequest) {
    if (saving) return;
    if ((label.trim() || prompt.trim()) && !window.confirm(
      "Replace the current prompt form with this saved request?",
    )) return;
    setLabel(request.label);
    setPurpose(request.purpose);
    setPrompt(request.prompt);
    setFormError("");
    setNotice("Saved request copied into the form. Edit it before saving another request.");
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }

  return (
    <div className="my-6 rounded-xl border border-zinc-800 bg-black/30 p-4">
      <h3 className="text-lg font-semibold">Plan an AI image</h3>
      <p className="mt-2 text-sm text-zinc-400">
        Describe your character, scene, location, or cover. Save the prompt now
        and return to it when image generation is connected.
      </p>
      <p className="mt-2 text-sm text-amber-300">
        Provider not connected. Saving a request does not generate an image or make a paid call.
      </p>

      {formError && <p role="alert" className="mt-4 text-red-300">{formError}</p>}
      {notice && <p role="status" className="mt-4 text-emerald-300">{notice}</p>}

      <form ref={formRef} onSubmit={(event) => void submit(event)} className="mt-4">
        <fieldset disabled={saving}>
          <legend className="sr-only">Image request</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-label`}>Image name</label>
              <input id={`${id}-label`} className={input} required maxLength={150}
                value={label} onChange={(event) => setLabel(event.target.value)}
                placeholder="Amina at dawn" />
            </div>
            <div>
              <label htmlFor={`${id}-purpose`}>Purpose</label>
              <select id={`${id}-purpose`} className={input} value={purpose}
                onChange={(event) => setPurpose(event.target.value as ImagePurpose)}>
                <option value="character">Character</option>
                <option value="scene">Scene</option>
                <option value="location">Location</option>
                <option value="reference">Reference</option>
                <option value="cover">Project cover</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor={`${id}-prompt`}>Image description</label>
            <textarea id={`${id}-prompt`} className={input} required rows={5}
              maxLength={5000} value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe appearance, setting, action, lighting, mood, and visual style..." />
            <p className="mt-1 text-xs text-zinc-500">{prompt.length} / 5000 characters</p>
          </div>
          <button className={`${button} mt-4`} disabled={!label.trim() || !prompt.trim()}>
            {saving ? "Saving request..." : "Save image request"}
          </button>
        </fieldset>
      </form>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Image request history</h3>
        <button type="button" className={button} disabled={loading || saving}
          onClick={() => setRefresh((value) => value + 1)}>Refresh history</button>
      </div>
      {historyError && <p role="alert" className="mt-3 text-red-300">{historyError}</p>}
      {loading && <p role="status" className="mt-3 text-sm text-zinc-400">Loading requests...</p>}
      {!loading && page?.items.length === 0 && (
        <p className="mt-3 text-sm text-zinc-400">No saved image requests on this page.</p>
      )}
      <div className="mt-4 space-y-3">
        {page?.items.map((request) => (
          <article key={request.id} className="rounded-xl border border-zinc-800 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h4 className="break-words font-medium">{request.label}</h4>
              <span className="text-xs capitalize text-amber-300">{request.status}</span>
            </div>
            <p className="mt-2 text-xs capitalize text-zinc-500">
              {request.purpose} / Request #{request.id} / {new Date(request.created_at).toLocaleString()}
            </p>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-300">{request.prompt}</p>
            {request.error_message && (
              <p className="mt-3 text-sm text-zinc-400">{request.error_message}</p>
            )}
            <button type="button" className={`${button} mt-3`} disabled={saving}
              onClick={() => reuse(request)}>Reuse prompt</button>
          </article>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" className={button} disabled={loading || saving || offset === 0}
          onClick={() => setOffset((value) => Math.max(0, value - 10))}>Previous</button>
        <span className="text-sm text-zinc-400">Page {offset / 10 + 1}</span>
        <button type="button" className={button} disabled={loading || saving || !page?.has_more}
          onClick={() => setOffset((value) => value + 10)}>Next</button>
      </div>
    </div>
  );
}
