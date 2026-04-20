import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: "Sentiment Flow Editor",
  description:
    "See the emotional curve of your writing per sentence and rewrite the weak beats.",
  openGraph: {
    title: "Sentiment Flow Editor",
    description:
      "See the emotional curve of your writing per sentence and rewrite the weak beats.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sentiment Flow Editor",
    description:
      "See the emotional curve of your writing per sentence and rewrite the weak beats.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
