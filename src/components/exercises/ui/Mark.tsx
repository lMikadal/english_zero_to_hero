/** Right / wrong that does not rely on colour: a glyph for the eye and Thai text for screen readers. */
export function Mark({ ok }: { ok: boolean }) {
  return (
    <>
      <span aria-hidden="true" className="font-bold">
        {ok ? "✓" : "✗"}
      </span>
      <span className="sr-only">{ok ? "ถูก" : "ผิด"}</span>
    </>
  );
}
