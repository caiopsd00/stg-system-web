import {
  dayParticipants,
  dayTotals,
  hasDayData,
  newDay,
  reportTeam,
  type Catalog,
  type Day,
  type Entry,
} from "../contracts/domain";
import { Fold, openFold } from "./Accordion";
import { DayTeam } from "./DayTeam";
import { Field, TextField } from "./Fields";
import { InlineError, useFormErrors } from "./FormErrors";
import { SchedulePeriods } from "./SchedulePeriods";
import { createId } from "./id";
import { dayProgress } from "./report-progress";

export function ScheduleDays({
  days,
  entry,
  technicians,
  showTravel,
  onChange,
}: {
  days: Day[];
  entry: Entry;
  technicians: Catalog[];
  showTravel: boolean;
  onChange: (days: Day[]) => void;
}) {
  const inspection = entry.kind === "inspections";
  const sectionId = inspection ? "schedule" : "E";
  const issues = useFormErrors();
  const techName =
    technicians.find((t) => t.id === entry.technicianId)?.name ||
    entry.technicianName;
  return (
    <>
      <InlineError field="schedule.travel" />
      {inspection && (
        <p className="muted">
          {techName
            ? "Técnico: " + techName
            : "Selecione o técnico em Identificação."}
        </p>
      )}
      {days.map((day, index) => {
        const update = (patch: Partial<Day>) =>
          onChange(
            days.map((value) =>
              value.id === day.id ? { ...value, ...patch } : value,
            ),
          );
        let totals = "Dia sem dados operacionais: não será contabilizado.";
        try {
          if (hasDayData(day)) {
            const t = dayTotals(day);
            totals = `${t.work} min de trabalho · ${t.travel} min de deslocamento · ${t.km} km`;
          }
        } catch (error) {
          totals = (error as Error).message;
        }
        const date = new Date(day.date + "T12:00:00");
        return (
          <Fold
            key={day.id}
            id={day.id}
            title={`Dia ${index + 1}`}
            status={dayProgress(day, true)}
            summary={
              Number.isNaN(date.getTime())
                ? "Selecione a data"
                : date.toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })
            }
          >
            <div className="br-grid">
              <Field
                label="Data do dia"
                type="date"
                value={day.date}
                error={
                  issues.find((issue) => issue.key === `day.${day.id}.date`)
                    ?.message
                }
                onChange={(date) => update({ date })}
              />
            </div>
            {inspection ? (
              <>
                <TextField
                  label="Observações do dia"
                  value={day.notes || ""}
                  onChange={(notes) => update({ notes })}
                />
                <SchedulePeriods
                  day={day}
                  showTravel
                  errorPrefix={`period.${day.id}`}
                  onChange={(periods) => update({ periods })}
                />
              </>
            ) : (
              <DayTeam
                day={day}
                entry={entry}
                technicians={technicians}
                showTravel={showTravel}
                onChange={update}
              />
            )}
            <InlineError field={`day.${day.id}.periods`} />
            <InlineError field={`day.${day.id}.totals`} />
            <p>{totals}</p>
            <button
              type="button"
              onClick={() =>
                onChange(days.filter((value) => value.id !== day.id))
              }
            >
              Remover dia
            </button>
          </Fold>
        );
      })}
      <button
        type="button"
        onClick={() => {
          const id = createId(),
            day = newDay(id);
          const team = inspection ? [] : reportTeam(entry);
          const first = team.find((member) => member.technicianId);
          onChange([
            ...days,
            inspection
              ? { ...day, periods: [] }
              : { ...day, participants: dayParticipants(day, team) },
          ]);
          openFold(
            first
              ? [sectionId, id, `person-${first.technicianId}`]
              : [sectionId, id],
          );
        }}
      >
        {inspection ? "+ Dia de inspeção" : "+ Dia de atendimento"}
      </button>
    </>
  );
}
