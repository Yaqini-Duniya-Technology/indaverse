"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import SandboxCheckout from "./SandboxCheckout";

type Plan = {
  name: string; monthly_kobo: number | null; annual_kobo: number | null;
  included_credits: number; monthly_downloads: number | null;
  project_limit: number | null; storage_bytes: number | null; max_export_edge: number | null;
  premium_exports: boolean; ai_actions: string[]; project_types: string[];
};
type Wallet = {
  enforcement: boolean; plan_key: string; plan: Plan; period_end: string | null;
  available: number; reserved: number; consumed: number; reversed: number;
  sources: Record<string, number>;
  downloads: { month: string; used: number; limit: number | null };
  expiring: { source: string; credits: number; expires_at: string }[];
};
type Entry = { id: number; kind: string; available_delta: number; reserved_delta: number; created_at: string };
type History = { items: Entry[]; next_before: number | null };
const number = new Intl.NumberFormat("en-NG");
const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
const label = (value: string) => value.replaceAll("_", " ");
const date = (value: string) => new Date(value).toLocaleString("en-NG");
const amount = (value: number) => value > 0 ? "+" + number.format(value) : number.format(value);

export default function BillingPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [policy, setPolicy] = useState<{ plans: Record<string, Plan>; action_costs: Record<string, number> } | null>(null);
  const [history, setHistory] = useState<History>({ items: [], next_before: null });
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      apiFetch<Wallet>("/api/v1/credits", options),
      apiFetch<NonNullable<typeof policy>>("/api/v1/credits/plans", options),
      apiFetch<History>("/api/v1/credits/history", options),
    ]).then(([summary, catalog, entries]) => {
      if (controller.signal.aborted) return;
      setWallet(summary); setPolicy(catalog); setHistory(entries); setError("");
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof ApiError && cause.status === 401
        ? "Sign in to view your credits." : cause instanceof Error ? cause.message : "Could not load your credits.");
    });
    return () => controller.abort();
  }, [reload]);

  async function loadMore() {
    if (history.next_before === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await apiFetch<History>("/api/v1/credits/history?before=" + history.next_before);
      setHistory((current) => ({ items: [...current.items, ...next.items], next_before: next.next_before }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load more transactions.");
    } finally {
      setLoadingMore(false);
    }
  }

  return <main className="min-h-screen bg-zinc-950 text-zinc-100">
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-10">
      <nav aria-label="Workspace" className="flex gap-5 text-sm">
        <Link href="/dashboard" className="underline">Dashboard</Link>
        <Link href="/help" className="underline">Help Centre</Link>
      </nav>
      <header>
        <p className="text-sm text-zinc-300">Creator workspace</p>
        <h1 className="mt-1 text-4xl font-bold">Credits and plans</h1>
        <p className="mt-3 text-zinc-300">See what your plan includes and how your credits are used.</p>
      </header>
      {error && <div role="alert" className="rounded border border-rose-500 bg-rose-950 p-4">
        {error} <button className="ml-3 underline" onClick={() => { setError(""); setReload((n) => n + 1); }}>Retry</button>
        <Link className="ml-3 underline" href="/login">Sign in</Link>
      </div>}
      {!wallet && !error && <p role="status">Loading your wallet…</p>}
      {wallet && policy && <>
        {!wallet.enforcement && <p className="rounded border border-sky-500 bg-sky-950 p-4">
          Beta limits are off on this server. Plan allowances below are for reference.
        </p>}
        <section aria-labelledby="wallet" className="space-y-4">
          <h2 id="wallet" className="text-2xl font-semibold">Your wallet · {wallet.plan.name}</h2>
          <p className="text-zinc-300">{wallet.period_end ? `Current prepaid period ends ${date(wallet.period_end)}.` : "No paid period is active."}</p>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries({ Available: wallet.available, Reserved: wallet.reserved, Consumed: wallet.consumed, Reversed: wallet.reversed }).map(([name, value]) =>
              <div key={name} className="rounded-lg border border-zinc-700 bg-zinc-900 p-4"><dt>{name}</dt><dd className="mt-1 text-2xl font-bold">{number.format(value)}</dd></div>)}
          </dl>
          <p className="capitalize text-zinc-300">{Object.entries(wallet.sources).map(([kind, value]) => `${label(kind)}: ${number.format(value)}`).join(" · ")}</p>
          <p className="text-zinc-300">Downloads in {wallet.downloads.month} (UTC): {wallet.downloads.used} used
            {wallet.downloads.limit !== null ? ` · ${Math.max(0, wallet.downloads.limit - wallet.downloads.used)} remaining` : " · No plan limit"}.</p>
          {wallet.expiring.length > 0 && <div><h3 className="font-semibold">Upcoming credit expiries</h3><ul className="list-disc pl-6 text-zinc-300">
            {wallet.expiring.map((item, index) => <li key={index}>{item.credits} {item.source} credits expire {date(item.expires_at)}.</li>)}
          </ul></div>}
        </section>
        <section aria-labelledby="plans">
          <h2 id="plans" className="text-2xl font-semibold">Compare plans</h2>
          <p className="mt-2 text-zinc-300">Unset prices have not been confirmed. Only configured test offers can be selected below.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(policy.plans).map(([key, plan]) => <article key={key} className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
              <h3 className="text-lg font-semibold">{plan.name}{key === wallet.plan_key ? " · Current" : ""}</h3>
              <p>Monthly: {plan.monthly_kobo === null ? "Not set" : money.format(plan.monthly_kobo / 100)} · Annual: {plan.annual_kobo === null ? "Not set" : money.format(plan.annual_kobo / 100)}</p>
              <p className="text-zinc-300">{plan.included_credits} credits per paid period · {plan.monthly_downloads ?? "Unlimited"} downloads per month · {plan.project_limit ?? "Unlimited"} saved projects</p>
              <p className="text-zinc-300">{plan.premium_exports ? "Premium exports included" : "Standard exports"} · {plan.max_export_edge === null ? "No plan resolution limit" : `Longest export edge: ${plan.max_export_edge} px`}</p>
              <p className="text-zinc-300">{plan.storage_bytes === null ? "No plan media storage cap" : `${number.format(plan.storage_bytes)} bytes of stored media`}</p>
              <p className="text-zinc-300">AI entitlement: {plan.ai_actions.length ? plan.ai_actions.map(label).join(", ") : "None"}</p>
            </article>)}
          </div>
        </section>
        <SandboxCheckout onPaymentVerified={() => setReload((value) => value + 1)} />
        <section aria-labelledby="costs">
          <h2 id="costs" className="text-2xl font-semibold">AI credit costs</h2>
          {Object.keys(policy.action_costs).length ? <ul className="mt-3 list-disc pl-6">
            {Object.entries(policy.action_costs).map(([action, cost]) => <li className="capitalize" key={action}>{label(action)}: {cost} credits</li>)}
          </ul> : <p className="mt-2 text-zinc-300">No AI action costs have been configured.</p>}
          <p className="mt-2 text-zinc-300">A listed cost is a quote, not proof that a generation provider is available.</p>
        </section>
        <section aria-labelledby="history">
          <h2 id="history" className="text-2xl font-semibold">Credit history</h2>
          {!history.items.length ? <p className="mt-2 text-zinc-300">No credit transactions yet.</p> : <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th className="p-2">Transaction</th><th className="p-2">Available</th><th className="p-2">Reserved</th><th className="p-2">Date</th></tr></thead>
              <tbody>{history.items.map((entry) => <tr className="border-t border-zinc-700" key={entry.id}>
                <td className="p-2 capitalize">{label(entry.kind)}</td><td className="p-2">{amount(entry.available_delta)}</td>
                <td className="p-2">{amount(entry.reserved_delta)}</td><td className="p-2">{date(entry.created_at)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {history.next_before !== null && <button className="mt-3 underline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading…" : "Load more transactions"}</button>}
        </section>
      </>}
    </div>
  </main>;
}
