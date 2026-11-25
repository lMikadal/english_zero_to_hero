import { redirect } from "next/navigation";
import { DbErrorScreen } from "@/components/ui/DbErrorScreen";
import { getCurrentDay } from "../(learn)/access";

export const dynamic = "force-dynamic";

/** "Today's lesson" is the learner's current day. */
export default async function TodayPage() {
  let day: number;
  try {
    day = await getCurrentDay();
  } catch (e) {
    console.error("Cannot read the learner's current day:", e);
    return <DbErrorScreen retryHref="/today" />;
  }
  redirect(`/day/${day}`);
}
