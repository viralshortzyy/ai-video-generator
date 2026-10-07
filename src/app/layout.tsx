import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FrameForge — AI Video Studio",
  description: "Describe the shot. FrameForge directs the rest. An original AI video-generation studio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-forge-bg font-body text-forge-cream antialiased">
        {children}
      </body>
    </html>
  );
}
