import type { Metadata } from "next";
import "./globals.css";
import "./experience.css";
import "./figma.css";
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
