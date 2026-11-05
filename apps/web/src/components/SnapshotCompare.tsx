import { snapshotDiff } from "@/lib/snapshot-diff.mjs";
export default function SnapshotCompare({saved, working}: {saved: unknown; working: unknown}) {
  const changes = snapshotDiff(saved, working);
  return <details className="my-5 rounded-xl border border-slate-600 p-4"><summary>Compare this revision with the working draft</summary>
    <p className="my-3">Read-only comparison, up to 100 changed fields. Numbered array positions start at zero; moving items can show several differences. Loading a revision still requires the separate restore action and manual save.</p>
    {changes.length === 0 ? <p>No differences.</p> : changes.map(change=><div key={change.path} className="my-4 border-t border-slate-700 pt-3"><h4 className="font-bold">{change.path}</h4><p>Saved revision:</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words">{change.before}</pre><p>Working draft:</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words">{change.after}</pre></div>)}
    {changes.length===100 && <p>Comparison limit reached. Export and inspect complete drafts for further differences.</p>}
  </details>;
}
