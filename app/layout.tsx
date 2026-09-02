import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-jortal.png`;

  return {
    title: "Jortal — Five-Letter Word Guessing Game",
    description:
      "Play Jortal in Daily, Solo, or turn-based Rival mode, track your stats, and challenge friends.",
    openGraph: {
      title: "Jortal — Crack the Five-Letter Word",
      description: "Challenge a friend, compare results, and climb your Jortal stats.",
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "Jortal word game" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Jortal — Crack the Five-Letter Word",
      description: "Challenge a friend, compare results, and climb your Jortal stats.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
