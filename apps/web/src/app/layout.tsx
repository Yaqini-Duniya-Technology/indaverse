import type { Metadata } from "next";
import "./globals.css";
import WorkspaceHelp from "@/components/WorkspaceHelp";

export const metadata: Metadata = {
  title: "IndaVerse",
  description: "The creative intelligence platform by IndaVerse.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}<WorkspaceHelp /></body>
    </html>
  );
}
