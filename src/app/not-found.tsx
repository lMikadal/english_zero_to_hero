import Link from "next/link";
import { buttonClass } from "@/components/ui/button-styles";
import { StatusScreen } from "@/components/ui/StatusScreen";

// Shown for every notFound() and unknown URL (bad day, unknown ?skill=). Without it Next shows its English default page.
export default function NotFound() {
  return (
    <StatusScreen
      icon="🔍"
      title="ไม่พบหน้านี้"
      actions={
        <>
          <Link href="/" className={buttonClass("primary")}>กลับหน้าแรก</Link>
          <Link href="/practice" className={buttonClass("secondary")}>ไปหน้าฝึกเพิ่ม</Link>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted">ลิงก์นี้อาจผิด หรือไม่มีหน้านี้อยู่ ลองกลับไปเริ่มจากหน้าแรกหรือหน้าฝึกเพิ่ม</p>
    </StatusScreen>
  );
}
