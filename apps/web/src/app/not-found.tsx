import Link from "next/link";
export default function NotFound() {
  return <main className="min-h-screen bg-zinc-950 p-8 text-white"><h1 className="text-3xl">This page is not available.</h1>
    <p className="my-5">Check the address or open a project from your dashboard.</p><Link className="underline" href="/dashboard">Return to dashboard</Link></main>;
}
