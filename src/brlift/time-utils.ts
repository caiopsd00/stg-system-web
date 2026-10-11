export type TimeParts = [string, string];
export function timeParts(value: string): TimeParts {
  const match = /^(\d{0,2}):(\d{0,2})$/.exec(value.trim());
  return match ? [match[1], match[2]] : ["", ""];
}
export function timeValue(parts: TimeParts): string {
  if (!parts.every((p) => /^\d{1,2}$/.test(p))) return "";
  const [hour, minute] = parts.map(Number);
  if (hour > 23 || minute > 59) return "";
  return parts.map((p) => p.padStart(2, "0")).join(":");
}
// Keep an invalid/partial entry visible to report validation instead of silently
// turning it into an optional empty period when saving the report.
export function timeInputValue(parts: TimeParts): string {
  return timeValue(parts) || (parts.some(Boolean) ? parts.join(":") : "");
}
