import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Catalog, Entry, Media } from "../contracts/domain";
import {
  documentFields,
  documentImageSlots,
  normalizeInspectionResult,
} from "../contracts/inspection-template";
import { Field, Photos, TextField } from "./Fields";
import { Signature } from "./Signature";
import { AccordionRoot, Fold } from "./Accordion";
import { combineProgress, type Progress } from "./report-progress";
import { dateISO, dateParts } from "./date-utils";
import { CatalogField } from "./CatalogField";
import type { FormIssue } from "./form-validation";
import { InlineError } from "./FormErrors";
import { filterInspectionSections } from "./inspection-search";

const equipmentFieldKeys = ["001", "002", "003", "004", "005", "008"];
const readingFieldKeys = ["006", "007"];

const situations = ["A", "B", "C", "D"] as const;
const situationLabels: Record<(typeof situations)[number], string> = {
  A: "Em conformidade",
  B: "Programar manutenção",
  C: "Falha crítica",
  D: "Não se aplica",
};
const progress = (state: Progress["state"], detail: string): Progress => ({
  state,
  detail,
});

function itemProgress(item: any): Progress {
  if (situations.includes(item.situation))
    return progress("complete", `Situação ${item.situation} registrada`);
  if (item.situation)
    return progress("invalid", "Selecione uma situação válida (A, B, C ou D)");
  return item.observation || item.images?.length
    ? progress("pending", "Selecione a situação deste item")
    : progress("empty", "Situação, observações e fotos ainda não informadas");
}

function documentProgress(fields: Record<string, string>): Progress {
  const values = documentFields
    .filter((field) => field.key !== "000")
    .map((field) => fields?.[field.key] || "");
  for (const key of ["010", "012"]) {
    const value = fields?.[key] || "";
    if (value && !dateISO(dateParts(value)))
      return progress(
        "invalid",
        `Confira o campo ${key === "010" ? "Data de vistoria" : "Próxima vistoria"}`,
      );
  }
  const filled = values.filter((value) => value.trim()).length;
  if (!filled)
    return progress("empty", "Dados do equipamento ainda não preenchidos");
  return progress(
    "complete",
    `${filled} campo(s) informado(s); os demais dados seguem editáveis`,
  );
}

function inspectionIdentityProgress(entry: Entry): Progress {
  const document = documentProgress(entry.payload.documentFields);
  if (document.state === "invalid") return document;
  if (!entry.number.trim())
    return progress("pending", "Informe o número identificador único");
  if (!entry.clientId || !entry.technicianId || !entry.equipmentId)
    return progress("pending", "Selecione cliente, responsável e equipamento");
  if (!normalizeInspectionResult(entry.payload.documentFields["011"] || ""))
    return progress("pending", "Selecione o resultado da vistoria");
  return progress(
    "complete",
    "Identificador único informado; dados complementares editáveis",
  );
}

function initialPath(entry: Entry): string[] {
  const payload = entry.payload as any;
  if (inspectionIdentityProgress(entry).state !== "complete") return ["A"];
  for (const section of payload.sections) {
    const incomplete = section.items.find(
      (item: any) => itemProgress(item).state !== "complete",
    );
    if (incomplete) return ["B", section.id, incomplete.id];
  }
  return ["C"];
}

function InspectionQuestionDialog({
  section,
  item,
  index,
  total,
  completed,
  hasPrevious,
  hasNext,
  documentImages,
  onItemChange,
  onDocumentImagesChange,
  onPrevious,
  onNext,
  onClose,
}: {
  section: any;
  item: any;
  index: number;
  total: number;
  completed: number;
  hasPrevious: boolean;
  hasNext: boolean;
  documentImages: Record<string, Media[]>;
  onItemChange: (sectionId: string, itemId: string, patch: any) => void;
  onDocumentImagesChange: (slot: string, images: Media[]) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const focusAnswer = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => focusAnswer.current?.focus());
  }, [item.id]);

  return (
    <div className="br-modal br-inspection-modal">
      <section
        className="br-dialog br-inspection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="br-inspection-question-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <header className="br-guided-header">
          <div>
            <span className="br-guided-kicker">
              Checklist · pergunta a pergunta
            </span>
            <h2 id="br-inspection-question-title">
              {item.code} — {item.name}
            </h2>
            <p>{section.name}</p>
          </div>
          <button
            type="button"
            className="br-guided-close"
            aria-label="Voltar ao checklist em modo lista"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span> Voltar à lista
          </button>
        </header>

        <div className="br-guided-progress">
          <div>
            <strong>
              Item {index + 1} de {total}
            </strong>
            <span>
              {completed} de {total} respondidos
            </span>
          </div>
          <progress
            value={completed}
            max={total}
            aria-label="Progresso do checklist"
          />
        </div>

        <div className="br-guided-body">
          <p className="br-guided-prompt">Qual é a situação deste item?</p>
          <div
            className="br-guided-answers"
            role="group"
            aria-label={`Situação ${item.code}`}
          >
            {situations.map((value, optionIndex) => (
              <button
                type="button"
                key={value}
                ref={optionIndex === 0 ? focusAnswer : undefined}
                className={item.situation === value ? "selected" : ""}
                aria-pressed={item.situation === value}
                onClick={() =>
                  onItemChange(section.id, item.id, {
                    situation: item.situation === value ? "" : value,
                  })
                }
              >
                <span className="br-guided-letter">{value}</span>
                <span>{situationLabels[value]}</span>
              </button>
            ))}
          </div>

          <div className="br-guided-notes">
            <TextField
              label="Observações deste item (opcional)"
              value={item.observation}
              onChange={(observation) =>
                onItemChange(section.id, item.id, { observation })
              }
            />
          </div>
          <div className="br-guided-photos">
            <h3>Fotos deste item</h3>
            <Photos
              value={item.images}
              onChange={(images) =>
                onItemChange(section.id, item.id, { images })
              }
            />
          </div>
          {(item.extraImageSlots || []).map((slot: string) => (
            <div key={slot} className="br-guided-photos">
              <h3>
                {documentImageSlots.find((candidate) => candidate.key === slot)
                  ?.label || `Registro complementar ${slot}`}
              </h3>
              <Photos
                value={documentImages[slot] || []}
                onChange={(images) => onDocumentImagesChange(slot, images)}
              />
            </div>
          ))}
        </div>

        <footer className="br-guided-footer">
          <button type="button" onClick={onPrevious} disabled={!hasPrevious}>
            ← Anterior
          </button>
          <span>
            {item.situation
              ? `Resposta ${item.situation} registrada`
              : "Você pode responder ou avançar"}
          </span>
          <button type="button" className="primary" onClick={onNext}>
            {!hasNext
              ? "Concluir e voltar à lista"
              : item.situation
                ? "Próximo pendente →"
                : "Pular por enquanto →"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function InspectionEditor({
  entry,
  onChange,
  identification,
  technicians,
  reloadCatalog,
  validationIssues,
}: {
  entry: Entry;
  onChange: (v: Entry) => void;
  identification: ReactNode;
  technicians: Catalog[];
  reloadCatalog: () => Promise<void>;
  validationIssues: FormIssue[];
}) {
  const p = entry.payload,
    [pending, setPending] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState<string[]>(() => initialPath(entry)),
    [checklistMode, setChecklistMode] = useState<"choose" | "list" | "guided">(
      "choose",
    ),
    [guidedItemId, setGuidedItemId] = useState<string | null>(null);
  const fieldError = (key: string) =>
    validationIssues.find((issue) => issue.key === key)?.message;
  useEffect(() => {
    if (
      checklistMode === "choose" &&
      validationIssues.some((issue) => issue.path[0] === "B")
    )
      setChecklistMode("list");
  }, [checklistMode, validationIssues]);
  const items = p.sections.flatMap((s: any) => s.items),
    completed = items.filter(
      (i: any) => itemProgress(i).state === "complete",
    ).length;
  const listModeButton = useRef<HTMLButtonElement>(null),
    guidedModeButton = useRef<HTMLButtonElement>(null);
  const guidedTargets = p.sections.flatMap((section: any) =>
    section.items.map((item: any) => ({ section, item })),
  );
  const guidedIndex = guidedTargets.findIndex(
    (target: any) => target.item.id === guidedItemId,
  );
  const guidedTarget = guidedTargets[guidedIndex];
  const visibleSections = filterInspectionSections(p.sections, query, pending);
  const firstPending = p.sections
    .map((section: any) => ({
      section,
      item: section.items.find(
        (candidate: any) => itemProgress(candidate).state !== "complete",
      ),
    }))
    .find((candidate: any) => candidate.item);
  const statuses: Record<string, Progress> = {
    A: inspectionIdentityProgress(entry),
    B: combineProgress(
      p.sections.map((section: any) =>
        combineProgress(
          section.items.map(itemProgress),
          "Nenhum item nesta seção",
        ),
      ),
      "Checklist ainda não preenchido",
    ),
    C:
      p.technicianSignature?.uri && (p.clientSignature?.uri || p.signature?.uri)
        ? progress(
            "complete",
            "Assinaturas do técnico e do cliente registradas",
          )
        : progress("pending", "Assinaturas do técnico e do cliente pendentes"),
  };
  const pendingPaths: Record<string, string[]> = {
    A: ["A"],
    B: firstPending
      ? ["B", firstPending.section.id, firstPending.item.id]
      : ["B"],
  };
  for (const section of p.sections as any[]) {
    const incomplete = section.items.find(
      (candidate: any) => itemProgress(candidate).state !== "complete",
    );
    if (incomplete)
      pendingPaths[`B/${section.id}`] = ["B", section.id, incomplete.id];
  }
  const update = (patch: any) =>
    onChange({ ...entry, payload: { ...p, ...patch } });
  const item = (sectionId: string, id: string, patch: any) =>
    update({
      sections: p.sections.map((s: any) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((i: any) =>
                i.id === id
                  ? { ...i, ...patch, updatedAt: new Date().toISOString() }
                  : i,
              ),
            }
          : s,
      ),
    });
  function focusMatchingItem(search: string, pendingOnly: boolean) {
    if (!search.trim() && !pendingOnly) return;
    const first = filterInspectionSections(p.sections, search, pendingOnly)[0];
    setActive(first ? ["B", first.section.id, first.items[0].id] : ["B"]);
  }
  function startGuided() {
    const target = firstPending || guidedTargets[0];
    setChecklistMode("guided");
    setGuidedItemId(target?.item.id || null);
  }
  function moveGuided(direction: -1 | 1) {
    const target =
      direction === 1
        ? guidedTargets
            .slice(guidedIndex + 1)
            .find(({ item }: any) => itemProgress(item).state !== "complete") ||
          guidedTargets
            .slice(0, guidedIndex)
            .find(({ item }: any) => itemProgress(item).state !== "complete")
        : guidedTargets
            .slice(0, guidedIndex)
            .reverse()
            .find(({ item }: any) => itemProgress(item).state !== "complete");
    if (target) setGuidedItemId(target.item.id);
    else if (direction === 1) {
      setGuidedItemId(null);
      setChecklistMode("list");
      requestAnimationFrame(() => listModeButton.current?.focus());
    }
  }
  function closeGuided() {
    setChecklistMode("list");
    setGuidedItemId(null);
    requestAnimationFrame(() => guidedModeButton.current?.focus());
  }
  function updateDocumentImages(slot: string, images: Media[]) {
    update({
      documentImages: { ...p.documentImages, [slot]: images },
    });
  }
  return (
    <AccordionRoot
      active={active}
      setActive={setActive}
      statuses={statuses}
      pendingPaths={pendingPaths}
      errorPaths={validationIssues.map((issue) => issue.path)}
    >
      <Fold
        id="A"
        title="Identificação e dados do equipamento"
        main
        status={statuses.A}
      >
        {identification}
        <h3>Dados do equipamento</h3>
        <div className="br-grid">
          {documentFields
            .filter((f) => equipmentFieldKeys.includes(f.key))
            .map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={p.documentFields[f.key]}
                readOnly
                onChange={() => {}}
              />
            ))}
        </div>
        <p className="muted">
          Dados do cadastro. Para criar ou alterar, use os botões do equipamento
          acima.
        </p>
        <h3>Leituras e dados da vistoria</h3>
        <div className="br-grid">
          {documentFields
            .filter((f) => readingFieldKeys.includes(f.key))
            .map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={p.documentFields[f.key]}
                onChange={(value) =>
                  update({
                    documentFields: { ...p.documentFields, [f.key]: value },
                  })
                }
              />
            ))}
          {documentFields
            .filter((f) => ["010", "012"].includes(f.key))
            .map((f) => (
              <Field
                key={f.key}
                label={f.label}
                error={fieldError(`document.${f.key}`)}
                type="date"
                value={dateISO(dateParts(p.documentFields[f.key] || ""))}
                onChange={(value) =>
                  update({
                    documentFields: {
                      ...p.documentFields,
                      [f.key]: value
                        ? value.split("-").reverse().join("/")
                        : "",
                    },
                  })
                }
              />
            ))}
          <label>
            RESULTADO DA VISTORIA
            <select
              value={normalizeInspectionResult(p.documentFields["011"] || "")}
              aria-invalid={!!fieldError("document.011")}
              onChange={(event) =>
                update({
                  documentFields: {
                    ...p.documentFields,
                    "011": event.target.value,
                  },
                })
              }
            >
              <option value="">Selecione</option>
              <option value="Aprovada">Aprovada</option>
              <option value="Rejeitada">Rejeitada</option>
            </select>
            <InlineError field="document.011" />
          </label>
        </div>
        <div className="br-inspection-approver">
          <CatalogField
            kind="technicians"
            label="Inspeção aprovada por"
            value={p.approvedByTechnicianId || null}
            items={technicians}
            reload={reloadCatalog}
            onChange={(id, selected) =>
              update({
                approvedByTechnicianId: id,
                documentFields: {
                  ...p.documentFields,
                  "165": selected?.name || "",
                },
              })
            }
          />
          {!p.approvedByTechnicianId && p.documentFields["165"] && (
            <p className="muted">
              Aprovação anterior: {p.documentFields["165"]}. Selecione o
              cadastro correspondente para vincular.
            </p>
          )}
        </div>
        <Fold
          id="A-imagens"
          title="Imagens do documento"
          summary={`${documentImageSlots.reduce((sum, slot) => sum + (p.documentImages[slot.key]?.length || 0), 0)} imagem(ns)`}
          status={progress(
            documentImageSlots.some(
              (slot) => p.documentImages[slot.key]?.length,
            )
              ? "complete"
              : "empty",
            "Imagens do equipamento e dos dados técnicos são opcionais",
          )}
        >
          {documentImageSlots.map((slot) => (
            <div key={slot.key}>
              <h4>{slot.label}</h4>
              <Photos
                value={p.documentImages[slot.key] || []}
                onChange={(v) =>
                  update({
                    documentImages: { ...p.documentImages, [slot.key]: v },
                  })
                }
              />
            </div>
          ))}
        </Fold>
      </Fold>
      <Fold id="B" title="Checklist técnico" main status={statuses.B}>
        <p>
          {completed} de {items.length} itens preenchidos
        </p>
        <progress value={completed} max={items.length} />
        <label className="br-check br-inspection-pending-toggle">
          <input
            type="checkbox"
            checked={pending}
            onChange={(event) => {
              setPending(event.target.checked);
              focusMatchingItem(query, event.target.checked);
            }}
          />{" "}
          Somente pendentes
        </label>
        <fieldset className="br-inspection-mode">
          <legend>Como você prefere preencher o checklist?</legend>
          <div className="br-inspection-mode-options">
            <button
              ref={listModeButton}
              type="button"
              className={checklistMode === "list" ? "selected" : ""}
              aria-pressed={checklistMode === "list"}
              onClick={() => {
                setGuidedItemId(null);
                setChecklistMode("list");
              }}
            >
              <span className="br-mode-icon" aria-hidden="true">
                ▤
              </span>
              <span>
                <strong>Modo lista</strong>
                <small>
                  Veja as seções e abra os itens que quiser preencher.
                </small>
              </span>
              <span className="br-mode-radio" aria-hidden="true" />
            </button>
            <button
              ref={guidedModeButton}
              type="button"
              className={checklistMode === "guided" ? "selected" : ""}
              aria-pressed={checklistMode === "guided"}
              onClick={startGuided}
            >
              <span className="br-mode-icon" aria-hidden="true">
                ➜
              </span>
              <span>
                <strong>Pergunta a pergunta</strong>
                <small>
                  Um item por vez, com respostas e navegação guiada.
                </small>
              </span>
              <span className="br-mode-radio" aria-hidden="true" />
            </button>
          </div>
          {checklistMode === "choose" && (
            <p className="br-mode-hint">
              Escolha um modo. Você pode alternar entre eles a qualquer momento.
            </p>
          )}
        </fieldset>
        {checklistMode === "list" && (
          <>
            <div className="br-grid">
              <Field
                label="Buscar item"
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  focusMatchingItem(value, pending);
                }}
              />
            </div>
            <p className="muted">
              A — Em conformidade · B — Programar manutenção · C — Falha crítica
              · D — Não se aplica
            </p>
            {visibleSections.length === 0 && (
              <p className="muted">Nenhum item encontrado.</p>
            )}
            {visibleSections.map(({ section: s, items: visibleItems }) => (
              <Fold
                key={s.id}
                id={s.id}
                title={s.name}
                summary={`${s.items.filter((i: any) => i.situation).length}/${s.items.length}`}
                status={combineProgress(
                  s.items.map(itemProgress),
                  "Itens desta seção ainda não preenchidos",
                )}
              >
                {visibleItems.map((i) => (
                  <Fold
                    key={i.id}
                    id={i.id}
                    title={`${i.code} — ${i.name}`}
                    summary={
                      i.situation
                        ? `Situação ${i.situation}`
                        : "Preenchimento pendente"
                    }
                    status={itemProgress(i)}
                  >
                    <div
                      className="br-situations"
                      role="group"
                      aria-label={"Situação " + i.code}
                    >
                      {situations.map((v, index) => (
                        <button
                          type="button"
                          key={v}
                          data-pending-focus={
                            index === 0 && !i.situation ? "true" : undefined
                          }
                          aria-pressed={i.situation === v}
                          onClick={() =>
                            item(s.id, i.id, {
                              situation: i.situation === v ? "" : v,
                            })
                          }
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <InlineError field={`item.${i.id}`} />
                    <TextField
                      label="Observações do item"
                      value={i.observation}
                      onChange={(observation) =>
                        item(s.id, i.id, { observation })
                      }
                    />
                    <Photos
                      value={i.images}
                      onChange={(images) => item(s.id, i.id, { images })}
                    />
                    {(i.extraImageSlots || []).map((slot: string) => (
                      <div key={slot}>
                        <h4>Registro complementar {slot}</h4>
                        <Photos
                          value={p.documentImages[slot] || []}
                          onChange={(images) =>
                            update({
                              documentImages: {
                                ...p.documentImages,
                                [slot]: images,
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                  </Fold>
                ))}
              </Fold>
            ))}
          </>
        )}
        {checklistMode === "guided" && guidedTarget && (
          <InspectionQuestionDialog
            section={guidedTarget.section}
            item={guidedTarget.item}
            index={guidedIndex}
            total={guidedTargets.length}
            completed={completed}
            hasPrevious={guidedTargets
              .slice(0, guidedIndex)
              .some(({ item }: any) => itemProgress(item).state !== "complete")}
            hasNext={guidedTargets.some(
              ({ item }: any) =>
                item.id !== guidedItemId &&
                itemProgress(item).state !== "complete",
            )}
            documentImages={p.documentImages}
            onItemChange={item}
            onDocumentImagesChange={updateDocumentImages}
            onPrevious={() => moveGuided(-1)}
            onNext={() => moveGuided(1)}
            onClose={closeGuided}
          />
        )}
        {checklistMode === "guided" && !guidedTarget && (
          <p className="muted">
            Este checklist ainda não tem itens para responder.
          </p>
        )}
      </Fold>
      <Fold id="C" title="Assinatura e finalização" main status={statuses.C}>
        <Signature
          label="Assinatura do técnico"
          error={fieldError("technicianSignature")}
          value={p.technicianSignature}
          onChange={(technicianSignature: Media | undefined) =>
            update({ technicianSignature: technicianSignature || null })
          }
        />
        <Signature
          label="Assinatura do cliente"
          error={fieldError("clientSignature")}
          value={p.clientSignature || p.signature}
          onChange={(clientSignature: Media | undefined) =>
            update({
              clientSignature: clientSignature || null,
              signature: undefined,
            })
          }
        />
        <p className="muted">
          A finalização exige todos os itens, resultado da vistoria e as duas
          assinaturas.
        </p>
      </Fold>
    </AccordionRoot>
  );
}
