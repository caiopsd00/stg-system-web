import type { Catalog, CatalogKind, Entry } from "../contracts/domain";
import { changeEntryClient } from "../contracts/domain";
import { CatalogField } from "./CatalogField";
import { Field } from "./Fields";
import { useFieldError } from "./FormErrors";

export function IdentificationFields({
  entry,
  onChange,
  catalog,
  reload,
}: {
  entry: Entry;
  onChange: (entry: Entry) => void;
  catalog: Record<CatalogKind, Catalog[]>;
  reload: () => Promise<void>;
}) {
  const dateError = useFieldError("date");
  const clientError = useFieldError("clientId");
  const technicianError = useFieldError("technicianId");
  const equipmentError = useFieldError("equipmentId");
  return (
    <>
      <div className="br-grid">
        <Field
          label="Data"
          type="date"
          error={dateError}
          value={entry.date}
          onChange={(date) => onChange({ ...entry, date })}
        />
        <CatalogField
          kind="clients"
          fieldError={clientError}
          value={entry.clientId}
          items={catalog.clients}
          reload={reload}
          onChange={(id) => onChange(changeEntryClient(entry, id))}
        />
      </div>
      {entry.kind === "inspections" && (
        <div className="br-grid">
          <CatalogField
            kind="technicians"
            fieldError={technicianError}
            label="Inspeção realizada por"
            value={entry.technicianId}
            items={catalog.technicians}
            reload={reload}
            onChange={(id, t) =>
              onChange({
                ...entry,
                technicianId: id,
                payload: {
                  ...entry.payload,
                  documentFields: {
                    ...entry.payload.documentFields,
                    "009": t?.name || "",
                    "164": t?.name || "",
                  },
                },
              })
            }
          />
          <CatalogField
            kind="equipment"
            fieldError={equipmentError}
            value={entry.equipmentId}
            clientId={entry.clientId}
            items={catalog.equipment}
            reload={reload}
            onChange={(id, e) =>
              onChange({
                ...entry,
                equipmentId: id,
                payload: {
                  ...entry.payload,
                  documentFields: {
                    ...entry.payload.documentFields,
                    "001": e?.data.type || "",
                    "002": e?.data.model || "",
                    "003": e?.data.serial || "",
                    "004": e?.data.nominalCapacity || "",
                    "005": e?.data.year || "",
                    "008": e?.data.plate || e?.data.fleet || "",
                    ...(id !== entry.equipmentId
                      ? { "006": "", "007": "" }
                      : {}),
                  },
                },
              })
            }
          />
        </div>
      )}
    </>
  );
}
