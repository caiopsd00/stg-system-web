import {
  dayPeriods,
  formatDuration,
  periodLabels,
  periodSummary,
  periodContinuityIssues,
  orderedPeriods,
  type Day,
  type DayPeriod,
} from "../contracts/domain";
import { Fold, useAccordion, useAccordionPath } from "./Accordion";
import { Field } from "./Fields";
import { ApplicableField } from "./EquipmentEditor";
import { combineProgress, periodProgress } from "./report-progress";
import { useFormErrors } from "./FormErrors";
import { createId } from "./id";

export function SchedulePeriods({
  day,
  showTravel,
  onChange,
  sharedTravel = false,
  sharedHours = false,
  errorPrefix,
}: {
  day: Day;
  showTravel: boolean;
  onChange: (periods: DayPeriod[]) => void;
  sharedTravel?: boolean;
  sharedHours?: boolean;
  errorPrefix: string;
}) {
  const issues = useFormErrors();
  const fieldError = (key: string) =>
    issues.find((issue) => issue.key === key)?.message;
  const periods = dayPeriods(day),
    accordion = useAccordion()!,
    path = useAccordionPath();
  const continuity = periodContinuityIssues(periods);
  const progress = (p: DayPeriod) => {
    const issue = continuity.find((i) => i.id === p.id);
    return issue
      ? { state: "invalid" as const, detail: issue.message }
      : periodProgress(p, !sharedTravel);
  };
  const names = { outbound: "Ida", work: "Trabalho", inbound: "Volta" };
  return (
    <div>
      <p className="muted">
        Cada período deve terminar no mesmo dia, até 23:59. Para continuar após
        meia-noite, adicione outro dia ao cronograma e informe o horário a
        partir de 00:00.
      </p>
      {(["outbound", "work", "inbound"] as const)
        .filter((kind) => showTravel || kind === "work")
        .map((kind) => {
          const items = periods.filter((p) => p.kind === kind),
            group = "periods-" + kind;
          const sharedTiming = sharedHours || (sharedTravel && kind !== "work");
          return (
            <Fold
              key={kind}
              id={group}
              title={periodLabels[kind]}
              summary={
                sharedTravel && kind !== "work"
                  ? "Mesmo carro: horários e pausas compartilhados"
                  : sharedHours
                    ? "Horários compartilhados"
                    : items.length + " período(s)"
              }
              status={combineProgress(
                items.map((p) => progress(p)),
                "Nenhum período informado (opcional)",
              )}
            >
              {items.map((period, index) => {
                const key = errorPrefix + "." + period.id;
                const change = (patch: Partial<DayPeriod>) =>
                  onChange(
                    periods.map((p) =>
                      p.id === period.id && p.kind === kind
                        ? { ...p, ...patch }
                        : p,
                    ),
                  );
                return (
                  <Fold
                    key={period.id}
                    id={period.id}
                    title={names[kind] + " " + (index + 1)}
                    status={progress(period)}
                    summary={
                      (period.start || "—") +
                      " às " +
                      (period.end || "—") +
                      " · pausa: " +
                      formatDuration(Number(period.pauseMinutes || 0)) +
                      " · " +
                      periodSummary(period)
                    }
                  >
                    {!sharedTiming && (
                      <div className="br-grid">
                        <Field
                          label="Início"
                          type="time"
                          value={period.start}
                          error={
                            fieldError(key + ".start") ||
                            continuity.find(
                              (i) => i.id === period.id && i.field === "start",
                            )?.message
                          }
                          onChange={(start) => change({ start })}
                        />
                        <Field
                          label="Fim"
                          type="time"
                          value={period.end}
                          error={
                            fieldError(key + ".end") ||
                            continuity.find(
                              (i) => i.id === period.id && i.field === "end",
                            )?.message
                          }
                          onChange={(end) => change({ end })}
                        />
                        <Field
                          label="Pausa em minutos (opcional)"
                          type="number"
                          value={period.pauseMinutes}
                          error={fieldError(key + ".pause")}
                          onChange={(pauseMinutes) => change({ pauseMinutes })}
                        />
                      </div>
                    )}
                    {sharedTravel ? (
                      <p className="muted">
                        KM compartilhado: {period.odometerStart || "—"} /{" "}
                        {period.odometerEnd || "—"}
                      </p>
                    ) : (
                      <div className="br-grid">
                        <ApplicableField
                          label="KM inicial"
                          numeric
                          value={period.odometerStart}
                          error={
                            fieldError(key + ".odometerStart") ||
                            continuity.find(
                              (i) =>
                                i.id === period.id &&
                                i.field === "odometerStart",
                            )?.message
                          }
                          onChange={(odometerStart) =>
                            change({ odometerStart })
                          }
                        />
                        <ApplicableField
                          label="KM final"
                          numeric
                          value={period.odometerEnd}
                          error={
                            fieldError(key + ".odometerEnd") ||
                            continuity.find(
                              (i) =>
                                i.id === period.id && i.field === "odometerEnd",
                            )?.message
                          }
                          onChange={(odometerEnd) => change({ odometerEnd })}
                        />
                      </div>
                    )}
                    <p className="muted">
                      Total do item: {periodSummary(period)}
                    </p>
                    {!sharedTiming && (
                      <button
                        type="button"
                        onClick={() =>
                          onChange(
                            periods.filter(
                              (p) => p.id !== period.id || p.kind !== kind,
                            ),
                          )
                        }
                      >
                        Remover período
                      </button>
                    )}
                  </Fold>
                );
              })}
              {sharedTiming && !items.length && (
                <p>Nenhum período informado pelo profissional de referência.</p>
              )}
              {!sharedTiming && (
                <button
                  type="button"
                  onClick={() => {
                    const id = createId();
                    const order = { outbound: 0, work: 1, inbound: 2 };
                    const previous = orderedPeriods(periods)
                      .filter((p) => order[p.kind] <= order[kind])
                      .at(-1);
                    onChange([
                      ...periods,
                      {
                        id,
                        kind,
                        start: previous?.end || "",
                        end: "",
                        pauseMinutes: "",
                        odometerStart: previous?.odometerEnd || "",
                        odometerEnd: "",
                      },
                    ]);
                    accordion.reveal([...path, group, id]);
                  }}
                >
                  + {names[kind]}
                </button>
              )}
            </Fold>
          );
        })}
    </div>
  );
}
