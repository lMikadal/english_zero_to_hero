import Link from "next/link";

/** Shown by server pages when PostgreSQL cannot be reached, instead of a crash. */
export function DbErrorScreen({ retryHref }: { retryHref: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <p role="alert" className="rounded-lg bg-bad-soft p-3 text-base text-bad-fg">เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง</p>
      <Link href={retryHref} className="flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-base font-semibold text-on-accent">ลองใหม่</Link>
    </main>
  );
}
