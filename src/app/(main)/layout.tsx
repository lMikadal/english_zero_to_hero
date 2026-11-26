import type { ReactNode } from "react";
import { MainNav } from "@/components/nav/MainNav";

/**
 * Every page that shows the main nav lives in this route group (docs/ARCHITECTURE.md). The bottom padding keeps content
 * clear of the floating bar: bar 64px + 16px gap + 23px raised circle, with room to spare, plus the device safe area.
 */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh pb-[calc(8rem+env(safe-area-inset-bottom))]">
      {children}
      <MainNav />
    </div>
  );
}
