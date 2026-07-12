"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * "Not today" on the interviewee home screen — dismisses that series'
 * personal prompt for the rest of the calendar day via a same-day cookie
 * rather than a DB write, so `/app` falls through to the standard workspace
 * grid until midnight.
 */
export async function snoozeSeriesAction(formData: FormData) {
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!seriesId) redirect("/app");

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const cookieStore = await cookies();
  cookieStore.set(`snooze-${seriesId}`, "1", { expires: endOfDay, path: "/" });

  redirect("/app");
}
