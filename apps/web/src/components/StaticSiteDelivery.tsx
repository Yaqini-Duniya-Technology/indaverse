"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { deliveryError, downloadArtifact, projectPath } from "@/lib/creatorDelivery";
import type { SoftwarePage, SectionKind } from "@/lib/software";

const templates: Record<string, { name: string; path: string; sections: [SectionKind, string, string][] }> = {
  about: { name: "About", path: "/about", sections: [["hero", "Our story", "Explain what you do and who it helps."], ["text", "Our approach", "Describe how you work."]] },
  landing: { name: "Launch", path: "/launch", sections: [["hero", "Meet your next project", "Describe the benefit in a sentence."], ["call_to_action", "Explore the project", "Choose a destination for this section below."]] },
  portfolio: { name: "Portfolio", path: "/portfolio", sections: [["hero", "Selected work", "Introduce your portfolio."], ["cards", "Case studies", "Summarize the problem, your role, and the outcome."]] },
};

export default function StaticSiteDelivery({ projectId, version, dirty, pages, mobile, onAdd }: {
  projectId: number; version: number; dirty: boolean; pages: SoftwarePage[]; mobile: boolean;
  onAdd: (page: SoftwarePage) => void;
}) {
  const [template, setTemplate] = useState("about");
  const [check, setCheck] = useState<{version: number; issues: string[]} | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function add() {
    const item = templates[template];
    let path = item.path;
    let suffix = 2;
    while (pages.some(page => page.path.replace(/\/$/, "").toLowerCase() === path)) path = item.path + "-" + suffix++;
    onAdd({
      id: crypto.randomUUID(), name: item.name, path, nav_label: item.name,
      sections: item.sections.map(([kind, heading, content]) => ({id: crypto.randomUUID(), kind, heading, content})),
    });
  }

  async function run(exportSite: boolean) {
    setError("");
    setBusy(true);
    try {
      const endpoint = projectPath(projectId) + "/software/";
      const result = await apiFetch<{issues: string[]}>(endpoint + "site-check?version=" + version);
      setCheck({version, ...result});
      if (exportSite && !result.issues.length) {
        await downloadArtifact(endpoint + "site.zip?version=" + version, "application/zip", "indaverse-site.zip");
      }
    } catch (error) {
      setError(deliveryError(error));
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="Static website delivery" className="space-y-3">
    <h3>Page templates and static export</h3>
    <label>Page template <select value={template} onChange={event => setTemplate(event.target.value)}>
      <option value="about">About</option><option value="landing">Launch page</option><option value="portfolio">Portfolio</option>
    </select></label>
    <button type="button" disabled={pages.length >= 50} onClick={add}>Add template page</button>
    <p>Set a navigation label on each page you want in the shared menu. The menu follows page order.</p>
    <p>Save before checking links or exporting. Open index.html after extracting the ZIP. Forms and app features are planning notes.</p>
    {mobile && <p>Choose a web platform to enable static export.</p>}
    <button type="button" disabled={!version || dirty || busy || mobile} onClick={() => void run(false)}>Check saved links</button>
    <button type="button" disabled={!version || dirty || busy || mobile} onClick={() => void run(true)}>Download static site ZIP</button>
    {error && <p role="alert">{error}</p>}
    {check?.version === version && !dirty && <div role="status">
      {check.issues.length ? <ul>{check.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul> : "All saved links resolve."}
    </div>}
  </section>;
}
