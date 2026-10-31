# IndaVerse — Web Application

The creator-facing frontend of **[IndaVerse](https://github.com/Yaqini-Duniya-Technology/indaverse)**, developed by **Yaqini & Duniya Technology**.

**Stage:** Local development MVP, not a publicly launched production application.

## What this frontend supports

The Next.js application provides creator dashboards, account interfaces, project navigation and workspaces for the Music, Story, Video, Web & App and Game studios. The backend is a separate FastAPI application in `../api`; studio records, revisions and asset workflows depend on that service and its configured database.

The Game Studio includes blueprint-oriented tools and browser-based scene prototyping. It does not generate a complete playable game automatically. Generative media providers are not yet connected.

## Technology

- Next.js 16, React 19 and TypeScript
- Three.js for browser 3D functionality
- Tailwind CSS
- FastAPI backend and PostgreSQL data services (separate application)

## Local development

From the **repository root**:

```powershell
npm.cmd --prefix apps/web ci
npm.cmd --prefix apps/web run dev
```

Open http://localhost:3000. Backend-dependent functionality requires the API and database services described in the [root setup guide](../../README.md).

For the full local stack, use the repository launcher after configuring your environment:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-IndaVerse.ps1
```

### Production build check

```powershell
npm.cmd --prefix apps/web run build
```

A successful build confirms frontend compilation; it does not establish deployment security, provider availability or browser compatibility across all devices.

## Source and project status

- [Main README and current development stage](../../README.md)
- [Demo walkthrough](../../docs/DEMO.md)
- [FastAPI backend](../api)
- [Yaqini & Duniya Technology](https://github.com/Yaqini-Duniya-Technology)

**IndaVerse — Create with structure. Build with imagination.**
