/** The four main menus, in bar order. A page that is a menu lives in src/app/(main)/ (see docs/ARCHITECTURE.md). */
export const NAV_ITEMS = [
  { href: "/", label: "วันนี้", icon: "home" },
  { href: "/practice", label: "ฝึกเพิ่ม", icon: "practice" },
  { href: "/progress", label: "พัฒนาการ", icon: "progress" },
  { href: "/settings", label: "ตั้งค่า", icon: "settings" },
] as const;

export type NavIcon = (typeof NAV_ITEMS)[number]["icon"];

/** `/` only matches itself; other menus also own their sub-pages. */
export const isCurrent = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
