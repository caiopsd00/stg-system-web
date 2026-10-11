import { useEffect, useState } from "react";
import type { Catalog, CatalogKind } from "../contracts/domain";
import { request } from "./api";
import { ChoiceButtons, Field } from "./Fields";
import {
  canonicalDocument,
  equipmentTypes,
  permanentEquipment,
  validateEquipment,
} from "../contracts/domain";
export { equipmentFields } from "../contracts/domain";
import { equipmentFields } from "../contracts/domain";
export const kindLabels = {
  clients: "Cliente",
  technicians: "Técnico",
  equipment: "Equipamento",
  parts: "Peça",
};
export function CatalogField({
  kind,
  value,
  items,
  onChange,
  reload,
  clientId,
  label,
  excludeIds = [],
  initialData,
  unavailableLabel,
  fieldError,
}: {
  kind: CatalogKind;
  value: string | null;
  items: Catalog[];
  onChange: (id: string | null, item?: Catalog) => void;
  reload: () => Promise<void>;
  clientId?: string | null;
  label?: string;
  excludeIds?: string[];
  initialData?: Record<string, string>;
  unavailableLabel?: string;
  fieldError?: string;
}) {
  const selected = items.find((i) => i.id === value),
    [edit, setEdit] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setError("");
  }, [value, clientId]);
  function validate(draft: any) {
    try {
      if (kind === "equipment") {
        validateEquipment(permanentEquipment(draft.data));
      } else {
        if (!draft.name.trim())
          throw Error(
            kind === "parts"
              ? "Informe a descrição da peça."
              : "Informe o nome.",
          );
        const identifier = canonicalDocument(kind, draft.identifier || "");
        if (
          items.some(
            (item) =>
              item.id !== draft.id &&
              item.identifier &&
              canonicalDocument(kind, item.identifier) === identifier,
          )
        )
          throw Error(
            "Documento ou código já cadastrado. Selecione ou edite o cadastro existente.",
          );
      }
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }
  function changeEdit(patch: any) {
    const next = { ...edit, ...patch };
    setEdit(next);
    if (error) setError(validate(next));
  }
  function close() {
    setEdit(null);
    setError("");
  }
  function open(existing?: Catalog) {
    setError("");
    setEdit(
      existing
        ? { ...existing, data: { ...existing.data } }
        : {
            id: crypto.randomUUID(),
            name: "",
            identifier: "",
            clientId: clientId || null,
            data: initialData || {},
            version: 0,
          },
    );
  }
  async function save() {
    const validation = validate(edit);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { item } = await request(
        "/catalog/" + kind + "/" + edit.id,
        {
          ...edit,
          name:
            edit.name.trim() ||
            [edit.data.type, edit.data.brand, edit.data.model, edit.data.serial]
              .filter(Boolean)
              .join(" "),
          data:
            kind === "equipment" ? permanentEquipment(edit.data) : edit.data,
          baseVersion: edit.version,
        },
        "PUT",
      );
      await reload();
      onChange(item.id, item);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <label>
        {label || kindLabels[kind]}
        <select
          aria-label={label || kindLabels[kind]}
          aria-invalid={!!fieldError}
          value={value || ""}
          disabled={kind === "equipment" && !clientId}
          onChange={(e) => {
            setError("");
            onChange(
              e.target.value || null,
              items.find((i) => i.id === e.target.value),
            );
          }}
        >
          <option value="">Selecione</option>
          {value && !selected && unavailableLabel && (
            <option value={value} disabled>
              {unavailableLabel} (cadastro indisponível)
            </option>
          )}
          {items
            .filter((i) => i.id === value || !excludeIds.includes(i.id))
            .filter((i) => kind !== "equipment" || i.clientId === clientId)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.identifier ? " — " + i.identifier : ""}
              </option>
            ))}
        </select>
      </label>
      {fieldError && (
        <small className="br-inline-error" role="alert">
          {fieldError}
        </small>
      )}
      <div className="br-actions">
        <button
          type="button"
          onClick={() => open()}
          disabled={busy || (kind === "equipment" && !clientId)}
        >
          + {kindLabels[kind]}
        </button>
        <button
          type="button"
          disabled={busy || !selected}
          onClick={() => open(selected)}
        >
          Editar {kindLabels[kind].toLowerCase()}
        </button>
        <button
          type="button"
          disabled={busy || !selected}
          onClick={async () => {
            if (
              !selected ||
              !confirm("Desativar este cadastro? O histórico será preservado.")
            )
              return;
            setBusy(true);
            setError("");
            try {
              await request(
                "/catalog/" + kind + "/" + selected.id,
                { baseVersion: selected.version },
                "DELETE",
              );
              await reload();
              onChange(null);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Excluir
        </button>
      </div>
      {error && !edit && <p role="alert">{error}</p>}
      {edit && (
        <div
          className="br-modal"
          role="dialog"
          aria-modal="true"
          aria-label={"Cadastro de " + kindLabels[kind]}
        >
          <div className="br-dialog">
            <h2>
              {edit.version ? "Editar" : "Cadastrar"}{" "}
              {kindLabels[kind].toLowerCase()}
            </h2>
            <fieldset className="br-form-content" disabled={busy}>
              <Field
                label={kind === "parts" ? "Descrição da peça" : "Nome"}
                value={edit.name}
                onChange={(v) => changeEdit({ name: v })}
              />
              {kind !== "equipment" && (
                <Field
                  label={
                    kind === "clients"
                      ? "CNPJ"
                      : kind === "technicians"
                        ? "CPF"
                        : "Código"
                  }
                  value={edit.identifier}
                  onChange={(v) => changeEdit({ identifier: v })}
                />
              )}
              {kind === "equipment" && (
                <>
                  <ChoiceButtons
                    label="Tipo"
                    value={edit.data.type || ""}
                    options={[
                      ...new Set(
                        [...equipmentTypes, edit.data.type].filter(Boolean),
                      ),
                    ].map((type) => ({ value: type, label: type }))}
                    onChange={(type) =>
                      changeEdit({ data: { ...edit.data, type } })
                    }
                  />
                  <div className="br-grid">
                    {equipmentFields
                      .filter(([key]) => key !== "type")
                      .map(([key, label]) => (
                        <div key={key}>
                          <Field
                            label={label}
                            value={edit.data[key]}
                            onChange={(v) =>
                              changeEdit({ data: { ...edit.data, [key]: v } })
                            }
                          />
                          {["plate", "fleet"].includes(key) && (
                            <button
                              type="button"
                              aria-label={`Não se aplica: ${label}`}
                              aria-pressed={edit.data[key] === "N/A"}
                              onClick={() =>
                                changeEdit({
                                  data: {
                                    ...edit.data,
                                    [key]:
                                      edit.data[key] === "N/A" ? "" : "N/A",
                                  },
                                })
                              }
                            >
                              N/A
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                </>
              )}
              {kind === "parts" && (
                <Field
                  label="Fornecedor"
                  value={edit.data.supplier}
                  onChange={(v) =>
                    changeEdit({ data: { ...edit.data, supplier: v } })
                  }
                />
              )}
            </fieldset>
            {error && <p role="alert">{error}</p>}
            <div className="br-actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={save}
              >
                Salvar cadastro
              </button>
              <button type="button" disabled={busy} onClick={close}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
