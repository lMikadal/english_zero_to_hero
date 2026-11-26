import type { Metadata } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme/theme";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "English Zero to Hero",
  description: "ฝึกภาษาอังกฤษ 365 วัน สำหรับคนไทย",
};

// Reads the theme cookie on the server so the very first paint already has the right colours (no flash).
// "system" is resolved by a prefers-color-scheme media query in globals.css.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="th" data-theme={theme}>
      <body className="min-h-screen bg-bg text-fg">{children}</body>
    </html>
  );
}
