import type { Catalog, Entry, TeamMember } from "../contracts/domain";
import { reportTeam, withReportTeam } from "../contracts/domain";
import { CatalogField } from "./CatalogField";
import { Fold, useAccordion, useAccordionPath } from "./Accordion";
import { combineProgress, memberProgress } from "./report-progress";
import { useFieldError } from "./FormErrors";

function TeamMemberSelector({
  index,
  member,
  team,
  technicians,
  reload,
  change,
  unavailableLabel,
}: {
  index: number;
  member: TeamMember;
  team: TeamMember[];
  technicians: Catalog[];
  reload: () => Promise<void>;
  change: (members: TeamMember[]) => void;
  unavailableLabel?: string;
}) {
  const error = useFieldError(`team.${index}`);
  return (
    <CatalogField
      kind="technicians"
      label={`Profissional ${index + 1}`}
      fieldError={error}
      value={member.technicianId || null}
      unavailableLabel={unavailableLabel}
      items={technicians}
      reload={reload}
      excludeIds={team.filter((_, i) => i !== index).map((m) => m.technicianId)}
      onChange={(id) =>
        change(
          team.map((m, i) =>
            i === index ? { ...m, technicianId: id || "" } : m,
          ),
        )
      }
    />
  );
}

export function ReportTeamEditor({
  entry,
  onChange,
  technicians,
  reload,
}: {
  entry: Entry;
  onChange: (entry: Entry) => void;
  technicians: Catalog[];
  reload: () => Promise<void>;
}) {
  const team = reportTeam(entry);
  const accordion = useAccordion()!;
  const path = useAccordionPath();
  const change = (members: TeamMember[]) =>
    onChange(withReportTeam(entry, members));
  const name = (id: string) =>
    technicians.find((t) => t.id === id)?.name ||
    entry.payload.teamSnapshot?.find(
      (t: { technicianId: string; name: string }) => t.technicianId === id,
    )?.name;
  return (
    <Fold
      id="team"
      title="Equipe do atendimento"
      summary={`${team.filter((m) => m.technicianId).length} profissional(is)`}
      status={combineProgress(team.map((m) => memberProgress(m, team, true)))}
    >
      {team.map((member, index) => (
        <Fold
          key={index}
          id={`tech-${index}`}
          title={`Profissional ${index + 1}`}
          summary={
            (name(member.technicianId) || "Selecionar profissional") +
            (member.role === "technician" ? " — Técnico" : " — Auxiliar")
          }
          status={memberProgress(member, team, true)}
        >
          <div className="br-grid">
            <TeamMemberSelector
              index={index}
              member={member}
              team={team}
              technicians={technicians}
              reload={reload}
              change={change}
              unavailableLabel={name(member.technicianId)}
            />
            <label>
              Função
              <select
                aria-label={`Função do profissional ${index + 1}`}
                value={member.role}
                onChange={(event) =>
                  change(
                    team.map((m, i) =>
                      i === index
                        ? {
                            ...m,
                            role: event.target.value as TeamMember["role"],
                          }
                        : m,
                    ),
                  )
                }
              >
                <option value="technician">Técnico</option>
                <option value="auxiliary">Auxiliar</option>
              </select>
            </label>
            <ChargedField
              index={index}
              member={member}
              onChange={(charged) =>
                change(
                  team.map((value, i) =>
                    i === index ? { ...value, charged } : value,
                  ),
                )
              }
            />
          </div>
          {team.length > 1 && (
            <button
              type="button"
              aria-label={`Remover profissional ${index + 1}`}
              onClick={() => change(team.filter((_, i) => i !== index))}
            >
              Remover da equipe
            </button>
          )}
        </Fold>
      ))}
      <button
        type="button"
        onClick={() => {
          change([...team, { technicianId: "", role: "technician" }]);
          accordion.reveal([...path, "team", `tech-${team.length}`]);
        }}
      >
        + Adicionar profissional
      </button>
    </Fold>
  );
}

function ChargedField({
  index,
  member,
  onChange,
}: {
  index: number;
  member: TeamMember;
  onChange: (charged: NonNullable<TeamMember["charged"]>) => void;
}) {
  const error = useFieldError(`team.${index}.charged`);
  return (
    <label>
      Serviço cobrado?
      <select
        aria-label={`Serviço cobrado do profissional ${index + 1}`}
        aria-invalid={!!error}
        value={member.charged || ""}
        onChange={(event) =>
          onChange(event.target.value as NonNullable<TeamMember["charged"]>)
        }
      >
        <option value="">Selecione</option>
        <option value="Sim">Sim</option>
        <option value="Não">Não</option>
      </select>
      {error && (
        <small className="br-inline-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
