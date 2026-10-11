import {
  dayPeriods,
  periodLabels,
  type Day,
  type DayPeriod,
} from "../contracts/domain";
import { Fold, useAccordion, useAccordionPath } from "./Accordion";
import { Field } from "./Fields";
import { combineProgress, periodProgress } from "./report-progress";
import { useFormErrors } from "./FormErrors";

export function SchedulePeriods({
  day,
  showTravel,
  onChange,
  sharedTravel = false,
  errorPrefix,
}: {
  day: Day;
  showTravel: boolean;
  onChange: (periods: DayPeriod[]) => void;
  sharedTravel?: boolean;
  errorPrefix?: string;
}) {
  const issues = useFormErrors();
  const fieldError = (key: string) =>
    issues.find((issue) => issue.key === key)?.message;
  const periods = dayPeriods(day),
    accordion = useAccordion()!,
    path = useAccordionPath();
  const names = { outbound: "Ida", work: "Trabalho", inbound: "Volta" };
  return (
    <div>
      {(["outbound", "work", "inbound"] as const)
        .filter((kind) => showTravel || kind === "work")
        .map((kind) => {
          const items = periods.filter((p) => p.kind === kind),
            group = `periods-${kind}`;
          if (sharedTravel && kind !== "work")
            return (
              <Fold
                key={kind}
                id={group}
                title={periodLabels[kind]}
                summary="Mesmo carro: horários e pausas compartilhados"
                status={combineProgress(items.map(periodProgress))}
              >
                {items.length ? (
                  items.map((p, i) => (
                    <p key={p.id}>
                      {names[kind]} {i + 1}: {p.start || "—"} às {p.end || "—"}{" "}
                      · pausa: {p.pauseMinutes || "0"} min
                    </p>
                  ))
                ) : (
                  <p>
                    Nenhum período informado pelo profissional de referência.
                  </p>
                )}
                <p>
                  Para alterar, edite o profissional de referência ou desmarque
                  “Mesmo carro”.
                </p>
              </Fold>
            );
          return (
            <Fold
              key={kind}
              id={group}
              title={periodLabels[kind]}
              summary={`${items.length} período(s)`}
              status={combineProgress(
                items.map(periodProgress),
                "Nenhum período informado (opcional)",
              )}
            >
              {items.map((period, index) => (
                <Fold
                  key={period.id}
                  id={period.id}
                  title={`${names[kind]} ${index + 1}`}
                  status={periodProgress(period)}
                  summary={`${period.start || "—"} às ${period.end || "—"} · pausa: ${period.pauseMinutes || "0"} min`}
                >
                  <div className="br-grid">
                    <Field
                      label="Início"
                      error={fieldError(`${errorPrefix}.${period.id}.start`)}
                      type="time"
                      value={period.start}
                      onChange={(start) =>
                        onChange(
                          periods.map((p) =>
                            p.id === period.id ? { ...p, start } : p,
                          ),
                        )
                      }
                    />
                    <Field
                      label="Fim"
                      error={fieldError(`${errorPrefix}.${period.id}.end`)}
                      type="time"
                      value={period.end}
                      onChange={(end) =>
                        onChange(
                          periods.map((p) =>
                            p.id === period.id ? { ...p, end } : p,
                          ),
                        )
                      }
                    />
                    <Field
                      label="Pausa em minutos (opcional)"
                      error={fieldError(`${errorPrefix}.${period.id}.pause`)}
                      type="number"
                      value={period.pauseMinutes}
                      onChange={(pauseMinutes) =>
                        onChange(
                          periods.map((p) =>
                            p.id === period.id ? { ...p, pauseMinutes } : p,
                          ),
                        )
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(periods.filter((p) => p.id !== period.id))
                    }
                  >
                    Remover período
                  </button>
                </Fold>
              ))}
              <button
                type="button"
                onClick={() => {
                  const id = crypto.randomUUID();
                  onChange([
                    ...periods,
                    { id, kind, start: "", end: "", pauseMinutes: "" },
                  ]);
                  accordion.reveal([...path, group, id]);
                }}
              >
                + {names[kind]}
              </button>
            </Fold>
          );
        })}
    </div>
  );
}
