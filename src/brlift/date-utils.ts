export type DateParts = [string, string, string];
export function dateParts(value: string): DateParts {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return [day, month, year];
  }
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  return match
    ? [match[1].padStart(2, "0"), match[2].padStart(2, "0"), match[3]]
    : ["", "", ""];
}
export function dateISO([day, month, year]: DateParts) {
  const d = Number(day),
    m = Number(month),
    y = Number(year);
  if (!d || m < 1 || m > 12 || year.length !== 4 || y < 1 || y > 9999)
    return "";
  const probe = new Date(0);
  probe.setFullYear(y, m - 1, d);
  return probe.getFullYear() === y &&
    probe.getMonth() === m - 1 &&
    probe.getDate() === d
    ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    : "";
}
