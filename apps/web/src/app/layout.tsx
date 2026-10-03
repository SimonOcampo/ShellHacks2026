import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./experience.css";
import "./figma.css";
import "./waymo-inspired.css";

const mobilityFont = localFont({
  src: "../../public/fonts/outfit-variable.ttf",
  variable: "--font-mobility",
  weight: "100 900",
  display: "swap",
  fallback: ["Arial"],
});
export const metadata: Metadata = {
  title: "ODDyssey — Public-data market explorer",
  description:
    "Explore public-data market signals and hypothetical fleet scenarios. Not an assessment of AV safety or deployment approval.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={mobilityFont.variable}>
      <body>{children}</body>
    </html>
  );
}
