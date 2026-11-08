"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";
type Result = { label: string; state: string };
export default function ServiceStatus() {
  const [results, setResults] = useState<Result[]>([]);
  const [checking, setChecking] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10000);
    let active = true;
    async function load() {
      const next: Result[] = [{label:"Web page",state:"Loaded in this browser"}];
      try {
        const response = await fetch(`${api}/api/v1/health`, {signal:controller.signal,cache:"no-store"});
        const body = await response.json();
        next.push({label:"API identity",state:response.ok && body.service === "indaverse-api" ? "IndaVerse API responding" : "Unexpected API response"});
      } catch { next.push({label:"API identity",state:"Unavailable, blocked or timed out"}); }
      try {
        const response = await fetch(`${api}/api/v1/ready`, {signal:controller.signal,cache:"no-store"});
        const body = await response.json();
        for (const key of ["database","redis"]) next.push({label:key,state:body.checks?.[key] === "ok" ? "Responding" : "Unavailable"});
      } catch { next.push({label:"Database / Redis readiness",state:"Could not check"}); }
      finally { if (active) {setResults(next);setChecking(false);} window.clearTimeout(timer); }
    }
    void load();
    return () => {active=false;controller.abort();window.clearTimeout(timer);};
  }, [retry]);
  return <main className="mx-auto max-w-3xl px-6 py-12 text-slate-100">
    <nav className="flex gap-6"><Link href="/dashboard">Dashboard</Link><Link href="/help">Help Centre</Link><Link href="/login">Sign in</Link></nav>
    <h1 className="my-6 text-4xl font-bold">IndaVerse service status</h1>
    <p>Read-only checks from your browser. No passwords, project data or configuration secrets are requested. Readiness does not prove migrations, backups or every workflow are healthy.</p>
    <p className="my-4">Configured API address: <code>{api}</code></p>
    <button disabled={checking} className="my-4 rounded-lg border p-3 disabled:opacity-50" onClick={() => {setChecking(true);setRetry(value=>value+1);}}>Check again</button>
    <div role="status">{checking ? "Checking services…" : "Checks finished"}</div>
    <dl className="my-6">{results.map(result=><div key={result.label} className="my-3 rounded-xl border border-slate-600 p-4"><dt className="font-bold">{result.label}</dt><dd>{result.state}</dd></div>)}</dl>
    <details className="my-6 rounded-xl border p-5"><summary>Help — what to do next</summary>
      <p className="my-3">API unavailable: run Start-IndaVerse.ps1, then inspect .local-run/api.log locally. Database unavailable: check Docker Desktop. If API works in a terminal but not here, check the browser origin and CORS configuration.</p>
      <p>Example: open http://localhost:3000 consistently and use the configured API on port 8002. Changes to NEXT_PUBLIC_API_URL require a fresh web build. Existing drafts are not resubmitted by these checks.</p>
      <p className="mt-3">Check logs for private values before sharing. A local API cannot be reached from a reviewer’s remote computer.</p>
    </details>
  </main>;
}
