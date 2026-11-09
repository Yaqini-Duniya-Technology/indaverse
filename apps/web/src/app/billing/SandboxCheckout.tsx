"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";

type Product = { key: string; title: string; amount_kobo: number; credits: number; plan: string | null };
type Payment = {
  reference: string; title: string; amount_kobo: number; credits: number; state: string;
  created_at: string; paid_at: string | null; checkout_url: string | null;
};
type History = { items: Payment[]; next_before: number | null };
type Catalog = { enabled: boolean; products: Product[] };
const endpoint = "/api/v1/payments";
const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
const format = (kobo: number) => money.format(kobo / 100);
const states: Record<string, string> = {
  created: "Not opened", initializing: "Opening checkout", pending: "Awaiting payment",
  paid: "Verified and fulfilled", failed: "Failed", abandoned: "Abandoned", review: "Needs review",
};

function safeCheckout(url: string | null): url is string {
  return !!url && /^https:\/\/checkout\.paystack\.com\/[A-Za-z0-9_-]{1,150}$/.test(url);
}

const noSubscribe = () => () => {};
const readReturned = () => {
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference") || params.get("trxref");
  return reference && /^ivtest-[0-9a-f]{32}$/.test(reference) ? reference : "";
};

export default function SandboxCheckout({ onPaymentVerified }: { onPaymentVerified: () => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [history, setHistory] = useState<History>({ items: [], next_before: null });
  const [selection, setSelection] = useState<Product | null>(null);
  const [attempt, setAttempt] = useState("");
  const returned = useSyncExternalStore(noSubscribe, readReturned, () => "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [offers, receipts] = await Promise.all([
      apiFetch<Catalog>(endpoint + "/catalog", { signal }),
      apiFetch<History>(endpoint + "/history", { signal }),
    ]);
    if (signal?.aborted) return;
    setCatalog(offers);
    setHistory(receipts);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    refresh(abort.signal).catch((cause: unknown) => {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load test checkout.");
    });
    return () => abort.abort();
  }, [refresh]);

  async function verify(reference: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiFetch<Payment>(endpoint + "/" + reference + "/verify", { method: "POST" });
      setNotice(result.state === "paid" ? "Test payment verified. Your wallet is up to date."
        : "Test payment: " + (states[result.state] || "Not yet confirmed") + ".");
      await refresh();
      if (result.state === "paid") onPaymentVerified();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify the test payment.");
    } finally { setBusy(false); }
  }

  async function checkout() {
    if (!selection || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiFetch<Payment>(endpoint + "/checkout", { method: "POST", body: {
        product: selection.key, confirmed_amount_kobo: selection.amount_kobo, confirmed_credits: selection.credits, attempt,
      } });
      if (safeCheckout(result.checkout_url)) { window.location.assign(result.checkout_url); return; }
      setNotice("Check payment history for this attempt before starting another checkout.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open test checkout.");
      // The quote may have been saved even when initialization failed.
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function more() {
    if (history.next_before === null) return;
    setBusy(true);
    try {
      const page = await apiFetch<History>(endpoint + "/history?before=" + history.next_before);
      setHistory((previous) => ({ items: [...previous.items, ...page.items], next_before: page.next_before }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load more test payments.");
    } finally { setBusy(false); }
  }

  return <section aria-labelledby="sandbox-checkout" className="space-y-3">
    <h2 id="sandbox-checkout" className="text-2xl font-semibold">Test checkout</h2>
    {error && <p role="alert" className="rounded border border-rose-500 bg-rose-950 p-3">{error}</p>}
    {notice && <p role="status" className="rounded border border-sky-500 bg-sky-950 p-3">{notice}</p>}
    {!catalog ? <p>Loading checkout options…</p> : !catalog.enabled ? <p>Sandbox checkout is off on this server.</p> : <>
      <p className="text-zinc-300">Use Paystack test payment details only. Plans are prepaid and do not renew automatically.</p>
      {returned && <button type="button" disabled={busy} className="underline" onClick={() => void verify(returned)}>Verify returned test payment</button>}
      {catalog.products.length ? <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Choose a test bundle or prepaid plan</legend>
        {catalog.products.map((product) => <label key={product.key} className="flex gap-2 rounded border border-zinc-700 bg-zinc-900 p-3">
          <input type="radio" name="sandbox-product" checked={selection?.key === product.key} onChange={() => {
            setSelection(product); setAttempt(crypto.randomUUID()); setError("");
          }} />
          <span>{product.title} · {format(product.amount_kobo)} · {product.credits} credits</span>
        </label>)}
      </fieldset> : <p>No test prices have been configured.</p>}
      {selection && <div className="rounded border border-zinc-700 p-4">
        <p>Review: {selection.title} for {format(selection.amount_kobo)} in test mode.</p>
        <button type="button" className="mt-2 rounded bg-sky-100 px-4 py-2 font-semibold text-sky-950 disabled:opacity-60"
          disabled={busy} onClick={() => void checkout()}>Confirm and open Paystack test checkout</button>
      </div>}
    </>}
    <h3 className="text-lg font-semibold">Test payment history</h3>
    {history.items.length ? <ul className="space-y-2">
      {history.items.map((item) => <li key={item.reference} className="rounded border border-zinc-700 p-3">
        <p>{item.title} · {format(item.amount_kobo)} · {states[item.state] || item.state}</p>
        <p className="break-all text-sm text-zinc-300">{item.reference} · {new Date(item.paid_at || item.created_at).toLocaleString("en-NG")}</p>
        {catalog?.enabled && item.state !== "paid" && item.state !== "review" && <button type="button" disabled={busy}
          className="mr-4 mt-1 underline" onClick={() => void verify(item.reference)}>Verify payment</button>}
        {catalog?.enabled && safeCheckout(item.checkout_url) && <a className="underline" href={item.checkout_url}>Resume Paystack test checkout</a>}
      </li>)}
    </ul> : <p className="text-zinc-300">No test payments yet.</p>}
    {history.next_before !== null && <button type="button" disabled={busy} className="underline" onClick={() => void more()}>Load more test payments</button>}
  </section>;
}
