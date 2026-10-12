import { addDays, addHours, addMinutes, nextMonday, setHours, setMinutes, startOfMinute } from "date-fns";

/** Quick times for reminders and "send later". */
export function quickTimes(now = new Date()) {
  const at = (d: Date, h: number) => startOfMinute(setMinutes(setHours(d, h), 0));
  const tomorrow9 = at(addDays(now, 1), 9);
  const list = [
    { label: "In 20 minutes", date: addMinutes(now, 20) },
    { label: "In 1 hour", date: addHours(now, 1) },
    { label: "In 3 hours", date: addHours(now, 3) },
    { label: "Tomorrow at 9:00", date: tomorrow9 },
    { label: "Monday at 9:00", date: at(nextMonday(now), 9) },
  ];
  // "This evening" only makes sense before 5 pm.
  if (now.getHours() < 17) list.splice(3, 0, { label: "This evening at 18:00", date: at(now, 18) });
  return list;
}

/** <input type="datetime-local"> value for a date, in local time. */
export const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
