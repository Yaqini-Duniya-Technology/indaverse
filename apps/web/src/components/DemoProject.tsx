"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
export default function DemoProject() {
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section className="my-8 rounded-2xl border border-amber-200/40 bg-slate-900 p-6" aria-labelledby="demo-title">
    <p className="text-sm font-semibold text-amber-200">GUIDED EXAMPLE</p><h2 id="demo-title" className="mt-2 text-2xl font-bold">Explore Legends of Zamara</h2>
    <p className="my-3 leading-7 text-slate-200">Create a private copy with a creative brief, a 3D design blueprint and a saved three-gem courtyard scene. Follow the brief → design → scene → play workflow.</p>
    <p className="my-3 text-sm text-slate-300">The scene uses simple prototype shapes. Dialogue, quests, generated assets and full game export are future work.</p>
    <button type="button" disabled={busy} className="rounded-xl bg-amber-200 px-5 py-3 font-bold text-slate-950 disabled:opacity-50" onClick={async () => {
      if (lock.current || !window.confirm("Create a new private demo project? Existing projects will not be changed.")) return;
      lock.current = true; setBusy(true); setError("");
      try { const project = await apiFetch<{id: number}>("/api/v1/projects/demo/zamara", {method: "POST"}); router.push(`/projects/${project.id}/game`); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create the demo."); lock.current = false; setBusy(false); }
    }}>{busy ? "Creating private demo…" : "Create private Zamara demo"}</button>
    {error && <p role="alert" className="mt-3 text-red-200">{error}</p>}
  </section>;
}
