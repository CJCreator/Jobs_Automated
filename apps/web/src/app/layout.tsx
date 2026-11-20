import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { en } from "@/i18n/en";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Rolewright", template: "%s | Rolewright" },
  description: "Tailor your resume to each job. Every change is checked against facts you confirmed.",
  appleWebApp: { title: "Rolewright" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: "#2f3a8f",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page is rendered per request: the script nonce in the Content-Security-Policy
  // (src/proxy.ts) is new each time and cannot be baked into a prebuilt page.
  await connection();
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          {en.common.skipToMain}
        </a>
        {children}
      </body>
    </html>
  );
}
