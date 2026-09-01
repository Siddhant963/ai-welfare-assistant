import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Welfare Assistant",
  description: "Student welfare support assistant",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        suppressHydrationWarning is scoped to this single element only, and
        only because the mismatch is proven (via dev-server logs) to be
        caused by a browser extension (Grammarly) injecting
        data-new-gr-c-s-check-loaded / data-gr-ext-installed onto <body>
        after the server HTML is sent, before React hydrates. Our own code
        never sets these attributes and has no way to "match" them — this
        is not an app bug, so this is the React-endorsed fix for exactly
        this scenario (see https://react.dev/link/hydration-mismatch).
      */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
