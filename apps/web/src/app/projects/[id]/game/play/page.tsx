"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getGame, type GameProject } from "@/lib/game";
import styles from "./play.module.css";
import dynamic from "next/dynamic";

const ThreeGame = dynamic(() => import("./ThreeGame"), {
  ssr: false,
  loading: () => <p aria-busy="true">Loading 3D engine...</p>,
});
import { ApiError } from "@/lib/api";
import { defaultScene, getGameScene, type SceneLayout } from "@/lib/gameScene";
import {
  defaultLayout, getPlaySettings, type PlayLayout,
} from "@/lib/gamePlay";

type World = {
  x: number; y: number; vy: number; grounded: boolean;
  gems: boolean[]; won: boolean;
};

function initial(layout: PlayLayout): World {
  return {
    x: layout.spawn.x, y: layout.spawn.y, vy: 0, grounded: false,
    gems: layout.collectibles.map(() => false), won: false,
  };
}

export default function PlayPage() {
  const params = useParams();
  return <LoadGame key={String(params.id)} projectId={Number(params.id)} />;
}

function LoadGame({ projectId }: { projectId: number }) {
  const [game, setGame] = useState<GameProject | null>(null);
  const [layout, setLayout] = useState<PlayLayout | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [scene, setScene] = useState<SceneLayout | null>(null);
  const [sceneVersion, setSceneVersion] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setGame(null);
    setLayout(null);
    setLayoutVersion(0);
    setScene(null);
    setSceneVersion(0);
    setError("");
    void (async () => {
      try {
        if (!Number.isSafeInteger(projectId) || projectId < 1) throw new Error("Invalid project ID.");
        const saved = await getGame(projectId);
        let nextLayout: PlayLayout | null = null;
        let nextVersion = 0;
        if (saved.dimension === "2d") {
          try {
            const settings = await getPlaySettings(projectId);
            nextLayout = settings.layout;
            nextVersion = settings.version;
          } catch (err) {
            if (
              err instanceof ApiError &&
              err.message === "No playable level settings saved yet."
            ) {
              nextLayout = defaultLayout();
            } else {
              throw err;
            }
          }
        }
        let nextScene: SceneLayout | null = null;
        let nextSceneVersion = 0;
        if (saved.dimension === "3d") {
          try {
            const settings = await getGameScene(projectId);
            nextScene = settings.layout;
            nextSceneVersion = settings.version;
          } catch (err) {
            if (err instanceof ApiError && err.status === 404 &&
                err.message === "No 3D scene saved yet.") {
              nextScene = defaultScene();
            } else {
              throw err;
            }
          }
        }
        if (active) {
          setScene(nextScene);
          setSceneVersion(nextSceneVersion);
          setGame(saved);
          setLayout(nextLayout);
          setLayoutVersion(nextVersion);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load game.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [projectId, retry]);

  return <main className={styles.page}><div className={styles.container}>
    <nav className={styles.nav}>
      <Link href={`/projects/${projectId}`}>Back to project</Link>
      <Link href={`/projects/${projectId}/game`}>Game Studio</Link>
      {game?.dimension === "3d" && (
        <Link href={`/projects/${projectId}/game/scene`}>Edit 3D scene</Link>
      )}
      <button disabled={loading} onClick={() => {
        if (window.confirm("Reload saved settings and reset play progress?")) {
          setRetry((value) => value + 1);
        }
      }}>Reload saved settings</button>
      {game?.dimension === "2d" && (
        <Link href={`/projects/${projectId}/game/layout`}>Edit playable layout</Link>
      )}
    </nav>
    {loading ? <p aria-busy="true">Loading saved game and playable layout...</p> : error ? (
      <div><p role="alert">{error}</p><button onClick={() => setRetry((value) => value + 1)}>Retry</button></div>
    ) : game?.dimension === "3d" && scene ? (
      <ThreeGame key={`${game.version}:${sceneVersion}:${retry}`}
        game={game} layout={scene} sceneVersion={sceneVersion} />
    ) : game && layout ? (
      <Runner key={`${game.version}:${layoutVersion}:${retry}`}
        game={game} layout={layout} layoutVersion={layoutVersion} />
    ) : null}
  </div></main>;
}

function Runner({ game, layout, layoutVersion }: {
  game: GameProject; layout: PlayLayout; layoutVersion: number;
}) {
  const platforms = layout.platforms;
  const gems = layout.collectibles;
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<World>(initial(layout));
  const keys = useRef(new Set<string>());
  const touches = useRef(new Map<number, string>());
  const jump = useRef(false);
  const running = useRef(false);
  const [status, setStatus] = useState<"ready" | "playing" | "paused" | "won">("ready");
  const [count, setCount] = useState(0);

  function clearInput() {
    keys.current.clear();
    touches.current.clear();
    jump.current = false;
  }
  function pause() {
    clearInput();
    running.current = false;
    setStatus((current) => current === "playing" ? "paused" : current);
  }
  function start() {
    clearInput();
    canvas.current?.focus();
    running.current = true;
    setStatus("playing");
  }
  function restart() {
    running.current = false;
    clearInput();
    world.current = initial(layout);
    setCount(0);
    setStatus("ready");
  }

  useEffect(() => {
    const surface = canvas.current;
    const ctx = surface?.getContext("2d");
    if (!surface || !ctx) return;
    let frame = 0;
    let last = 0;
    let accumulator = 0;
    function tick() {
      const state = world.current;
      if (!running.current || state.won) return;
      const inputs = new Set([...keys.current, ...touches.current.values()]);
      const direction = Number(inputs.has("right")) - Number(inputs.has("left"));
      state.x = Math.max(0, Math.min(776, state.x + direction * 3.5));
      if (jump.current && state.grounded) {
        state.vy = -11;
        state.grounded = false;
      }
      jump.current = false;
      const previousBottom = state.y + 34;
      state.vy = Math.min(14, state.vy + 0.5);
      state.y += state.vy;
      state.grounded = false;
      if (state.vy >= 0) {
        for (const platform of [...platforms].sort((a, b) => a.y - b.y)) {
          if (state.x + 24 > platform.x && state.x < platform.x + platform.w &&
              previousBottom <= platform.y && state.y + 34 >= platform.y) {
            state.y = platform.y - 34;
            state.vy = 0;
            state.grounded = true;
            break;
          }
        }
      }
      if (state.y >= 400) {
        state.x = layout.spawn.x;
        state.y = layout.spawn.y;
        state.vy = 0;
        state.grounded = false;
        jump.current = false;
        return;
      }
      gems.forEach((gem, index) => {
        if (!state.gems[index] &&
            Math.abs(state.x + 12 - gem.x) < 25 &&
            Math.abs(state.y + 17 - gem.y) < 30) {
          state.gems[index] = true;
          setCount(state.gems.filter(Boolean).length);
        }
      });
      if (
        state.gems.every(Boolean) &&
        state.x + 24 > layout.exit.x &&
        state.x < layout.exit.x + 36 &&
        state.y + 34 > layout.exit.y &&
        state.y < layout.exit.y + 50
      ) {
        state.won = true;
        running.current = false;
        setStatus("won");
      }
    }
    function draw() {
      if (!ctx) return;
      const state = world.current;
      ctx.fillStyle = "#142638";
      ctx.fillRect(0, 0, 800, 400);
      ctx.fillStyle = "#22495b";
      ctx.beginPath(); ctx.arc(650, 85, 48, 0, Math.PI * 2); ctx.fill();
      platforms.forEach((platform) => {
        ctx.fillStyle = "#537e69";
        ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
        ctx.fillStyle = "#9bd2a2";
        ctx.fillRect(platform.x, platform.y, platform.w, 5);
      });
      ctx.fillStyle = state.gems.every(Boolean) ? "#a8e5aa" : "#75658a";
      ctx.fillRect(layout.exit.x, layout.exit.y, 36, 50);
      ctx.font = "14px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(
        "EXIT", Math.min(764, layout.exit.x),
        Math.max(14, layout.exit.y - 8),
      );
      gems.forEach((gem, index) => {
        if (state.gems[index]) return;
        ctx.fillStyle = "#f6cf70";
        ctx.beginPath();
        ctx.moveTo(gem.x, gem.y - 10); ctx.lineTo(gem.x + 10, gem.y);
        ctx.lineTo(gem.x, gem.y + 10); ctx.lineTo(gem.x - 10, gem.y);
        ctx.closePath(); ctx.fill();
      });
      ctx.fillStyle = "#62d3cb";
      ctx.fillRect(state.x, state.y, 24, 34);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(state.x + 15, state.y + 7, 4, 4);
    }
    function loop(time: number) {
      const elapsed = last ? Math.min(100, time - last) : 0;
      last = time;
      if (running.current) {
        accumulator += elapsed;
        while (accumulator >= 1000 / 60) {
          tick();
          accumulator -= 1000 / 60;
        }
      } else accumulator = 0;
      draw();
      frame = requestAnimationFrame(loop);
    }
    function loseFocus() { pause(); }
    function hidden() { if (document.hidden) pause(); }
    window.addEventListener("blur", loseFocus);
    document.addEventListener("visibilitychange", hidden);
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      running.current = false;
      clearInput();
      window.removeEventListener("blur", loseFocus);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [layout]);

  function action(code: string) {
    if (["ArrowLeft", "KeyA"].includes(code)) return "left";
    if (["ArrowRight", "KeyD"].includes(code)) return "right";
    if (["Space", "ArrowUp", "KeyW"].includes(code)) return "jump";
    return "";
  }

  return <>
    <header><p className={styles.eyebrow}>PRIVATE PLAYABLE LEVEL / 2D</p>
      <h1>{game.title}</h1>
      <p>Saved blueprint version {game.version}. Player: {game.characters.find((item) => item.role === "player")?.name || "Explorer"}.</p>
      <p>{layoutVersion > 0
        ? `Playing saved layout version ${layoutVersion}.`
        : "Playing the starter layout. Save your own layout in the layout editor."}</p>
      <p>The level uses placeholder shapes. Written level descriptions, artwork, and custom rules remain design references.</p>
    </header>
    <div className={styles.toolbar}>
      <button onClick={start} disabled={status === "playing" || status === "won"}>
        {status === "paused" ? "Resume" : "Start"}
      </button>
      <button onClick={pause} disabled={status !== "playing"}>Pause</button>
      <button onClick={restart}>Restart</button>
      <span role="status">{status === "won" ? "Completed! All gems collected and exit reached." : `${status} / Gems ${count} of ${gems.length}`}</span>
    </div>
    <p id="instructions">Collect every gold gem, then reach the exit. Falling returns you to the spawn point and preserves collected gems. Click Start. Use A/D or Left/Right to move, Space/W/Up to jump, and Escape to pause. Touch controls are below.</p>
    <canvas ref={canvas} width={800} height={400} tabIndex={0}
      aria-label="Playable platformer level" aria-describedby="instructions"
      onBlur={pause}
      onKeyDown={(event) => {
        if (event.code === "Escape") { event.preventDefault(); pause(); return; }
        const input = action(event.code);
        if (!input) return;
        event.preventDefault();
        if (!running.current) return;
        if (input === "jump") { if (!event.repeat) jump.current = true; }
        else keys.current.add(input);
      }}
      onKeyUp={(event) => {
        const input = action(event.code);
        if (input) event.preventDefault();
        keys.current.delete(input);
      }}>
      This prototype requires canvas support. The saved design remains available in Game Studio.
    </canvas>
    <div className={styles.touch} aria-label="Touch game controls">
      {["left", "right", "jump"].map((input) => (
        <button key={input} disabled={status !== "playing"}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            if (!running.current) return;
            touches.current.set(event.pointerId, input);
            if (input === "jump") jump.current = true;
          }}
          onPointerUp={(event) => touches.current.delete(event.pointerId)}
          onPointerCancel={(event) => touches.current.delete(event.pointerId)}
          onLostPointerCapture={(event) => touches.current.delete(event.pointerId)}
          onKeyDown={(event) => {
            if (["Enter", " "].includes(event.key) && running.current) {
              event.preventDefault();
              if (input === "jump") { if (!event.repeat) jump.current = true; }
              else keys.current.add(input);
            }
          }}
          onKeyUp={() => keys.current.delete(input)}
          onBlur={() => keys.current.delete(input)}
        >{input === "left" ? "Move left" : input === "right" ? "Move right" : "Jump"}</button>
      ))}
    </div>
    <p>Play progress lasts for this visit only. Restart resets gems and position. Switching tabs pauses play.</p>
  </>;
}
