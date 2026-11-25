import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "English Zero to Hero",
  description: "ฝึกภาษาอังกฤษ 365 วัน สำหรับคนไทย",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className="min-h-screen bg-white text-slate-900">{children}</body>
    </html>
  );
}
