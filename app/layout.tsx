import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

// Change APP_NAME in src/config.js when the final name is chosen.
const APP_NAME = "Cinq";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-cinq.png`;

  return {
    title: `${APP_NAME} — Five-Letter Word Guessing Game`,
    description: `Play ${APP_NAME} in Daily, Solo, or turn-based Rival mode, track your stats, and challenge friends.`,
    openGraph: {
      title: `${APP_NAME} — Crack the Five-Letter Word`,
      description: `Challenge a friend, compare results, and climb your ${APP_NAME} stats.`,
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: `${APP_NAME} word game` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${APP_NAME} — Crack the Five-Letter Word`,
      description: `Challenge a friend, compare results, and climb your ${APP_NAME} stats.`,
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
