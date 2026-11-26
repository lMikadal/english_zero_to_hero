/** The "ตรวจคำตอบ" button every exercise owns. `hidden` renders nothing (after a result the player shows feedback). */
export function CheckButton({
  disabled,
  onClick,
  type = "button",
  hidden = false,
}: {
  disabled: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="mt-4 min-h-12 w-full rounded-xl bg-accent px-4 text-base font-semibold text-on-accent disabled:bg-surface disabled:text-muted"
    >
      ตรวจคำตอบ
    </button>
  );
}
