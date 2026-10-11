import type { InspectionItem, InspectionSection } from "../contracts/types";

type SearchResult = { section: InspectionSection; items: InspectionItem[] };

export function filterInspectionSections(
  sections: InspectionSection[],
  query: string,
  pendingOnly: boolean,
): SearchResult[] {
  const term = query.trim().toLocaleLowerCase();
  return sections
    .map((section) => ({
      section,
      items: section.items.filter(
        (item) =>
          (!pendingOnly ||
            !["A", "B", "C", "D"].includes(item.situation || "")) &&
          (!term ||
            `${item.code} ${item.name}`.toLocaleLowerCase().includes(term)),
      ),
    }))
    .filter((result) => result.items.length > 0);
}
