"use client";
import Link from "next/link";
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="min-h-screen bg-zinc-950 p-8 text-white"><h1 className="text-3xl">This workspace could not finish loading.</h1>
    <p className="my-5">Keep any open draft exports. Try loading the page again, or return to the dashboard.</p>
    <button className="rounded-lg border p-3" onClick={() => retry()}>Try again</button><Link className="ml-5 underline" href="/dashboard">Dashboard</Link></main>;
}
