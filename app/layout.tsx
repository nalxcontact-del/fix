import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0d10",
};

export const metadata: Metadata = {
  title: "PersonaChat",
  description: "Roleplay and character conversations with AI.",
  other: {
    google: "notranslate",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
