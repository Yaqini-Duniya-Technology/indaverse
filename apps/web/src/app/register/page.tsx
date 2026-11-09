"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getRegistrationPolicy, registerUser } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteRequired, setInviteRequired] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getRegistrationPolicy(controller.signal).then(({ invite_required }) => {
      if (!controller.signal.aborted) setInviteRequired(invite_required);
    }).catch(() => {
      // Keep the optional code field available if the policy could not load.
    });
    return () => controller.abort();
  }, []);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      await registerUser({
        email,
        username,
        password,
        ...(inviteCode.trim() ? { invite_code: inviteCode.trim() } : {}),
      });

      router.push("/login");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Registration failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-12 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            IndaVerse
          </h1>

          <p className="mt-3 text-zinc-400">
            Create. Publish. Connect.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">
              Create your account
            </h2>

            <p className="mt-2 text-sm text-zinc-400">
              Start creating your world on IndaVerse.
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none transition focus:border-white"
              />
            </div>

            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Username
              </label>

              <input
                id="username"
                type="text"
                required
                minLength={3}
                maxLength={50}
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value)
                }
                placeholder="yourusername"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none transition focus:border-white"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none transition focus:border-white"
              />
            </div>

            {inviteRequired !== false && (
              <div>
                <label htmlFor="invite-code" className="mb-2 block text-sm font-medium text-zinc-300">
                  Beta invitation code{inviteRequired === null ? " (if you received one)" : ""}
                </label>
                <input
                  id="invite-code"
                  type="password"
                  autoComplete="off"
                  required={inviteRequired === true}
                  maxLength={64}
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  aria-describedby="invite-hint"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none transition focus:border-white"
                />
                <p id="invite-hint" className="mt-2 text-sm text-zinc-400">
                  Use the email address your invitation was sent to.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-white px-4 py-3 font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Creating account..."
                : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-400">
            Already have an account?{" "}
            <a
              href="/login"
              className="font-medium text-white hover:underline"
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
