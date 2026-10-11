import type { Catalog, Entry, Report, Part } from "../contracts/domain";
import {
  dayTotals,
  hasDayData,
  newDay,
  hasReportTravel,
  changeReportType,
  reportTeam,
  dayParticipants,
} from "../contracts/domain";
import { Field, TextField, Section, Photos, ChoiceButtons } from "./Fields";
import { Signature as ReportSignature } from "./Signature";
import { CatalogField } from "./CatalogField";
import { EquipmentEditor } from "./EquipmentEditor";
import { DayTeam } from "./DayTeam";
import { useRef, useState, type ReactNode } from "react";
import type { FormIssue } from "./form-validation";
import { InlineError } from "./FormErrors";
import { AccordionRoot, Fold, openFold } from "./Accordion";
import { createId } from "./id";
import {
  reportProgress,
  reportPendingPaths,
  reasonProgress,
  serviceProgress,
  partProgress,
  dayProgress,
  combineProgress,
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
  const showTravel = p.type !== "interno" || hasReportTravel(p);
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
            options={[
              { value: "externo", label: "Externo" },
              { value: "interno", label: "Interno (Galpão BR LIFT)" },
            ]}
            value={p.type}
            onChange={(type) => {
              if (
                type === "interno" &&
                hasReportTravel(p) &&
                !confirm(
                  "O atendimento interno usa somente trabalho e pausa. Remover os dados de deslocamento do cronograma?",
                )
              )
                return;
              set(changeReportType(p, type));
            }}
          />
          {(["operator", "requester", "location"] as const).map((k, i) =>
            k === "location" && p.type === "interno" ? null : (
              <Field
                key={k}
                label={["Operador", "Solicitante", "Local"][i]}
                value={p[k]}
                onChange={(v) => set({ [k]: v })}
              />
            ),
          )}
        </div>
        {team}
        {p.type === "interno" && (
          <p className="muted">
            Atendimento no galpão: somente trabalho e pausa, sem KM de
            deslocamento nem ida/volta. As leituras do equipamento continuam
            disponíveis.
          </p>
        )}
        {p.type === "interno" && hasReportTravel(p) && (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Remover os dados de deslocamento deste atendimento interno?",
                )
              )
                set(changeReportType(p, "interno"));
            }}
          >
            Ajustar cronograma para atendimento interno
          </button>
        )}
      </Section>
      <EquipmentEditor
        entry={entry}
        onChange={onChange}
        items={equipment}
        reload={reloadCatalog}
      />
      <Section title="C. Motivos, serviços e pendências">
        {p.reasons.map((r, i) => (
          <Fold
            key={r.id}
            id={r.id}
            title={`Motivo ${i + 1}`}
            summary={r.description || "Novo motivo"}
            status={reasonProgress(r)}
          >
            <TextField
              label="Descrição do motivo"
              error={fieldError(`reason.${r.id}`)}
              value={r.description}
              onChange={(v) => reason(i, { description: v })}
            />
            <Fold
              id={`services-${r.id}`}
              title="Serviços deste motivo"
              summary={`${r.services.length} serviço(s)`}
              status={combineProgress(
                r.services.map(serviceProgress),
                "Adicione pelo menos um serviço",
              )}
            >
              <InlineError field={`services.${r.id}`} />
              {r.services.map((svc, j) => (
                <Fold
                  key={svc.id}
                  id={svc.id}
                  title={`Serviço ${j + 1}`}
                  summary={svc.description || "Novo serviço"}
                  status={serviceProgress(svc)}
                >
                  <TextField
                    label="Serviço realizado"
                    error={fieldError(`service.${svc.id}`)}
                    value={svc.description}
                    onChange={(v) =>
                      reason(i, {
                        services: r.services.map((s, k) =>
                          k === j ? { ...s, description: v } : s,
                        ),
                      })
                    }
                  />
                  <TextField
                    label="Observações do serviço"
                    value={svc.notes}
                    onChange={(v) =>
                      reason(i, {
                        services: r.services.map((s, k) =>
                          k === j ? { ...s, notes: v } : s,
                        ),
                      })
                    }
                  />
                  <Photos
                    value={svc.photos}
                    onChange={(v) =>
                      reason(i, {
                        services: r.services.map((s, k) =>
                          k === j ? { ...s, photos: v } : s,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      reason(i, {
                        services: r.services.filter((_, k) => k !== j),
                      })
                    }
                  >
                    Remover serviço
                  </button>
                </Fold>
              ))}
              <button
                type="button"
                onClick={() => {
                  const id = createId();
                  reason(i, {
                    services: [
                      ...r.services,
                      {
                        id,
                        description: "",
                        notes: "",
                        photos: [],
                      },
                    ],
                  });
                  openFold(["C", r.id, `services-${r.id}`, id]);
                }}
              >
                + Serviço deste motivo
              </button>
            </Fold>
            <TextField
              label="Pendências / próximos passos deste motivo"
              value={r.pending}
              onChange={(v) => reason(i, { pending: v })}
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
        ))}
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
                  services: [],
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
                Classificação
                <select
                  value={v.kind}
                  aria-invalid={!!fieldError(`part.${v.id}.kind`)}
                  aria-label="Classificação"
                  onChange={(e) =>
                    part(i, { kind: e.target.value as Part["kind"] })
                  }
                >
                  <option value="requested">Solicitada</option>
                  <option value="replaced">Substituída</option>
                </select>
                <InlineError field={`part.${v.id}.kind`} />
              </label>
            </div>
            <p className="muted">
              Código, descrição e fornecedor são dados do cadastro. Use + Peça
              ou Editar peça. Quantidade e classificação pertencem somente a
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
        <InlineError field="schedule.travel" />
        {p.days.map((d, i) => {
          const update = (patch: any) =>
            set({
              days: p.days.map((day, j) =>
                j === i ? { ...day, ...patch } : day,
              ),
            });
          let summary = "Dia sem dados operacionais: não será contabilizado.";
          try {
            if (hasDayData(d)) {
              const t = dayTotals(d);
              summary =
                t.work +
                " min de trabalho · " +
                t.travel +
                " min de deslocamento · " +
                t.km +
                " km";
            }
          } catch (e) {
            summary = (e as Error).message;
          }
          return (
            <Fold
              key={d.id}
              id={d.id}
              title={`Dia ${i + 1}`}
              status={dayProgress(d)}
              summary={
                d.date
                  ? new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : "Selecione a data"
              }
            >
              <div className="br-grid">
                <Field
                  label="Data do dia"
                  error={fieldError(`day.${d.id}.date`)}
                  type="date"
                  value={d.date}
                  onChange={(date) => update({ date })}
                />
              </div>
              <DayTeam
                day={d}
                entry={entry}
                technicians={technicians}
                showTravel={showTravel}
                onChange={update}
              />
              <InlineError field={`day.${d.id}.periods`} />
              <InlineError field={`day.${d.id}.totals`} />
              <p>{summary}</p>
              <button
                type="button"
                onClick={() => set({ days: p.days.filter((_, j) => i !== j) })}
              >
                Remover dia
              </button>
            </Fold>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const id = createId();
            const day = newDay(id);
            set({
              days: [
                ...p.days,
                {
                  ...day,
                  participants: dayParticipants(day, reportTeam(entry)),
                },
              ],
            });
            const first = reportTeam(entry).find((x) => x.technicianId);
            openFold(
              first ? ["E", id, `person-${first.technicianId}`] : ["E", id],
            );
          }}
        >
          + Dia de atendimento
        </button>
      </Section>
      <Section title="F. Status final">
        <div className="br-final-questions">
          {(["concluded", "released", "photosSent"] as const).map((k, i) => (
            <ChoiceButtons
              key={k}
              error={fieldError(k)}
              label={
                [
                  "Atendimento concluído",
                  "Equipamento liberado",
                  "Fotos enviadas",
                ][i]
              }
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
            label="Assinatura do técnico"
            error={fieldError("technicianSignature")}
            value={p.technicianSignature}
            onChange={(technicianSignature) => set({ technicianSignature })}
          />
          <ReportSignature
            label="Assinatura do cliente"
            error={fieldError("clientSignature")}
            value={p.clientSignature}
            onChange={(clientSignature) => set({ clientSignature })}
          />
        </div>
      </Section>
    </AccordionRoot>
  );
}
