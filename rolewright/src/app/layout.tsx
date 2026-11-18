import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { en } from "@/i18n/en";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Rolewright", template: "%s | Rolewright" },
  description: "Tailor your resume to each job. Every change is checked against facts you confirmed.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
