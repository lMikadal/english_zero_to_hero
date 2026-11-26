import { cookies } from "next/headers";
import { ThemePicker } from "@/components/ui/ThemePicker";
import { THEME_COOKIE, parseTheme } from "@/lib/theme/theme";

export default async function SettingsPage() {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-10">
      <h1 className="text-2xl font-bold">ตั้งค่า</h1>
      <ThemePicker initial={theme} />
      <p className="text-sm text-muted">ธีมจำไว้ในอุปกรณ์นี้ แต่ละเครื่องตั้งต่างกันได้ ตามเครื่อง: เปลี่ยนสว่างหรือมืดตามการตั้งค่าของมือถือหรือคอมโดยอัตโนมัติ</p>
    </main>
  );
}
