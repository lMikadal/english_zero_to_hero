/** The "ตรวจคำตอบ" button every exercise owns. */
export function CheckButton({ disabled, onClick, type = "button" }: { disabled: boolean; onClick?: () => void; type?: "button" | "submit" }) {
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
