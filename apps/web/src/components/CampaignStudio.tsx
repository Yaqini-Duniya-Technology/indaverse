"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { deliveryError, downloadArtifact, projectPath } from "@/lib/creatorDelivery";
import { listImages } from "@/lib/images";
import { getProjects, type Project } from "@/lib/projects";

type Asset = {kind: "image" | "video"; project_id: number; id: string};
type Channel = "instagram" | "youtube" | "tiktok" | "linkedin" | "facebook" | "other";
type Status = "draft" | "review" | "ready" | "posted_manually";
type Post = {
  id: string; channel: Channel; copy: string; status: Status; scheduled_local: string; timezone: string;
  notes: string; landing_url: string; utm_source: string; utm_medium: string; utm_campaign: string; assets: Asset[];
};
type Campaign = { version: number; name: string; posts: Post[] };
type Option = { asset: Asset; label: string };
const panel = "rounded-xl border border-slate-400/50 p-4 space-y-3";
const button = "rounded border border-slate-400 px-3 py-2 disabled:opacity-50";
const field = "block w-full rounded border border-slate-400 px-3 py-2 bg-transparent";
const statuses: Record<Status, string> = {draft: "Draft", review: "Needs review", ready: "Ready", posted_manually: "Posted manually"};
const channels: Channel[] = ["instagram", "youtube", "tiktok", "linkedin", "facebook", "other"];
const blankPost = (): Post => ({
  id: crypto.randomUUID(), channel: "instagram", copy: "", status: "draft", scheduled_local: "", timezone: "Africa/Lagos",
  notes: "", landing_url: "", utm_source: "", utm_medium: "", utm_campaign: "", assets: [],
});
const assetKey = (asset: Asset) => [asset.kind, asset.project_id, asset.id].join(":");

function AssetPicker({ projects, campaignId, value, onChange }: {
  projects: Project[]; campaignId: number; value: Asset[]; onChange: (value: Asset[]) => void;
}) {
  const [projectId, setProjectId] = useState(campaignId);
  const [options, setOptions] = useState<Option[]>([]);
  const [chosen, setChosen] = useState("");
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(id: number, page: number) {
    setLoading(true);
    setError("");
    setOptions([]);
    setMore(false);
    setChosen("");
    try {
      const images = await listImages(id, page);
      const items: Option[] = images.items.map(item => ({
        asset: {kind: "image", project_id: id, id: String(item.id)}, label: "Image: " + item.label,
      }));
      if (page === 0 && ["video", "music_video"].includes(projects.find(project => project.id === id)?.project_type ?? "")) {
        try {
          const sequence = await apiFetch<{sources: {id: string; name: string}[]}>(
            projectPath(id) + "/video/sequence");
          items.push(...sequence.sources.map(source => ({
            asset: {kind: "video", project_id: id, id: source.id} as Asset,
            label: "Video source: " + source.name,
          })));
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) setError(deliveryError(error));
        }
      }
      setOptions(items);
      setOffset(page);
      setMore(images.has_more);
    } catch (error) {
      setError(deliveryError(error));
    } finally {
      setLoading(false);
    }
  }

  const asset = options.find(item => assetKey(item.asset) === chosen)?.asset;
  return <details className={panel}>
    <summary>Linked images and video sources ({value.length})</summary>
    <ul>{value.map(item => <li key={assetKey(item)}>
      {item.kind} · {projects.find(project => project.id === item.project_id)?.name ?? "Project " + item.project_id} · {item.id}
      {" "}<button className={button} type="button" onClick={() => onChange(value.filter(entry => assetKey(entry) !== assetKey(item)))}>Remove reference</button>
    </li>)}</ul>
    <label>Asset project <select className={field} value={projectId} disabled={loading}
      onChange={event => {setProjectId(Number(event.target.value)); setOptions([]); setChosen(""); setOffset(0); setMore(false);}}>
      {!projects.some(project => project.id === campaignId) && <option value={campaignId}>This project</option>}
      {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select></label>
    <button className={button} type="button" disabled={loading} onClick={() => void load(projectId, 0)}>Load project assets</button>{" "}
    {offset > 0 && <button className={button} type="button" disabled={loading} onClick={() => void load(projectId, offset - 20)}>Previous images</button>}{" "}
    {more && <button className={button} type="button" disabled={loading} onClick={() => void load(projectId, offset + 20)}>More images</button>}
    {options.length > 0 && <>
      <label>Asset <select className={field} value={chosen} onChange={event => setChosen(event.target.value)}>
        <option value="">Choose an asset</option>
        {options.map(option => <option key={assetKey(option.asset)} value={assetKey(option.asset)}>{option.label}</option>)}
      </select></label>
      <button className={button} type="button" disabled={!asset || value.length >= 8 || value.some(item => assetKey(item) === chosen)}
        onClick={() => {if (asset) onChange([...value, asset]);}}>Link asset</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </details>;
}

function AdapterSandbox({ id, onApply }: {id: number; onApply: (copy: string) => void}) {
  const [prompt, setPrompt] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<{drafts: string[]; remaining_today: number} | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setError("");
    setBusy(true);
    setResult(null);
    setConsent(false);
    try {
      setResult(await apiFetch(projectPath(id) + "/creative-pilot", {method: "POST", body: {provider: "fixture", prompt, consent}}));
    } catch (error) {
      setError(deliveryError(error));
    } finally {
      setBusy(false);
    }
  }

  return <section className={panel}>
    <h2 className="text-xl font-semibold">Draft assistant sandbox</h2>
    <p>Provider: local test adapter. No external model receives the brief. Limit: five successful requests per project per UTC day.</p>
    <label>Short campaign brief <textarea className={field} value={prompt} maxLength={800} onChange={event => setPrompt(event.target.value)} /></label>
    <label className="block"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> Run the local adapter once for this brief</label>
    <button className={button} type="button" disabled={busy || !consent || prompt.trim().length < 3} onClick={() => void run()}>Generate review drafts</button>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status">
      <p>Review these suggestions before use. {result.remaining_today} requests left today.</p>
      {result.drafts.map((draft, index) => <div key={index}>
        <p className="break-words">{draft}</p>
        <button className={button} type="button" onClick={() => onApply(draft)}>Add suggestion {index + 1} as unsaved post</button>
      </div>)}
    </div>}
  </section>;
}

export default function CampaignStudio({ id }: {id: number}) {
  const [draft, setDraft] = useState<Campaign | null>(null);
  const [baseline, setBaseline] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const endpoint = projectPath(id) + "/campaign";
  const dirty = !!draft && baseline !== JSON.stringify(draft);

  useEffect(() => {
    let active = true;
    Promise.all([apiFetch<Campaign>(endpoint), getProjects()]).then(([saved, owned]) => {
      if (active) {setDraft(saved); setBaseline(JSON.stringify(saved)); setProjects(owned);}
    }).catch(error => {if (active) setError(deliveryError(error));});
    return () => {active = false;};
  }, [endpoint, reload]);

  function add(copy = "") {
    if (busy) return;
    if (!draft || draft.posts.length >= 30) {setError("The campaign can hold up to 30 posts."); return;}
    setDraft({...draft, posts: [...draft.posts, {...blankPost(), copy}]});
  }

  function update(post: Post, values: Partial<Post>) {
    setDraft(current => current && ({...current, posts: current.posts.map(item => item.id === post.id ? {...item, ...values} : item)}));
  }

  async function save() {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const saved = await apiFetch<Campaign>(endpoint, {method: "PUT", body: draft});
      setDraft(saved);
      setBaseline(JSON.stringify(saved));
      setNotice("Campaign saved.");
    } catch (error) {
      setError(deliveryError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handoff() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await downloadArtifact(endpoint + "/handoff.json?version=" + draft.version, "application/json", "indaverse-campaign.json");
    } catch (error) {
      setError(deliveryError(error));
    } finally {
      setBusy(false);
    }
  }

  const calendar = draft ? [...draft.posts].filter(post => post.scheduled_local)
    .sort((a, b) => a.scheduled_local.localeCompare(b.scheduled_local)) : [];

  return <main className="mx-auto max-w-4xl space-y-5 p-6">
    <Link className="underline" href={`/projects/${id}`}>Back to project</Link>
    <h1 className="text-3xl font-bold">Campaign Studio</h1>
    <p>Plan private posts, link project media, and prepare a handoff for manual publishing.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!draft ? <button className={button} type="button" onClick={() => {setError(""); setReload(value => value + 1);}}>Retry loading campaign</button> : <>
      <fieldset className={panel} disabled={busy}>
        <label>Campaign name <input className={field} maxLength={150} value={draft.name} onChange={event => setDraft({...draft, name: event.target.value})} /></label>
        <p>{draft.version ? "Saved version " + draft.version : "New campaign"}{dirty ? " · Unsaved changes" : ""}</p>
        <button type="button" className={button} disabled={draft.posts.length >= 30} onClick={() => add()}>Add campaign post</button>{" "}
        <button type="button" className={button} disabled={!dirty && draft.version > 0} onClick={() => void save()}>Save campaign</button>{" "}
        <button type="button" className={button} disabled={!draft.version || dirty} onClick={() => void handoff()}>Download campaign handoff</button>{" "}
        <button type="button" className={button} onClick={() => {
          if (dirty && !window.confirm("Discard the unsaved campaign changes?")) return;
          setDraft(null); setError(""); setNotice(""); setReload(value => value + 1);
        }}>Load saved campaign</button>
      </fieldset>
      <section className={panel}>
        <h2 className="text-xl font-semibold">Campaign calendar</h2>
        <p>Ordered by the local date entered. Times are notes only and never trigger a post.</p>
        {!calendar.length ? <p>No scheduled drafts.</p> : <ol>{calendar.map(post => <li key={post.id}>
          <a href={`#campaign-post-${post.id}`} className="underline">{post.scheduled_local.replace("T", " ")} ({post.timezone}) · {post.channel} · {statuses[post.status]}</a>
        </li>)}</ol>}
      </section>
      <fieldset className="space-y-4" disabled={busy}>
      {draft.posts.map((post, index) => <article id={`campaign-post-${post.id}`} className={panel} key={post.id}>
        <h2 className="text-xl font-semibold">Post {index + 1}</h2>
        <label>Post copy <textarea className={field} maxLength={2200} value={post.copy} onChange={event => update(post, {copy: event.target.value})} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Channel <select className={field} value={post.channel} onChange={event => update(post, {channel: event.target.value as Channel})}>
            {channels.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <label>Post status <select className={field} value={post.status} onChange={event => update(post, {status: event.target.value as Status})}>
            {(Object.keys(statuses) as Status[]).map(value => <option key={value} value={value}>{statuses[value]}</option>)}
          </select></label>
          <label>Local date and time <input className={field} type="datetime-local" value={post.scheduled_local}
            onChange={event => update(post, {scheduled_local: event.target.value})} /></label>
          <label>Timezone <input className={field} maxLength={64} value={post.timezone} onChange={event => update(post, {timezone: event.target.value})} /></label>
        </div>
        <label>Scheduling notes <textarea className={field} maxLength={500} value={post.notes} onChange={event => update(post, {notes: event.target.value})} /></label>
        <details className={panel}>
          <summary>Landing URL and tracking</summary>
          {([["landing_url", "Landing URL (HTTPS)", 500], ["utm_source", "UTM source", 80],
            ["utm_medium", "UTM medium", 80], ["utm_campaign", "UTM campaign", 80]] as const).map(([key, label, max]) =>
            <label className="block" key={key}>{label} <input className={field} maxLength={max} value={post[key]}
              onChange={event => update(post, {[key]: event.target.value})} /></label>)}
        </details>
        <AssetPicker projects={projects} campaignId={id} value={post.assets} onChange={assets => update(post, {assets})} />
        <button type="button" className={button} onClick={() => setDraft({...draft, posts: draft.posts.filter(item => item.id !== post.id)})}>Remove draft post</button>
      </article>)}
      </fieldset>
      <AdapterSandbox id={id} onApply={add} />
    </>}
  </main>;
}
