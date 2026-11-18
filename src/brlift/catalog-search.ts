export type CatalogOption = {
  value: string;
  label: string;
  search?: string;
  disabled?: boolean;
};
export const searchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
export function filterCatalogOptions(options: CatalogOption[], query: string) {
  const words = searchText(query).trim().split(/\s+/).filter(Boolean);
  return options.filter((option) =>
    words.every((word) =>
      searchText(option.label + " " + (option.search || "")).includes(word),
    ),
  );
}
