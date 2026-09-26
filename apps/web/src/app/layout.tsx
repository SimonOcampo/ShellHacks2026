import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ODD Scout — Explore the next market",
  description:
    "Public-data market screening and hypothetical fleet operations. Not an AV safety or deployment approval assessment.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
