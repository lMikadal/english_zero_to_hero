// "แบบทดสอบประจำเดือน ครั้งที่ k": Thai has no spaces, so a browser may break INSIDE the phrase ("ประจำ / เดือน"). Each half is
// nowrap, so the only place the line can break is the space between the phrase and the ordinal.
export function MonthlyTitle({ k }: { k: number }) {
  return (
    <>
      <span className="whitespace-nowrap">แบบทดสอบประจำเดือน</span>{" "}
      <span className="whitespace-nowrap">ครั้งที่ {k}</span>
    </>
  );
}
