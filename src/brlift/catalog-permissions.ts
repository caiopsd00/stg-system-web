import {
  canAdminister,
  type Catalog,
  type CatalogKind,
} from "../contracts/domain.ts";

export function catalogActions(
  kind: CatalogKind,
  role?: string,
  selected?: Catalog,
) {
  const managed = kind !== "technicians" && !!role;
  return {
    create: managed,
    edit:
      managed &&
      !!selected &&
      (canAdminister(role) || selected.permissions?.edit === true),
    archive: managed && canAdminister(role),
  };
}
