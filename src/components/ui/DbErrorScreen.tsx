import Link from "next/link";
import { buttonClass } from "./button-styles";
import { StatusScreen } from "./StatusScreen";

/** Shown by server pages when PostgreSQL cannot be reached, instead of a crash. */
export function DbErrorScreen({ retryHref, underNav = false }: { retryHref: string; underNav?: boolean }) {
  return (
    <StatusScreen underNav={underNav} actions={<Link href={retryHref} className={buttonClass("primary")}>ลองใหม่</Link>}>
      <p role="alert" className="rounded-xl border border-bad/40 bg-bad-soft p-3.5 text-[15px] text-bad-fg">เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง</p>
    </StatusScreen>
  );
}
