"use client";
import Link from "next/link";
import { useState } from "react";
import { workspaceGuides } from "@/lib/workspace-guides.mjs";
import styles from "./help.module.css";
const categories = [
  {id: "all", title: "All topics", keys: Object.keys(workspaceGuides)},
  {id: "start", title: "Getting started", keys: ["home", "access", "dashboard", "brief", "plan"]},
  {id: "music", title: "Music Studio", keys: ["music", "images"]},
  {id: "story", title: "Story Studio", keys: ["story", "reader", "images"]},
  {id: "video", title: "Video Studio", keys: ["video", "images"]},
  {id: "software", title: "Web & App Studio", keys: ["software", "images"]},
  {id: "game", title: "Game Studio", keys: ["game", "layout", "scene", "play", "images"]},
];
export default function HelpCentre() {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const chosen = categories.find(item => item.id === category) ?? categories[0];
  const guides = chosen.keys.map(key => ({key, ...workspaceGuides[key]})).map(guide => ({...guide,
    fields: guide.fields.filter(field => `${guide.title} ${guide.intro} ${field.name} ${field.meaning} ${field.example}`.toLowerCase().includes(search.toLowerCase().trim()))
  })).filter(guide => guide.fields.length);
  return <main className={styles.page}>
    <nav aria-label="Help navigation"><Link href="/">IndaVerse home</Link><Link href="/dashboard">Dashboard</Link></nav>
    <header><p>LEARN YOUR WORKSPACE</p><h1>IndaVerse Help Centre</h1><p>Choose a studio to learn what each section means, what to enter, and what happens next.</p></header>
    <div className={styles.layout}>
      <aside><h2>Categories</h2>{categories.map(item => <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.title}</button>)}</aside>
      <div><label htmlFor="help-search">Search explanations and examples</label><input id="help-search" type="search" maxLength={150} value={search} onChange={event => setSearch(event.target.value)} placeholder="Try: genre, save, chapter, tempo" />
        <p role="status">{guides.length} sections in {chosen.title}</p>
        {!guides.length && <p>No matches. Try a shorter phrase or select All topics.</p>}
        {guides.map(guide => <section className={styles.guide} key={guide.key}><h2>{guide.title}</h2><p>{guide.intro}</p>
          {guide.fields.map(field => <details key={field.name}><summary>{field.name}</summary><p>{field.meaning}</p><blockquote><strong>Example</strong><p>{field.example}</p></blockquote></details>)}
        </section>)}
        <section className={styles.guide}><h2>Production tools: how to use them</h2><p>Open Draft desk in a studio. Expand Production tools and choose its options. Calculations use your working draft and do not save or change it.</p>
          <p>Examples: estimate a song from bars and tempo; set a story word target; compare a shot timeline with a runtime budget; filter a product feature list; review game assets by category.</p>
          <p>Save studio edits manually. Tool settings last only while the page is open. A report is planning evidence, not a generated song, film, app or complete game.</p></section>
        <section className={styles.guide}><h2>When something goes wrong</h2><p>Failed to fetch: check that the IndaVerse API is running on the configured address. A version conflict: export your draft before loading the latest save. A blank game: check browser WebGL support and retain your blueprint export.</p><p>Do not share passwords, tokens or your .env file when requesting help.</p></section>
      </div>
    </div>
    <footer>Built by <a href="https://yd.ydtech.workers.dev" target="_blank" rel="noopener noreferrer">Yaqini &amp; Duniya Technology</a></footer>
  </main>;
}
