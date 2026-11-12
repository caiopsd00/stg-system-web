import {
  dayPeriods,
  periodLabels,
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
  const names = { outbound: "Ida", work: "Trabalho", inbound: "Volta" };
  return (
    <div>
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
                items.map((p) => periodProgress(p, !sharedTravel)),
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
                    status={periodProgress(period, !sharedTravel)}
                    summary={
                      (period.start || "—") +
                      " às " +
                      (period.end || "—") +
                      " · pausa: " +
                      (period.pauseMinutes || "0") +
                      " min"
                    }
                  >
                    {!sharedTiming && (
                      <div className="br-grid">
                        <Field
                          label="Início"
                          type="time"
                          value={period.start}
                          error={fieldError(key + ".start")}
                          onChange={(start) => change({ start })}
                        />
                        <Field
                          label="Fim"
                          type="time"
                          value={period.end}
                          error={fieldError(key + ".end")}
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
                          error={fieldError(key + ".odometerStart")}
                          onChange={(odometerStart) =>
                            change({ odometerStart })
                          }
                        />
                        <ApplicableField
                          label="KM final"
                          numeric
                          value={period.odometerEnd}
                          error={fieldError(key + ".odometerEnd")}
                          onChange={(odometerEnd) => change({ odometerEnd })}
                        />
                      </div>
                    )}
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
                    onChange([
                      ...periods,
                      {
                        id,
                        kind,
                        start: "",
                        end: "",
                        pauseMinutes: "",
                        odometerStart: "",
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
