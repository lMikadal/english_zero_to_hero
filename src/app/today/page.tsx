import { redirect } from "next/navigation";
import { DbErrorScreen } from "@/components/ui/DbErrorScreen";
import { getGate } from "../(learn)/access";

export const dynamic = "force-dynamic";

/** "Today's lesson" is the learner's current day, or the checkpoint that blocks it. */
export default async function TodayPage() {
  let day: number;
  let blocking: number | null;
  try {
    ({ currentDay: day, blocking } = await getGate());
  } catch (e) {
    console.error("Cannot read the learner's current day:", e);
    return <DbErrorScreen retryHref="/today" />;
  }
  // A monthly checkpoint that holds day A+1 back is today's work (D10); without one this is the current day, as always.
  redirect(blocking !== null ? `/checkpoint/${blocking}` : `/day/${day}`);
}
