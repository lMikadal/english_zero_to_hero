import { createContext, useContext } from "react";
import { buttonClass } from "@/components/ui/button-styles";

/** The label of every exercise's own check button. The checkpoint player provides "ยืนยันคำตอบ" (no right/wrong is shown there). */
export const CheckLabelContext = createContext("ตรวจคำตอบ");

/**
 * The "ตรวจคำตอบ" button every exercise owns. `hidden` renders nothing (after a result the player shows feedback).
 * mt-auto: on a short screen it sits at the bottom of the step (the exercise root is a flex column that fills it).
 */
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
  const label = useContext(CheckLabelContext);
  if (hidden) return null;
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={buttonClass("primary", "mt-auto")}>
      {label}
    </button>
  );
}
