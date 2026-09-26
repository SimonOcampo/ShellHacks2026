import type { Metadata } from "next";
import "./globals.css";
import "./experience.css";
export const metadata: Metadata = {
  title: "ODD Scout — Expansion starts with a better question",
  description:
    "Explore public-data market signals and hypothetical fleet scenarios. Not an assessment of AV safety or deployment approval.",
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
