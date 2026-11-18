import type {
  Catalog,
  Entry,
  Report,
  Part,
  Service,
  YesNo,
} from "../contracts/domain";
import {
  hasReportTravel,
  changeReportType,
  isNonTravelReport,
  reportTypeLabels,
  singleService,
} from "../contracts/domain";
import { Field, TextField, Section, Photos, ChoiceButtons } from "./Fields";
import { Signature as ReportSignature } from "./Signature";
import { CatalogField } from "./CatalogField";
import { EquipmentEditor } from "./EquipmentEditor";
import { ScheduleDays } from "./ScheduleDays";
import { useRef, useState, type ReactNode } from "react";
import type { FormIssue } from "./form-validation";
import { InlineError } from "./FormErrors";
import { AccordionRoot, Fold, openFold } from "./Accordion";
import { createId } from "./id";
import {
  reportProgress,
  reportPendingPaths,
  reasonProgress,
  partProgress,
} from "./report-progress";
export function ReportEditor({
  entry,
  onChange,
  equipment,
  parts,
  technicians,
  reloadCatalog,
  identification,
  team,
  validationIssues,
}: {
  entry: Entry;
  onChange: (entry: Entry) => void;
  equipment: Catalog[];
  parts: Catalog[];
  technicians: Catalog[];
  reloadCatalog: () => Promise<void>;
  identification: ReactNode;
  team: ReactNode;
  validationIssues: FormIssue[];
}) {
  const p = entry.payload as Report;
  const [active, setActive] = useState<string[]>(["A"]);
  const statuses = reportProgress(entry);
  const fieldError = (key: string) =>
    validationIssues.find((issue) => issue.key === key)?.message;
  const showTravel = !isNonTravelReport(p.type) || hasReportTravel(p);
  const latest = useRef({ entry, onChange });
  latest.current = { entry, onChange };
  const set = (patch: Partial<Report>) =>
    onChange({ ...entry, payload: { ...p, ...patch } });
  const reason = (i: number, patch: any) =>
    set({
      reasons: p.reasons.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    });
  const part = (i: number, patch: Partial<Part>) => {
    const current = latest.current.entry;
    latest.current.onChange({
      ...current,
      payload: {
        ...current.payload,
        parts: current.payload.parts.map((r: Part) =>
          r.id === p.parts[i].id ? { ...r, ...patch } : r,
        ),
      },
    });
  };
  return (
    <AccordionRoot
      active={active}
      setActive={setActive}
      statuses={statuses}
      pendingPaths={reportPendingPaths(entry)}
      errorPaths={validationIssues.map((issue) => issue.path)}
    >
      <Section title="A. Identificação">
        {identification}
        <div className="br-grid">
          <ChoiceButtons
            label="Tipo de atendimento"
            options={Object.entries(reportTypeLabels).map(([value, label]) => ({
              value,
              label,
            }))}
            value={p.type}
            onChange={(type) => {
              if (
                isNonTravelReport(type) &&
                hasReportTravel(p) &&
                !confirm(
                  "O atendimento interno ou remoto usa somente períodos de trabalho. Remover os dados de deslocamento do cronograma?",
                )
              )
                return;
              set(changeReportType(p, type));
            }}
          />
          {(["requester", "location"] as const).map((k, i) =>
            k === "location" && isNonTravelReport(p.type) ? null : (
              <Field
                key={k}
                label={["Solicitante", "Local"][i]}
                value={p[k]}
                onChange={(v) => set({ [k]: v })}
              />
            ),
          )}
        </div>
        {team}
        {isNonTravelReport(p.type) && (
          <p className="muted">
            Atendimento interno ou remoto: não há períodos de ida/volta. Informe
            o KM do período de trabalho ou marque N/A.
          </p>
        )}
        {isNonTravelReport(p.type) && hasReportTravel(p) && (
          <button
            type="button"
            onClick={() => {
              if (
                confirm("Remover os dados de deslocamento deste atendimento?")
              )
                set(changeReportType(p, p.type));
            }}
          >
            Remover deslocamentos do cronograma
          </button>
        )}
      </Section>
      <EquipmentEditor
        entry={entry}
        onChange={onChange}
        items={equipment}
        reload={reloadCatalog}
      />
      <Section title="C. Descrição do serviço">
        {p.reasons.map((r, i) => {
          const service = singleService(r);
          const change = (patch: Partial<Service>) =>
            reason(i, { services: [{ ...service, ...patch }] });
          return (
            <Fold
              key={r.id}
              id={r.id}
              title={"Motivo " + (i + 1)}
              summary={r.description || "Novo motivo"}
              status={reasonProgress(r, true)}
            >
              <TextField
                label="Serviço realizado"
                preserveCase
                error={
                  fieldError("service." + service.id) ||
                  fieldError("reason." + r.id)
                }
                value={service.description}
                onChange={(description) =>
                  reason(i, {
                    description:
                      !r.description || r.description === service.description
                        ? description
                        : r.description,
                    services: [{ ...service, description }],
                  })
                }
              />
              {r.description && r.description !== service.description && (
                <p className="muted">
                  Motivo registrado anteriormente: {r.description}
                </p>
              )}
              <TextField
                label="Observações do serviço"
                preserveCase
                value={service.notes}
                onChange={(notes) => change({ notes })}
              />
              <TextField
                label="Pendências / próximos passos deste motivo"
                preserveCase
                value={r.pending}
                onChange={(pending) => reason(i, { pending })}
              />
              <label className="br-compact-completed">
                Serviço concluído?
                <select
                  aria-label="Serviço concluído?"
                  value={service.completed || ""}
                  aria-invalid={
                    !!fieldError("service." + service.id + ".completed")
                  }
                  onChange={(event) =>
                    change({ completed: event.target.value as YesNo })
                  }
                >
                  <option value="">Selecione</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
                <InlineError field={"service." + service.id + ".completed"} />
              </label>
              <Photos
                value={service.photos}
                onChange={(photos) => change({ photos })}
              />
              <button
                type="button"
                onClick={() =>
                  set({ reasons: p.reasons.filter((_, j) => i !== j) })
                }
              >
                Remover motivo
              </button>
            </Fold>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const id = createId();
            set({
              reasons: [
                ...p.reasons,
                {
                  id,
                  description: "",
                  pending: "",
                  services: [
                    singleService({
                      id,
                      description: "",
                      pending: "",
                      services: [],
                    }),
                  ],
                },
              ],
            });
            openFold(["C", id]);
          }}
        >
          + Motivo
        </button>
        <InlineError field="reasons" />
      </Section>
      <Section title="D. Peças utilizadas / solicitadas">
        {p.parts.map((v, i) => (
          <Fold
            key={v.id}
            id={v.id}
            title={`Peça ${i + 1}`}
            summary={
              [v.code, v.description].filter(Boolean).join(" — ") || "Nova peça"
            }
            status={partProgress(v)}
          >
            <CatalogField
              kind="parts"
              label="Peça do catálogo"
              value={v.catalogId || null}
              items={parts}
              reload={reloadCatalog}
              fieldError={fieldError(`part.${v.id}.code`)}
              unavailableLabel={[v.code, v.description]
                .filter(Boolean)
                .join(" — ")}
              onChange={(id, item) =>
                part(i, {
                  catalogId: id || undefined,
                  code: item?.identifier || "",
                  description: item?.name || "",
                  supplier: item?.data.supplier || "",
                  codeHistory: item?.data.codeHistory || [],
                })
              }
            />
            <div className="br-grid">
              <Field
                label="Código da peça"
                value={v.code}
                readOnly
                onChange={() => {}}
              />
              <Field
                label="Descrição da peça"
                value={v.description}
                readOnly
                onChange={() => {}}
              />
              <Field
                label="Fornecedor"
                value={v.supplier}
                readOnly
                onChange={() => {}}
              />
              <Field
                label="Quantidade"
                error={fieldError(`part.${v.id}.quantity`)}
                type="number"
                value={v.quantity}
                onChange={(quantity) => part(i, { quantity: Number(quantity) })}
              />
              <label>
                Tipo de aplicação
                <select
                  value={v.kind}
                  aria-invalid={!!fieldError(`part.${v.id}.kind`)}
                  aria-label="Tipo de aplicação"
                  onChange={(e) =>
                    part(i, { kind: e.target.value as Part["kind"] })
                  }
                >
                  <option value="requested">Solicitação</option>
                  <option value="replaced">Substituição</option>
                </select>
                <InlineError field={`part.${v.id}.kind`} />
              </label>
            </div>
            <p className="muted">
              Código, descrição e fornecedor são dados do cadastro. Use + Peça
              ou Editar peça. Quantidade e tipo de serviço pertencem somente a
              este atendimento.
            </p>
            {!v.catalogId && v.code && (
              <p className="muted">
                Dados históricos preservados, sem vínculo com um cadastro.
                Selecione ou cadastre uma peça para substituir esses dados.
              </p>
            )}
            {!!v.codeHistory.length && (
              <p>Códigos anteriores: {v.codeHistory.join(", ")}</p>
            )}
            <div className="br-actions">
              <button
                type="button"
                onClick={() =>
                  set({ parts: p.parts.filter((_, j) => i !== j) })
                }
              >
                Remover peça
              </button>
            </div>
          </Fold>
        ))}
        <button
          type="button"
          onClick={() => {
            const id = createId();
            set({
              parts: [
                ...p.parts,
                {
                  id,
                  code: "",
                  description: "",
                  supplier: "",
                  quantity: 1,
                  kind: "requested",
                  codeHistory: [],
                },
              ],
            });
            openFold(["D", id]);
          }}
        >
          + Adicionar peça ao atendimento
        </button>
      </Section>
      <Section title="E. Cronograma de atendimento">
        <ScheduleDays
          days={p.days}
          entry={entry}
          technicians={technicians}
          showTravel={showTravel}
          onChange={(days) => set({ days })}
        />
      </Section>
      <Section title="F. Status final">
        <div className="br-final-questions">
          {(["concluded", "released"] as const).map((k, i) => (
            <ChoiceButtons
              key={k}
              error={fieldError(k)}
              label={["Atendimento concluído", "Equipamento liberado"][i]}
              options={[
                { value: "Sim", label: "Sim" },
                { value: "Não", label: "Não" },
              ]}
              value={p[k]}
              onChange={(v) => set({ [k]: v })}
            />
          ))}
        </div>
        <TextField
          label="Observações finais"
          value={p.observations}
          onChange={(observations) => set({ observations })}
        />
        <div className="br-grid">
          <ReportSignature
            label={
              p.primaryTechnicianRole === "auxiliary"
                ? "Assinatura do auxiliar"
                : "Assinatura do técnico"
            }
            signerTitle={
              p.primaryTechnicianRole === "auxiliary" ? "Auxiliar" : "Técnico"
            }
            target={{
              kind: "reports",
              recordId: entry.id,
              signerRole: "technician",
            }}
            defaultName={
              technicians.find((t) => t.id === entry.technicianId)?.name ||
              entry.technicianName
            }
            error={fieldError("technicianSignature")}
            value={p.technicianSignature}
            onChange={(technicianSignature) => set({ technicianSignature })}
          />
          <ReportSignature
            label="Assinatura do cliente"
            target={{
              kind: "reports",
              recordId: entry.id,
              signerRole: "client",
            }}
            defaultName={p.requester || entry.clientName}
            error={fieldError("clientSignature")}
            value={p.clientSignature}
            onChange={(clientSignature) => set({ clientSignature })}
          />
        </div>
      </Section>
    </AccordionRoot>
  );
}
