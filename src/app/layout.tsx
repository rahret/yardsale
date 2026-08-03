import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yard Sale QR",
  description: "Create and manage your own garage sale, share it with a QR code, and let buyers reserve items in real time.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
