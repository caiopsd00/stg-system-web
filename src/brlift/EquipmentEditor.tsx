import { useRef } from "react";
import {
  equipmentFields,
  permanentEquipment,
  type Catalog,
  type Entry,
} from "../contracts/domain";
import { CatalogField } from "./CatalogField";
import { Field, Section } from "./Fields";
import { useFieldError } from "./FormErrors";

export function ApplicableField({
  label,
  value = "",
  onChange,
  numeric = false,
  error,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  error?: string;
}) {
  const previous = useRef("");
  return (
    <div className="br-with-na">
      <Field
        label={label}
        type={numeric && value !== "N/A" ? "number" : "text"}
        value={value}
        error={error}
        onChange={onChange}
      />
      <button
        type="button"
        aria-label={`Não se aplica: ${label}`}
        aria-pressed={value === "N/A"}
        onClick={() => {
          if (value === "N/A") onChange(previous.current);
          else {
            previous.current = value;
            onChange("N/A");
          }
        }}
      >
        N/A
      </button>
    </div>
  );
}

export function EquipmentEditor({
  entry,
  onChange,
  items,
  reload,
}: {
  entry: Entry;
  onChange: (entry: Entry) => void;
  items: Catalog[];
  reload: () => Promise<void>;
}) {
  const equipmentError = useFieldError("equipmentId");
  const odometerError = useFieldError("equipment.odometer");
  const hourmeterError = useFieldError("equipment.hourmeter");
  const lowerError = useFieldError("equipment.hourmeterLower");
  const upperError = useFieldError("equipment.hourmeterUpper");
  const data = entry.payload.equipment as Record<string, string>;
  const readingFields = [
    ["odometer", "KM na data"],
    ["hourmeterLower", "Horímetro inferior na data"],
    ["hourmeterUpper", "Horímetro superior na data"],
  ] as const;
  function readingError(values: Record<string, string>) {
    for (const [key, label] of readingFields) {
      const value = (values[key] || "").trim();
      if (
        value &&
        value !== "N/A" &&
        (!Number.isFinite(Number(value)) || Number(value) < 0)
      )
        return label + ": informe um número positivo, zero ou N/A.";
    }
    return "";
  }
  const error = readingError(data);
  return (
    <Section title="B. Equipamento">
      <CatalogField
        kind="equipment"
        fieldError={equipmentError}
        value={entry.equipmentId}
        clientId={entry.clientId}
        items={items}
        reload={reload}
        initialData={permanentEquipment(data)}
        onChange={(id, item) => {
          onChange({
            ...entry,
            equipmentId: id,
            payload: {
              ...entry.payload,
              equipment: {
                ...(id && id === entry.equipmentId ? data : {}),
                ...permanentEquipment(item?.data),
              },
            },
          });
        }}
      />
      {!entry.clientId && (
        <p className="muted">
          Selecione o cliente para consultar ou cadastrar seus equipamentos.
        </p>
      )}
      <div className="br-grid">
        {equipmentFields.map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={data[key]}
            readOnly
            onChange={() => {}}
          />
        ))}
      </div>
      <p className="muted">
        Dados somente para consulta. Para criar ou alterar o cadastro, use +
        Equipamento ou Editar equipamento.
      </p>
      <h3>
        Leituras do atendimento —{" "}
        {entry.date
          ? entry.date.split("-").reverse().join("/")
          : "informe a data"}
      </h3>
      <div className="br-grid">
        {readingFields.map(([key, label]) => (
          <ApplicableField
            key={key}
            label={label}
            numeric
            error={
              (
                {
                  odometer: odometerError,
                  hourmeterLower: lowerError || hourmeterError,
                  hourmeterUpper: upperError,
                } as Record<string, string | undefined>
              )[key]
            }
            onChange={(value) =>
              onChange({
                ...entry,
                payload: {
                  ...entry.payload,
                  equipment: { ...data, [key]: value },
                },
              })
            }
            value={
              key === "hourmeterLower"
                ? (data.hourmeterLower ?? data.hourmeter)
                : data[key]
            }
          />
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <p className="muted">
        KM e horímetros pertencem ao atendimento, não ao cadastro do
        equipamento. Os horímetros são informados somente nesta seção.
      </p>
    </Section>
  );
}
