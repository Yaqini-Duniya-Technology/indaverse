"use client";
import StudioWorkbench from "@/components/StudioWorkbench";

import GenerationHistory from "./GenerationHistory";

import SongHistory from "./SongHistory";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  getCurrentUser,
  type User,
} from "@/lib/auth";

import {
  getProject,
  type Project,
} from "@/lib/projects";

import {
  API_URL,
  createMusicProject,
  deleteAudio,
  deleteMusicProject,
  generateMusic,
  getMusicProject,
  getProjectAudio,
  updateMusicProject,
  uploadAudio,
  type MusicProject,
  type UploadedAudio,
} from "@/lib/music";

/* =========================================================
   MUSIC STUDIO PAGE
   ========================================================= */

export default function MusicStudioPage() {
  const router = useRouter();
  const params = useParams();

  const projectId = Number(params.id);

  /* =======================================================
     GENERAL STATE
     ======================================================= */

  const [user, setUser] =
    useState<User | null>(null);

  const [project, setProject] =
    useState<Project | null>(null);

  const [musicProject, setMusicProject] =
    useState<MusicProject | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  /* =======================================================
     AUDIO STATE
     ======================================================= */

  const [uploadingAudio, setUploadingAudio] =
    useState(false);

  const [deletingAudioId, setDeletingAudioId] =
    useState<number | null>(null);

  const [audioFile, setAudioFile] =
    useState<File | null>(null);

  const [audioAssets, setAudioAssets] =
    useState<UploadedAudio[]>([]);

  /* =======================================================
     MUSIC GENERATION STATE
     ======================================================= */

  const [generationPrompt, setGenerationPrompt] =
    useState("");

  const [generationType, setGenerationType] =
    useState<"vocal" | "instrumental">(
      "vocal",
    );

  const [generationLanguage, setGenerationLanguage] =
    useState("English");

  const [generationGenre, setGenerationGenre] =
    useState("");

  const [generationMood, setGenerationMood] =
    useState("");

  const [generationBpm, setGenerationBpm] =
    useState("");

  const [generationStatus, setGenerationStatus] =
    useState<
      "idle" | "preparing" | "unavailable"
    >("idle");

  /* =======================================================
     SONG INFORMATION
     ======================================================= */

  const [title, setTitle] =
    useState("");

  const [artist, setArtist] =
    useState("");

  const [genre, setGenre] =
    useState("");

  const [mood, setMood] =
    useState("");

  const [bpm, setBpm] =
    useState("");

  /* =======================================================
     LYRICS
     ======================================================= */

  const [lyricsIntro, setLyricsIntro] =
    useState("");

  const [lyricsVerse1, setLyricsVerse1] =
    useState("");

  const [lyricsChorus, setLyricsChorus] =
    useState("");

  const [lyricsVerse2, setLyricsVerse2] =
    useState("");

  const [lyricsBridge, setLyricsBridge] =
    useState("");

  const [lyricsOutro, setLyricsOutro] =
    useState("");

  /* =======================================================
     BUILD AUDIO URL
     ======================================================= */

  function buildAudioUrl(audioId: number): string {
    return `${API_URL}/api/v1/projects/${projectId}/audio/${audioId}/content`;
  }

  /* =======================================================
     FORMAT FILE SIZE
     ======================================================= */

  function formatFileSize(
    bytes: number,
  ): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    if (bytes < 1024 * 1024 * 1024) {
      return `${(
        bytes /
        1024 /
        1024
      ).toFixed(2)} MB`;
    }

    return `${(
      bytes /
      1024 /
      1024 /
      1024
    ).toFixed(2)} GB`;
  }

  /* =======================================================
     FORMAT UPLOAD DATE
     ======================================================= */

  function formatUploadDate(
    dateString: string,
  ): string {
    const date =
      new Date(dateString);

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return "Unknown date";
    }

    return date.toLocaleString();
  }

  /* =======================================================
     LOAD MUSIC PROJECT + AUDIO
     ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadStudio() {
      try {
        setLoading(true);
        setError("");
        setSuccess("");

        if (
          !projectId ||
          Number.isNaN(projectId)
        ) {
          throw new Error(
            "Invalid project ID.",
          );
        }

        /* -----------------------------------------------
           Load user + project
        ------------------------------------------------ */

        const [
          currentUser,
          currentProject,
        ] = await Promise.all([
          getCurrentUser(),
          getProject(projectId),
        ]);

        if (cancelled) {
          return;
        }

        if (
          currentProject.project_type !==
          "music"
        ) {
          throw new Error(
            "This project is not configured as a music project.",
          );
        }

        setUser(currentUser);
        setProject(currentProject);

        /* -----------------------------------------------
           Load music project
        ------------------------------------------------ */

        try {
          const existingMusic =
            await getMusicProject(
              projectId,
            );

          if (cancelled) {
            return;
          }

          setMusicProject(
            existingMusic,
          );

          setTitle(
            existingMusic.title,
          );

          setArtist(
            existingMusic.artist ?? "",
          );

          setGenre(
            existingMusic.genre ?? "",
          );

          setMood(
            existingMusic.mood ?? "",
          );

          setBpm(
            existingMusic.bpm !== null
              ? String(
                  existingMusic.bpm,
                )
              : "",
          );

          setLyricsIntro(
            existingMusic.lyrics_intro ??
              "",
          );

          setLyricsVerse1(
            existingMusic.lyrics_verse_1 ??
              "",
          );

          setLyricsChorus(
            existingMusic.lyrics_chorus ??
              "",
          );

          setLyricsVerse2(
            existingMusic.lyrics_verse_2 ??
              "",
          );

          setLyricsBridge(
            existingMusic.lyrics_bridge ??
              "",
          );

          setLyricsOutro(
            existingMusic.lyrics_outro ??
              "",
          );

          /* ---------------------------------------------
             Use saved song settings as generation defaults
          ---------------------------------------------- */

          setGenerationGenre(
            existingMusic.genre ?? "",
          );

          setGenerationMood(
            existingMusic.mood ?? "",
          );

          setGenerationBpm(
            existingMusic.bpm !== null
              ? String(
                  existingMusic.bpm,
                )
              : "",
          );
        } catch {
          /*
           * No music record yet.
           * This is normal for a new music project.
           */

          if (cancelled) {
            return;
          }

          setMusicProject(null);

          setTitle(
            currentProject.name,
          );
        }

        /* -----------------------------------------------
           Load persisted audio library
        ------------------------------------------------ */

        try {
          const existingAudio =
            await getProjectAudio(
              projectId,
            );

          if (cancelled) {
            return;
          }

          setAudioAssets(
            existingAudio,
          );
        } catch (audioError) {
          console.warn(
            "Unable to load project audio:",
            audioError,
          );

          if (!cancelled) {
            setAudioAssets([]);
          }
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load Music Studio.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStudio();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /* =======================================================
     GENERATION PROMPT BUILDER
     ======================================================= */

  function buildGenerationPrompt(): string {
    const parts: string[] = [];

    if (generationPrompt.trim()) {
      parts.push(
        generationPrompt.trim(),
      );
    }

    if (generationGenre.trim()) {
      parts.push(
        `Genre: ${generationGenre.trim()}`,
      );
    }

    if (generationMood.trim()) {
      parts.push(
        `Mood: ${generationMood.trim()}`,
      );
    }

    if (generationBpm.trim()) {
      parts.push(
        `BPM: ${generationBpm.trim()}`,
      );
    }

    parts.push(
      `Language: ${generationLanguage}`,
    );

    parts.push(
      `Output: ${
        generationType === "vocal"
          ? "Vocal song"
          : "Instrumental"
      }`,
    );

    return parts.join("\n");
  }

  /* =======================================================
     GENERATE MUSIC
     ======================================================= */

  async function handleGenerateMusic() {
  if (generationStatus === "preparing") {
    return;
  }

  const prompt = generationPrompt.trim();

  if (!prompt) {
    setError(
      "Describe the music you want to create before generating.",
    );

    setSuccess("");

    return;
  }

  /* -----------------------------------------------
     Validate BPM
  ------------------------------------------------ */

  const numericBpm = generationBpm.trim()
    ? Number(generationBpm)
    : undefined;

  if (
    numericBpm !== undefined &&
    (!Number.isInteger(numericBpm) ||
      numericBpm < 1 ||
      numericBpm > 300)
  ) {
    setError(
      "Generation BPM must be a whole number between 1 and 300.",
    );

    setSuccess("");

    return;
  }

  setError("");
  setSuccess("");
  setGenerationStatus("preparing");

  try {
    const result = await generateMusic(
      projectId,
      {
        prompt,
        output_type: generationType,
        language: generationLanguage,
        genre: generationGenre.trim() || undefined,
        mood: generationMood.trim() || undefined,
        bpm: numericBpm,
      },
    );

    if (result.status === "unavailable") {
      setGenerationStatus("unavailable");

      setError(
        result.error_message ||
          "Music generation provider is not available.",
      );

      return;
    }

    if (result.status === "failed") {
      setGenerationStatus("idle");

      setError(
        result.error_message ||
          "Music generation failed.",
      );

      return;
    }

    setGenerationStatus("idle");

    setSuccess(
      "Music generation request submitted successfully.",
    );
  } catch (err) {
    setGenerationStatus("idle");

    setError(
      err instanceof Error
        ? err.message
        : "Music generation request failed.",
    );
  }
}
  /* =======================================================
     SAVE SONG
     ======================================================= */

  async function handleSave() {
    if (
      saving ||
      deleting ||
      uploadingAudio ||
      deletingAudioId !== null ||
      generationStatus === "preparing"
    ) {
      return;
    }

    const trimmedTitle =
      title.trim();

    if (!trimmedTitle) {
      setSuccess("");
      setError(
        "Song title is required.",
      );
      return;
    }

    const numericBpm =
      bpm.trim()
        ? Number(bpm)
        : undefined;

    if (
      numericBpm !== undefined &&
      (!Number.isInteger(
        numericBpm,
      ) ||
        numericBpm < 1 ||
        numericBpm > 300)
    ) {
      setSuccess("");

      setError(
        "BPM must be a whole number between 1 and 300.",
      );

      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const data = {
        title: trimmedTitle,

        artist:
          artist.trim() || undefined,

        genre:
          genre.trim() || undefined,

        mood:
          mood.trim() || undefined,

        bpm: numericBpm,

        lyrics_intro:
          lyricsIntro,

        lyrics_verse_1:
          lyricsVerse1,

        lyrics_chorus:
          lyricsChorus,

        lyrics_verse_2:
          lyricsVerse2,

        lyrics_bridge:
          lyricsBridge,

        lyrics_outro:
          lyricsOutro,
      };

      const savedMusicProject =
        musicProject !== null
          ? await updateMusicProject(
              projectId,
              data,
              musicProject.updated_at,
            )
          : await createMusicProject(
              projectId,
              data,
            );

      setMusicProject(
        savedMusicProject,
      );

      setTitle(
        savedMusicProject.title,
      );

      setArtist(
        savedMusicProject.artist ??
          "",
      );

      setGenre(
        savedMusicProject.genre ??
          "",
      );

      setMood(
        savedMusicProject.mood ??
          "",
      );

      setBpm(
        savedMusicProject.bpm !== null
          ? String(
              savedMusicProject.bpm,
            )
          : "",
      );

      setLyricsIntro(
        savedMusicProject.lyrics_intro ??
          "",
      );

      setLyricsVerse1(
        savedMusicProject.lyrics_verse_1 ??
          "",
      );

      setLyricsChorus(
        savedMusicProject.lyrics_chorus ??
          "",
      );

      setLyricsVerse2(
        savedMusicProject.lyrics_verse_2 ??
          "",
      );

      setLyricsBridge(
        savedMusicProject.lyrics_bridge ??
          "",
      );

      setLyricsOutro(
        savedMusicProject.lyrics_outro ??
          "",
      );

      setGenerationGenre(
        savedMusicProject.genre ??
          "",
      );

      setGenerationMood(
        savedMusicProject.mood ??
          "",
      );

      setGenerationBpm(
        savedMusicProject.bpm !== null
          ? String(
              savedMusicProject.bpm,
            )
          : "",
      );

      setSuccess(
        "Song saved successfully! Your changes are now stored in the database.",
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (err) {
      setSuccess("");

      setError(
        err instanceof Error
          ? err.message
          : "Failed to save song.",
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     DELETE SONG
     ======================================================= */

  async function handleDelete() {
    if (
      deleting ||
      saving ||
      uploadingAudio ||
      deletingAudioId !== null ||
      !musicProject
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Are you sure you want to delete this music project? This action cannot be undone.",
      );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");
    setSuccess("");

    try {
      await deleteMusicProject(
        projectId,
      );

      setMusicProject(null);

      setTitle(
        project?.name ?? "",
      );

      setArtist("");
      setGenre("");
      setMood("");
      setBpm("");

      setLyricsIntro("");
      setLyricsVerse1("");
      setLyricsChorus("");
      setLyricsVerse2("");
      setLyricsBridge("");
      setLyricsOutro("");

      setGenerationPrompt("");
      setGenerationGenre("");
      setGenerationMood("");
      setGenerationBpm("");

      setSuccess(
        "Music project deleted successfully.",
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete music project.",
      );
    } finally {
      setDeleting(false);
    }
  }

  /* =======================================================
     AUDIO FILE SELECTION
     ======================================================= */

  function handleAudioFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile =
      event.target.files?.[0] ??
      null;

    setAudioFile(
      selectedFile,
    );

    setError("");
    setSuccess("");
  }

  /* =======================================================
     AUDIO UPLOAD
     ======================================================= */

  async function handleAudioUpload() {
    if (
      uploadingAudio ||
      saving ||
      deleting ||
      deletingAudioId !== null ||
      !audioFile
    ) {
      return;
    }

    const MAX_AUDIO_SIZE =
      50 * 1024 * 1024;

    if (
      audioFile.size >
      MAX_AUDIO_SIZE
    ) {
      setError(
        "Audio file is too large. Maximum size is 50 MB.",
      );

      setSuccess("");

      return;
    }

    const allowedTypes = [
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
      "audio/ogg",
      "audio/webm",
    ];

    if (
      audioFile.type &&
      !allowedTypes.includes(
        audioFile.type,
      )
    ) {
      setError(
        "Unsupported audio format. Please use MP3, WAV, M4A, OGG or WebM.",
      );

      setSuccess("");

      return;
    }

    setUploadingAudio(true);
    setError("");
    setSuccess("");

    try {
      const uploaded =
        await uploadAudio(
          projectId,
          audioFile,
        );

      setAudioAssets(
        (currentAssets) => [
          ...currentAssets,
          uploaded,
        ],
      );

      setAudioFile(null);

      setSuccess(
        "Audio uploaded successfully and added to your Audio Library.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to upload audio.",
      );

      setSuccess("");
    } finally {
      setUploadingAudio(false);
    }
  }

  /* =======================================================
     DELETE AUDIO
     ======================================================= */

  async function handleDeleteAudio(
    audio: UploadedAudio,
  ) {
    if (
      deletingAudioId !== null ||
      uploadingAudio ||
      saving ||
      deleting
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${audio.original_filename}"? This action cannot be undone.`,
      );

    if (!confirmed) {
      return;
    }

    setDeletingAudioId(
      audio.id,
    );

    setError("");
    setSuccess("");

    try {
      await deleteAudio(
        projectId,
        audio.id,
      );

      setAudioAssets(
        (currentAssets) =>
          currentAssets.filter(
            (item) =>
              item.id !== audio.id,
          ),
      );

      setSuccess(
        "Audio deleted successfully.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete audio.",
      );
    } finally {
      setDeletingAudioId(null);
    }
  }

  /* =======================================================
     LOADING SCREEN
     ======================================================= */

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-zinc-400">
          Loading Music Studio...
        </p>
      </main>
    );
  }

  /* =======================================================
     PROJECT LOAD ERROR
     ======================================================= */

  if (
    error &&
    !project
  ) {
    return (
      <main className="min-h-screen bg-black px-6 py-10 text-white">
        <div className="mx-auto max-w-5xl">
          <button
            type="button"
            onClick={() =>
              router.push(
                `/projects/${projectId}`,
              )
            }
            className="mb-8 text-sm text-zinc-500 transition hover:text-white"
          >
            ← Back to Project
          </button>

          <div className="rounded-2xl border border-red-900/50 bg-red-950/20 p-6">
            <h1 className="text-xl font-semibold text-red-400">
              Unable to open Music Studio
            </h1>

            <p className="mt-2 text-sm text-zinc-400">
              {error}
            </p>
          </div>
        </div>
      </main>
    );
  }

  /* =======================================================
     MAIN PAGE
     ======================================================= */

  return (
    <main className="min-h-screen bg-black text-white">

      {/* ===================================================
          HEADER
      =================================================== */}

      <section className="border-b border-zinc-900">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/projects/${projectId}`,
                  )
                }
                className="mb-5 text-sm text-zinc-500 transition hover:text-white"
              >
                ← Back to Project
              </button>

              <p className="text-sm text-zinc-500">
                IndaVerse
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Music Studio
              </h1>

              <p className="mt-2 text-sm text-zinc-400">
                Create, edit, generate and
                manage music inside your
                IndaVerse project.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-zinc-600">
                Project
              </p>

              <p className="mt-1 text-sm font-medium">
                {project?.name}
              </p>

              {user && (
                <p className="mt-1 text-xs text-zinc-600">
                  @{user.username}
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-400">
              {success}
            </div>
          )}
        </div>
      </section>
      <div className="mx-auto max-w-5xl px-6">
        <StudioWorkbench kind="music" projectId={projectId} version={0}
          savedLabel={musicProject ? `Saved song loaded / ${new Date(musicProject.updated_at).toLocaleString()}` : "No saved song yet"}
          data={{ title, artist, genre, mood, bpm, lyrics_intro: lyricsIntro,
            lyrics_verse_1: lyricsVerse1, lyrics_chorus: lyricsChorus,
            lyrics_verse_2: lyricsVerse2, lyrics_bridge: lyricsBridge, lyrics_outro: lyricsOutro }} />
      </div>

      {/* ===================================================
          CONTENT
      =================================================== */}

      <section className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-6">

          {/* =================================================
              AI MUSIC GENERATION
          ================================================= */}

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">
                    AI Music Generation
                  </h2>

                  <span className="rounded-full border border-zinc-800 bg-black px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Provider Ready
                  </span>
                </div>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                  Describe the music you want to
                  create. These settings will become
                  the generation request sent to the
                  selected AI music provider.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-5">

              {/* ---------------------------------------------
                  PROMPT
              ---------------------------------------------- */}

              <div>
                <label
                  htmlFor="generation-prompt"
                  className="mb-2 block text-sm font-medium"
                >
                  Music Prompt
                </label>

                <textarea
                  id="generation-prompt"
                  value={generationPrompt}
                  onChange={(event) =>
                    setGenerationPrompt(
                      event.target.value,
                    )
                  }
                  placeholder="Describe the song you want to create. Example: An uplifting African Afrobeats song about courage, heritage and finding your purpose..."
                  rows={5}
                  disabled={
                    generationStatus ===
                    "preparing"
                  }
                  className="w-full resize-y rounded-xl border border-zinc-800 bg-black px-4 py-4 text-sm leading-6 outline-none placeholder:text-zinc-700 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                />

                <p className="mt-2 text-xs text-zinc-700">
                  Be specific about the story,
                  instruments, energy, vocals and
                  atmosphere you want.
                </p>
              </div>

              {/* ---------------------------------------------
                  OUTPUT TYPE
              ---------------------------------------------- */}

              <div>
                <p className="mb-3 text-sm font-medium">
                  Output Type
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setGenerationType(
                        "vocal",
                      )
                    }
                    disabled={
                      generationStatus ===
                      "preparing"
                    }
                    className={`rounded-xl border p-4 text-left transition ${
                      generationType ===
                      "vocal"
                        ? "border-zinc-500 bg-zinc-900"
                        : "border-zinc-800 bg-black hover:border-zinc-700"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <p className="text-sm font-semibold">
                      🎤 Vocal Song
                    </p>

                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      Generate music with vocals
                      and a complete song
                      arrangement.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setGenerationType(
                        "instrumental",
                      )
                    }
                    disabled={
                      generationStatus ===
                      "preparing"
                    }
                    className={`rounded-xl border p-4 text-left transition ${
                      generationType ===
                      "instrumental"
                        ? "border-zinc-500 bg-zinc-900"
                        : "border-zinc-800 bg-black hover:border-zinc-700"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <p className="text-sm font-semibold">
                      🎹 Instrumental
                    </p>

                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      Generate an instrumental
                      backing track without
                      vocals.
                    </p>
                  </button>
                </div>
              </div>

              {/* ---------------------------------------------
                  GENERATION SETTINGS
              ---------------------------------------------- */}

              <div className="grid gap-5 sm:grid-cols-2">

                <InputField
                  id="generation-genre"
                  label="Genre"
                  value={generationGenre}
                  onChange={
                    setGenerationGenre
                  }
                  placeholder="e.g. Afrobeats"
                />

                <InputField
                  id="generation-mood"
                  label="Mood"
                  value={generationMood}
                  onChange={
                    setGenerationMood
                  }
                  placeholder="e.g. Energetic"
                />

                <div>
                  <label
                    htmlFor="generation-language"
                    className="mb-2 block text-sm font-medium"
                  >
                    Language
                  </label>

                  <select
                    id="generation-language"
                    value={
                      generationLanguage
                    }
                    onChange={(event) =>
                      setGenerationLanguage(
                        event.target.value,
                      )
                    }
                    disabled={
                      generationStatus ===
                      "preparing"
                    }
                    className="w-full rounded-lg border border-zinc-800 bg-black px-4 py-3 text-sm outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option>
                      English
                    </option>

                    <option>
                      Yoruba
                    </option>

                    <option>
                      Igbo
                    </option>

                    <option>
                      Hausa
                    </option>

                    <option>
                      Ebira
                    </option>

                    <option>
                      Pidgin English
                    </option>

                    <option>
                      French
                    </option>

                    <option>
                      Arabic
                    </option>

                    <option>
                      Spanish
                    </option>

                    <option>
                      Other
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="generation-bpm"
                    className="mb-2 block text-sm font-medium"
                  >
                    BPM
                  </label>

                  <input
                    id="generation-bpm"
                    type="number"
                    min="1"
                    max="300"
                    value={generationBpm}
                    onChange={(event) =>
                      setGenerationBpm(
                        event.target.value,
                      )
                    }
                    placeholder="e.g. 100"
                    disabled={
                      generationStatus ===
                      "preparing"
                    }
                    className="w-full rounded-lg border border-zinc-800 bg-black px-4 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              {/* ---------------------------------------------
                  GENERATION SUMMARY
              ---------------------------------------------- */}

              <div className="rounded-xl border border-zinc-800 bg-black p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Generation Request
                </p>

                <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                  {buildGenerationPrompt()}
                </pre>
              </div>

              {/* ---------------------------------------------
                  GENERATE BUTTON
              ---------------------------------------------- */}

              <button
                type="button"
                onClick={
                  handleGenerateMusic
                }
                disabled={
                  generationStatus ===
                  "preparing"
                }
                className="w-full rounded-xl bg-white px-6 py-4 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generationStatus ===
                "preparing"
                  ? "Preparing Generation..."
                  : "Generate Music"}
              </button>

              {/* ---------------------------------------------
                  PROVIDER STATUS
              ---------------------------------------------- */}

              {generationStatus ===
                "unavailable" && (
                <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-lg">
                      ◐
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-amber-400">
                        AI provider integration
                        pending
                      </p>

                      <p className="mt-1 text-sm leading-6 text-zinc-500">
                        The Music Studio generation
                        interface is ready. The
                        provider-independent backend
                        will connect this request to
                        an actual music generation
                        provider next.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* =================================================
              SONG INFORMATION
          ================================================= */}

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-semibold">
              Song Information
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Configure the basic information
              for your song.
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <InputField
                id="song-title"
                label="Song Title"
                value={title}
                onChange={setTitle}
                placeholder="Enter song title"
              />

              <InputField
                id="artist"
                label="Artist"
                value={artist}
                onChange={setArtist}
                placeholder="Artist name"
              />

              <InputField
                id="genre"
                label="Genre"
                value={genre}
                onChange={setGenre}
                placeholder="e.g. Afrobeats"
              />

              <InputField
                id="mood"
                label="Mood"
                value={mood}
                onChange={setMood}
                placeholder="e.g. Energetic"
              />

              <div>
                <label
                  htmlFor="bpm"
                  className="mb-2 block text-sm font-medium"
                >
                  BPM
                </label>

                <input
                  id="bpm"
                  type="number"
                  min="1"
                  max="300"
                  value={bpm}
                  onChange={(event) =>
                    setBpm(
                      event.target.value,
                    )
                  }
                  placeholder="e.g. 100"
                  className="w-full rounded-lg border border-zinc-800 bg-black px-4 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-zinc-500"
                />
              </div>
            </div>
          </section>

          {/* =================================================
              AUDIO LIBRARY
          ================================================= */}

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  Audio Library
                </h2>

                <p className="mt-2 text-sm text-zinc-500">
                  Upload and manage audio tracks
                  for this music project.
                </p>
              </div>

              <div className="w-fit rounded-full border border-zinc-800 bg-black px-3 py-1.5 text-xs text-zinc-500">
                {audioAssets.length}{" "}
                {audioAssets.length === 1
                  ? "track"
                  : "tracks"}
              </div>
            </div>

            <div className="mt-6 space-y-5">

              {/* ---------------------------------------------
                  FILE INPUT
              ---------------------------------------------- */}

              <div>
                <label
                  htmlFor="audio-file"
                  className="mb-2 block text-sm font-medium"
                >
                  Select Audio File
                </label>

                <input
                  id="audio-file"
                  type="file"
                  accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/webm"
                  onChange={
                    handleAudioFileChange
                  }
                  disabled={
                    uploadingAudio ||
                    saving ||
                    deleting ||
                    deletingAudioId !== null
                  }
                  className="block w-full rounded-lg border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-400 file:mr-4 file:rounded-md file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
                />
              </div>

              {/* ---------------------------------------------
                  SELECTED FILE
              ---------------------------------------------- */}

              {audioFile && (
                <div className="rounded-lg border border-zinc-800 bg-black p-4">
                  <p className="text-sm font-medium">
                    Selected audio
                  </p>

                  <p className="mt-1 break-all text-sm text-zinc-500">
                    {audioFile.name}
                  </p>

                  <p className="mt-1 text-xs text-zinc-600">
                    {formatFileSize(
                      audioFile.size,
                    )}
                  </p>
                </div>
              )}

              {/* ---------------------------------------------
                  UPLOAD BUTTON
              ---------------------------------------------- */}

              <button
                type="button"
                onClick={
                  handleAudioUpload
                }
                disabled={
                  !audioFile ||
                  uploadingAudio ||
                  saving ||
                  deleting ||
                  deletingAudioId !== null
                }
                className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploadingAudio
                  ? "Uploading..."
                  : "Upload Track"}
              </button>

              {/* ---------------------------------------------
                  AUDIO LIBRARY LIST
              ---------------------------------------------- */}

              {audioAssets.length > 0 ? (
                <div className="space-y-4">
                  <div className="border-t border-zinc-900 pt-5">
                    <h3 className="text-sm font-semibold text-zinc-300">
                      Your Tracks
                    </h3>

                    <p className="mt-1 text-xs text-zinc-600">
                      Every uploaded track is
                      stored with this project and
                      restored after refresh.
                    </p>
                  </div>

                  {audioAssets.map(
                    (audio, index) => {
                      const audioUrl =
                        buildAudioUrl(
                          audio.id,
                        );

                      const isDeleting =
                        deletingAudioId ===
                        audio.id;

                      return (
                        <div
                          key={audio.id}
                          className="rounded-xl border border-zinc-800 bg-black p-5"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-xs text-zinc-500">
                                  {index + 1}
                                </span>

                                <p className="break-all text-sm font-semibold">
                                  {
                                    audio.original_filename
                                  }
                                </p>
                              </div>

                              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                                <span>
                                  {formatFileSize(
                                    audio.file_size,
                                  )}
                                </span>

                                <span>
                                  {
                                    audio.mime_type
                                  }
                                </span>

                                <span>
                                  Uploaded{" "}
                                  {formatUploadDate(
                                    audio.created_at,
                                  )}
                                </span>
                              </div>
                            </div>

                            <span className="w-fit shrink-0 rounded-full border border-emerald-900/50 bg-emerald-950/20 px-3 py-1 text-xs text-emerald-400">
                              Saved
                            </span>
                          </div>

                          <audio
                            crossOrigin="use-credentials"
                            controls
                            preload="metadata"
                            src={audioUrl}
                            className="mt-5 w-full"
                          >
                            Your browser does not
                            support audio playback.
                          </audio>

                          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-zinc-700">
                              Stored securely with
                              this project.
                            </p>

                            <div className="flex flex-col gap-2 sm:flex-row">
                              <a
                                href={audioUrl}
                                download={
                                  audio.original_filename
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg border border-zinc-800 px-4 py-2 text-center text-xs font-semibold text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900 hover:text-white"
                              >
                                Download
                              </a>

                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteAudio(
                                    audio,
                                  )
                                }
                                disabled={
                                  isDeleting ||
                                  deletingAudioId !==
                                    null ||
                                  uploadingAudio ||
                                  saving ||
                                  deleting
                                }
                                className="rounded-lg border border-red-900/70 px-4 py-2 text-xs font-semibold text-red-400 transition hover:border-red-700 hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isDeleting
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              ) : (
                !uploadingAudio && (
                  <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-black text-xl text-zinc-600">
                      ♪
                    </div>

                    <p className="mt-4 text-sm font-medium text-zinc-400">
                      Your Audio Library is empty
                    </p>

                    <p className="mt-1 text-xs text-zinc-700">
                      Upload your first audio
                      track to start building this
                      project.
                    </p>
                  </div>
                )
              )}

              {uploadingAudio && (
                <div className="rounded-xl border border-zinc-800 bg-black p-5">
                  <p className="text-sm font-medium">
                    Uploading audio...
                  </p>

                  <p className="mt-1 text-xs text-zinc-600">
                    Please wait while your track is
                    stored.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* =================================================
              LYRICS
          ================================================= */}

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-semibold">
              Lyrics
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Build your song section by
              section.
            </p>

            <div className="mt-6 space-y-6">
              <LyricsEditor
                label="Intro"
                value={lyricsIntro}
                onChange={
                  setLyricsIntro
                }
                placeholder="Write your intro..."
              />

              <LyricsEditor
                label="Verse 1"
                value={lyricsVerse1}
                onChange={
                  setLyricsVerse1
                }
                placeholder="Write Verse 1..."
              />

              <LyricsEditor
                label="Chorus"
                value={lyricsChorus}
                onChange={
                  setLyricsChorus
                }
                placeholder="Write your chorus..."
              />

              <LyricsEditor
                label="Verse 2"
                value={lyricsVerse2}
                onChange={
                  setLyricsVerse2
                }
                placeholder="Write Verse 2..."
              />

              <LyricsEditor
                label="Bridge"
                value={lyricsBridge}
                onChange={
                  setLyricsBridge
                }
                placeholder="Write your bridge..."
              />

              <LyricsEditor
                label="Outro"
                value={lyricsOutro}
                onChange={
                  setLyricsOutro
                }
                placeholder="Write your outro..."
              />
            </div>
          </section>

          {/* =================================================
              SAVE / DELETE
          ================================================= */}

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">
                  Save your song
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Your song information and
                  lyrics are stored in the
                  IndaVerse database.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                {musicProject && (
                  <button
                    type="button"
                    onClick={
                      handleDelete
                    }
                    disabled={
                      deleting ||
                      saving ||
                      uploadingAudio ||
                      deletingAudioId !==
                        null ||
                      generationStatus ===
                        "preparing"
                    }
                    className="rounded-lg border border-red-900 px-6 py-3 text-sm font-semibold text-red-400 transition hover:border-red-700 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deleting
                      ? "Deleting..."
                      : "Delete Song"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={
                    saving ||
                    deleting ||
                    uploadingAudio ||
                    deletingAudioId !==
                      null ||
                    generationStatus ===
                      "preparing"
                  }
                  className="min-w-32 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : "Save Song"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>

      {/* Restored song history integration */}
      <SongHistory
        key={`${projectId}:${musicProject?.updated_at ?? "no-song"}`}
        projectId={projectId}
        disabled={saving || deleting}
        onLoad={(revision) => {
          if (saving || deleting) return;
          if (!window.confirm(
            "Load this revision into the editor? This replaces your current draft. Copy any unsaved work first. The saved song changes only when you choose Save Song."
          )) return;

          const song = revision.snapshot;
          setTitle(song.title);
          setArtist(song.artist ?? "");
          setGenre(song.genre ?? "");
          setMood(song.mood ?? "");
          setBpm(song.bpm === null ? "" : String(song.bpm));
          setLyricsIntro(song.lyrics_intro ?? "");
          setLyricsVerse1(song.lyrics_verse_1 ?? "");
          setLyricsChorus(song.lyrics_chorus ?? "");
          setLyricsVerse2(song.lyrics_verse_2 ?? "");
          setLyricsBridge(song.lyrics_bridge ?? "");
          setLyricsOutro(song.lyrics_outro ?? "");
          setError("");
          setSuccess(
            `Revision #${revision.id} loaded as an unsaved draft. Choose Save Song to keep it.`
          );
          // Keep musicProject and its current save-protection timestamp.
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      {/* Restored generation history integration */}
      <GenerationHistory
        key={projectId}
        projectId={projectId}
        generationStatus={generationStatus}
        reuseDisabled={saving || deleting || generationStatus === "preparing"}
        onReuse={(job) => {
          if (saving || deleting || generationStatus === "preparing") return;
          if (job.output_type !== "vocal" && job.output_type !== "instrumental") {
            setError("This request uses an unsupported output type.");
            return;
          }
          if (!window.confirm(
            "Replace your current generation settings with this saved request? This will not start generation."
          )) return;

          setGenerationPrompt(job.prompt);
          setGenerationType(job.output_type);
          setGenerationLanguage(job.language);
          setGenerationGenre(job.genre ?? "");
          setGenerationMood(job.mood ?? "");
          setGenerationBpm(job.bpm === null ? "" : String(job.bpm));
          setError("");
          setSuccess(
            `Request #${job.id} settings loaded. Review them before choosing Generate.`
          );
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </main>
  );
}

/* =========================================================
   INPUT FIELD
   ========================================================= */

function InputField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (
    value: string,
  ) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium"
      >
        {label}
      </label>

      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-800 bg-black px-4 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-zinc-500"
      />
    </div>
  );
}

/* =========================================================
   LYRICS EDITOR
   ========================================================= */

function LyricsEditor({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (
    value: string,
  ) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        placeholder={placeholder}
        rows={6}
        className="w-full resize-y rounded-xl border border-zinc-800 bg-black px-4 py-4 text-sm leading-6 outline-none placeholder:text-zinc-700 focus:border-zinc-500"
      />
    </div>
  );
}
