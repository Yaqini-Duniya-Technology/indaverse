import Link from "next/link";
import StudioArtwork from "@/components/StudioArtwork";
import styles from "./home.module.css";

const studios = [
  { kind: "music", name: "Music", mark: "01", text: "Write lyrics, organise audio and revisit song history.", note: "Audio generation awaits a connected provider." },
  { kind: "story", name: "Story", mark: "02", text: "Build chapters, develop characters and preview your manuscript.", note: "Your writing stays connected to its creative brief." },
  { kind: "video", name: "Video", mark: "03", text: "Write a script, plan shots and review the storyboard.", note: "Planning and previews; rendered video generation is future work." },
  { kind: "software", name: "Web & App", mark: "04", text: "Plan routes, page sections and the features that matter.", note: "A design blueprint, with a saved preview." },
  { kind: "game", name: "Game", mark: "05", text: "Shape 2D and 3D worlds, edit layouts and test browser prototypes.", note: "Blueprints and prototype tools; complete games require further development." },
];
export default function Home() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#home-main">Skip to content</a>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}><span aria-hidden="true">IV</span>IndaVerse</Link>
      <nav aria-label="Main navigation"><a href="#studios">Studios</a><a href="#workflow">How it works</a><Link href="/help">Help Centre</Link><Link href="/login">Sign in</Link><Link className={styles.primary} href="/register">Create account</Link></nav>
    </header>
    <main id="home-main">
      <section className={styles.hero}>
        <div><p className={styles.eyebrow}>ONE WORKSPACE. MANY WAYS TO CREATE.</p>
          <h1>Your next idea.<br /><em>Give it a home.</em></h1>
          <p className={styles.intro}>Move between words, sound, scenes and worlds. Keep the direction, drafts and references behind your creative project together.</p>
          <div className={styles.actions}><Link href="/register" className={styles.primary}>Start your workspace</Link><Link href="/dashboard" className={styles.secondary}>Open dashboard</Link></div>
          <p className={styles.note}>Development MVP. New projects start private.</p>
        </div>
        <aside className={styles.preview} aria-label="Example creative workflow">
          <div className={styles.previewHeader}><span>FROM BRIEF TO WORKING DRAFT</span><span>YOUR PROCESS</span></div>
          <div className={styles.previewBody}><p className={styles.eyebrow}>LEGENDS OF ZAMARA</p><h2>A village. A mystery.<br />A world worth building.</h2>
            <div className={styles.wave} aria-hidden="true">{[35,55,80,110,65,145,90,160,105,70,125,80].map((height,index) => <span key={index} style={{ height }} />)}</div>
            <div className={styles.previewTiles}><div><span>DIRECTION</span><strong>Creative brief</strong></div><div><span>DESIGN</span><strong>Game blueprint</strong></div><div><span>TEST</span><strong>Browser prototype</strong></div></div>
            <p className={styles.note}>Illustrative workflow, not a live project or generated asset.</p>
          </div>
        </aside>
      </section>
      <section id="studios" className={styles.section}><p className={styles.eyebrow}>CHOOSE YOUR MEDIUM</p><h2>Five studios. Your creative direction.</h2>
        <div className={styles.cards}>{studios.map(studio => <article key={studio.name}><StudioArtwork kind={studio.kind} /><div className={styles.cardTop}><span>{studio.mark}</span><small>Available in MVP</small></div><h3>{studio.name} Studio</h3><p>{studio.text}</p><p className={styles.providerNote}>{studio.note}</p><Link href="/dashboard">Open workspace →</Link></article>)}</div>
      </section>
      <section id="workflow" className={styles.section}><p className={styles.eyebrow}>BUILD WITH INTENTION</p><h2>A process you can return to.</h2><div className={styles.steps}>
        {[['01','Set your direction','Describe the goal, audience and constraints in a creative brief.'],['02','Develop the draft','Use a studio to write, structure and organise the project.'],['03','Review and refine','Save your work, revisit available history and test supported previews.']].map(([n,title,body]) => <article key={n}><span>{n}</span><h3>{title}</h3><p>{body}</p></article>)}
      </div></section>
      <section className={styles.section}><h2>Before you begin</h2>
        <details className="mt-6 rounded-xl border border-zinc-700 p-5"><summary className="cursor-pointer font-semibold">Does IndaVerse generate finished music or games?</summary><p className={styles.subtitle}>Not yet. This release provides writing, planning, asset organisation and browser prototype tools. AI generation providers and full game exports remain future work.</p></details>
        <details className="mt-4 rounded-xl border border-zinc-700 p-5"><summary className="cursor-pointer font-semibold">What is included in a draft export?</summary><p className={styles.subtitle}>Exports contain the editor data described by that tool. Image files, separate playable scenes and revision history are not automatically bundled.</p></details>
        <details className="mt-4 rounded-xl border border-zinc-700 p-5"><summary className="cursor-pointer font-semibold">How should I protect my work?</summary><p className={styles.subtitle}>Save edits before leaving a studio. Keep exports and database/media backups separately. Browser recovery is not a complete backup.</p></details>
      </section>
    </main>
    <footer className={styles.section}><p className={styles.subtitle}>Built by <a className="underline" href="https://yd.ydtech.workers.dev" target="_blank" rel="noopener noreferrer">Yaqini &amp; Duniya Technology</a>. <Link className="underline" href="/login">Sign in</Link></p></footer>
  </div>;
}
