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
}: {
  index: number;
  member: TeamMember;
  team: TeamMember[];
  technicians: Catalog[];
  reload: () => Promise<void>;
  change: (members: TeamMember[]) => void;
}) {
  const error = useFieldError(`team.${index}`);
  return (
    <CatalogField
      kind="technicians"
      label={`Profissional ${index + 1}`}
      fieldError={error}
      value={member.technicianId || null}
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
  return (
    <Fold
      id="team"
      title="Equipe do atendimento"
      summary={`${team.filter((m) => m.technicianId).length} profissional(is)`}
      status={combineProgress(team.map((m) => memberProgress(m, team)))}
    >
      {team.map((member, index) => (
        <Fold
          key={index}
          id={`tech-${index}`}
          title={`Profissional ${index + 1}`}
          summary={
            (technicians.find((t) => t.id === member.technicianId)?.name ||
              "Selecionar profissional") +
            (index === 0 || member.role === "technician"
              ? " — Técnico"
              : " — Auxiliar")
          }
          status={memberProgress(member, team)}
        >
          <div className="br-grid">
            <TeamMemberSelector
              index={index}
              member={member}
              team={team}
              technicians={technicians}
              reload={reload}
              change={change}
            />
            <label>
              Função
              <select
                aria-label={`Função do profissional ${index + 1}`}
                value={member.role}
                disabled={index === 0}
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
          </div>
          {index === 0 && (
            <p className="muted">O primeiro profissional é sempre técnico.</p>
          )}
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
