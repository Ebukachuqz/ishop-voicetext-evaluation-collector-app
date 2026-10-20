import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./playful.css";
import "./participant.css";
import "./responsive.css";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content"
};
export const metadata: Metadata = {
  title: "Conversation Studio · iShop research",
  description: "Scenario-guided collection of human-authored shopping conversations.",
  robots: { index: false, follow: false }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
