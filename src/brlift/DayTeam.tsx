import {
  dayParticipants,
  separateDayHours,
  separateDayVehicle,
  participantDay,
  setDayPresence,
  reportTeam,
  type Catalog,
  type Day,
  type DayParticipant,
  type Entry,
} from "../contracts/domain";
import { Fold, useAccordion, useAccordionPath } from "./Accordion";
import { ApplicableField } from "./EquipmentEditor";
import { TextField, Field } from "./Fields";
import { SchedulePeriods } from "./SchedulePeriods";
import { participantProgress } from "./report-progress";
import { InlineError, useFormErrors } from "./FormErrors";
import "./DayTeam.css";

export function DayTeam({
  day,
  entry,
  technicians,
  showTravel,
  onChange,
}: {
  day: Day;
  entry: Entry;
  technicians: Catalog[];
  showTravel: boolean;
  onChange: (patch: Partial<Day>) => void;
}) {
  const team = reportTeam(entry).filter((x) => x.technicianId);
  const people = dayParticipants(day, team),
    current = { ...day, participants: people };
  const path = useAccordionPath(),
    accordion = useAccordion()!;
  const issues = useFormErrors();
  const fieldError = (key: string) =>
    issues.find((issue) => issue.key === key)?.message;
  const name = (id: string) =>
    technicians.find((t) => t.id === id)?.name ||
    entry.payload.teamSnapshot?.find(
      (t: { technicianId: string }) => t.technicianId === id,
    )?.name ||
    "Profissional";
  const update = (id: string, patch: Partial<DayParticipant>) =>
    onChange({
      participants: people.map((x) =>
        x.technicianId === id ? { ...x, ...patch } : x,
      ),
    });
  return (
    <>
      <TextField
        label="Observações do dia (opcional)"
        value={day.notes || ""}
        onChange={(notes) => onChange({ notes })}
      />
      <fieldset className="br-choice">
        <legend>Quem trabalhou neste dia?</legend>
        <div>
          {team.map((member) => (
            <label
              key={member.technicianId}
              className={
                people.some(
                  (x) => x.technicianId === member.technicianId && x.present,
                )
                  ? "selected"
                  : ""
              }
            >
              <input
                type="checkbox"
                data-pending-focus={
                  day.date &&
                  !people.some((p) => p.present) &&
                  member === team[0]
                    ? "true"
                    : undefined
                }
                checked={people.some(
                  (x) => x.technicianId === member.technicianId && x.present,
                )}
                onChange={(e) => {
                  onChange({
                    participants: setDayPresence(
                      current,
                      member.technicianId,
                      e.target.checked,
                    ),
                  });
                  if (e.target.checked)
                    accordion.reveal(
                      [...path, `person-${member.technicianId}`],
                      false,
                    );
                  else accordion.reveal(path, false);
                }}
              />
              {name(member.technicianId)}
              {member.role === "auxiliary" ? " (Auxiliar)" : " (Técnico)"}
            </label>
          ))}
        </div>
      </fieldset>
      <InlineError field={`day.${day.id}.team`} />
      {!team.length && (
        <p>
          Adicione profissionais em Identificação antes de preencher o
          cronograma.
        </p>
      )}
      {!!team.length && !people.some((x) => x.present) && (
        <p role="status">
          Selecione pelo menos um profissional que trabalhou neste dia.
        </p>
      )}
      {people
        .filter((x) => x.present)
        .map((person, index, present) => {
          const resolved = participantDay(current, person.technicianId);
          const references = present.slice(0, index);
          const reference =
            person.sameHoursAs ||
            person.sameVehicleAs ||
            references[0]?.technicianId;
          const ownDay = {
            ...resolved,
            periods: person.sameVehicleAs
              ? [
                  ...person.periods.filter((p) => p.kind === "work"),
                  ...resolved.periods!.filter((p) => p.kind !== "work"),
                ]
              : person.periods,
          };
          return (
            <Fold
              key={person.technicianId}
              id={`person-${person.technicianId}`}
              title={name(person.technicianId)}
              status={participantProgress(current, person.technicianId)}
              summary={
                team.find((x) => x.technicianId === person.technicianId)
                  ?.role === "auxiliary"
                  ? "Auxiliar"
                  : "Técnico"
              }
            >
              {!!references.length && (
                <div className="br-actions br-day-sharing">
                  <label className="br-day-toggle">
                    <input
                      type="checkbox"
                      checked={!!person.sameHoursAs}
                      onChange={(e) =>
                        update(
                          person.technicianId,
                          e.target.checked
                            ? { sameHoursAs: reference }
                            : separateDayHours(current, person.technicianId),
                        )
                      }
                    />{" "}
                    Mesmo horário
                  </label>
                  {person.sameHoursAs && (
                    <label>
                      Horários iguais aos de
                      <select
                        aria-label="Referência de horários"
                        value={person.sameHoursAs}
                        onChange={(e) =>
                          update(person.technicianId, {
                            sameHoursAs: e.target.value,
                          })
                        }
                      >
                        {references.map((x) => (
                          <option key={x.technicianId} value={x.technicianId}>
                            {name(x.technicianId)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {showTravel && (
                    <label className="br-day-toggle">
                      <input
                        type="checkbox"
                        checked={!!person.sameVehicleAs}
                        onChange={(e) =>
                          update(
                            person.technicianId,
                            e.target.checked
                              ? { sameVehicleAs: reference }
                              : separateDayVehicle(
                                  current,
                                  person.technicianId,
                                ),
                          )
                        }
                      />{" "}
                      Mesmo carro
                    </label>
                  )}
                  {showTravel && person.sameVehicleAs && (
                    <label>
                      No mesmo carro de
                      <select
                        aria-label="Referência de veículo"
                        value={person.sameVehicleAs}
                        onChange={(e) =>
                          update(person.technicianId, {
                            sameVehicleAs: e.target.value,
                          })
                        }
                      >
                        {references.map((x) => (
                          <option key={x.technicianId} value={x.technicianId}>
                            {name(x.technicianId)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
              {showTravel &&
                (person.sameVehicleAs ? (
                  <div>
                    <p>
                      Mesmo carro de {name(person.sameVehicleAs)}: KM
                      contabilizado uma única vez. Ida, volta e suas pausas
                      acompanham esse profissional; o trabalho pode ter horários
                      diferentes.
                    </p>
                    <div className="br-grid">
                      <Field
                        label="KM inicial (mesmo carro)"
                        readOnly
                        value={resolved.odometerStart}
                        onChange={() => {}}
                      />
                      <Field
                        label="KM final (mesmo carro)"
                        readOnly
                        value={resolved.odometerEnd}
                        onChange={() => {}}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="br-grid">
                    <ApplicableField
                      label="KM inicial"
                      error={fieldError(
                        `day.${day.id}.${person.technicianId}.odometerStart`,
                      )}
                      numeric
                      value={person.odometerStart}
                      onChange={(odometerStart) =>
                        update(person.technicianId, { odometerStart })
                      }
                    />
                    <ApplicableField
                      label="KM final"
                      error={fieldError(
                        `day.${day.id}.${person.technicianId}.odometerEnd`,
                      )}
                      numeric
                      value={person.odometerEnd}
                      onChange={(odometerEnd) =>
                        update(person.technicianId, { odometerEnd })
                      }
                    />
                  </div>
                ))}
              {person.sameHoursAs ? (
                <div>
                  <p>
                    Horários e pausas acompanham {name(person.sameHoursAs)}.
                    Desmarque “Mesmo horário” para ajustar separadamente.
                  </p>
                  {resolved.periods!.map((p) => (
                    <p key={`${p.kind}-${p.id}`}>
                      {
                        { work: "Trabalho", outbound: "Ida", inbound: "Volta" }[
                          p.kind
                        ]
                      }
                      : {p.start || "—"} às {p.end || "—"} · pausa:{" "}
                      {p.pauseMinutes || "0"} min
                    </p>
                  ))}
                </div>
              ) : (
                <SchedulePeriods
                  day={ownDay}
                  errorPrefix={`period.${day.id}.${person.technicianId}`}
                  showTravel={showTravel}
                  sharedTravel={!!person.sameVehicleAs}
                  onChange={(periods) =>
                    update(person.technicianId, {
                      periods: person.sameVehicleAs
                        ? [
                            ...periods.filter((p) => p.kind === "work"),
                            ...person.periods.filter((p) => p.kind !== "work"),
                          ]
                        : periods,
                    })
                  }
                />
              )}
              <InlineError field={`day.${day.id}.${person.technicianId}`} />
            </Fold>
          );
        })}
      <small>
        Horas somadas por profissional presente. KM somado por veículo, sem
        duplicar caronas.
      </small>
    </>
  );
}
