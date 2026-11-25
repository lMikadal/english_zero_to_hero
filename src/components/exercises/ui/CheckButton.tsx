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
      className="mt-4 min-h-12 w-full rounded-xl bg-sky-600 px-4 text-base font-semibold text-white disabled:bg-slate-300 disabled:text-slate-500"
    >
      ตรวจคำตอบ
    </button>
  );
}
