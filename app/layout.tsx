import type { Metadata } from "next";
import "./globals.css";
import "./playful.css";
import "./participant.css";
export const metadata: Metadata = {
  title: "Conversation Studio · iShop research",
  description: "Scenario-guided collection of human-authored shopping conversations.",
  robots: { index: false, follow: false }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
