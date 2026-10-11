import type {
  Entry,
  Report,
  Reason,
  Service,
  Part,
  Day,
  TeamMember,
  DayPeriod,
} from "../contracts/domain";
import {
  dayPeriods,
  periodNetMinutes,
  hasReportTravel,
  participantDay,
  dayParticipants,
  reportTeam,
  validateDayParticipants,
} from "../contracts/domain.ts";
export type Progress = {
  state: "empty" | "pending" | "invalid" | "complete";
  detail: string;
};
const result = (state: Progress["state"], detail: string): Progress => ({
  state,
  detail,
});
const filled = (value: unknown) => String(value ?? "").trim() !== "";
const readingInvalid = (value: unknown) =>
  filled(value) &&
  value !== "N/A" &&
  (!Number.isFinite(Number(value)) || Number(value) < 0);
function realDate(value: string) {
  const d = new Date(value + "T12:00:00");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(d.getTime()) &&
    [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-") === value
  );
}
export function combineProgress(
  items: Progress[],
  empty = "Nenhum item informado (opcional)",
): Progress {
  if (!items.length) return result("empty", empty);
  const invalid = items.find((i) => i.state === "invalid");
  if (invalid) return invalid;
  if (items.every((i) => i.state === "complete"))
    return result("complete", `${items.length} item(ns) validado(s)`);
  if (items.every((i) => i.state === "empty"))
    return result("empty", items[0].detail);
  return result("pending", items.find((i) => i.state !== "complete")!.detail);
}
export function memberProgress(
  member: TeamMember,
  team: TeamMember[],
): Progress {
  if (!member.technicianId) return result("empty", "Selecione o profissional");
  if (team.filter((m) => m.technicianId === member.technicianId).length > 1)
    return result("invalid", "Profissional repetido");
  return result("complete", "Profissional e função definidos");
}
export function serviceProgress(s: Service): Progress {
  return filled(s.description)
    ? result(
        "complete",
        "Descrição preenchida; observações e fotos são opcionais",
      )
    : result(
        s.notes || s.photos.length ? "pending" : "empty",
        "Descreva o serviço realizado",
      );
}
export function reasonProgress(r: Reason): Progress {
  if (!filled(r.description))
    return result(
      r.services.length || r.pending ? "pending" : "empty",
      "Descreva o motivo",
    );
  if (!r.services.length)
    return result("pending", "Adicione pelo menos um serviço");
  const services = combineProgress(r.services.map(serviceProgress));
  return services.state === "complete"
    ? result(
        "complete",
        `${r.services.length} serviço(s); pendências são opcionais`,
      )
    : result(
        services.state === "invalid" ? "invalid" : "pending",
        services.detail,
      );
}
export function partProgress(p: Part): Progress {
  if (!Number.isFinite(p.quantity) || p.quantity <= 0)
    return result("invalid", "Quantidade deve ser maior que zero");
  if (!["requested", "replaced"].includes(p.kind))
    return result("invalid", "Selecione a classificação");
  if (!filled(p.code))
    return result(
      p.description || p.supplier ? "pending" : "empty",
      "Informe o código da peça",
    );
  return result("complete", "Código, quantidade e classificação válidos");
}
export function periodProgress(p: DayPeriod): Progress {
  if (!p.start && !p.end && !p.pauseMinutes)
    return result("empty", "Informe início e fim; pausa é opcional");
  if ([p.start, p.end].some((v) => v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)))
    return result("invalid", "Horário inválido");
  if (
    !Number.isFinite(Number(p.pauseMinutes || 0)) ||
    Number(p.pauseMinutes || 0) < 0
  )
    return result("invalid", "Pausa inválida");
  if (!p.start || !p.end)
    return result("pending", "Complete início e fim deste período");
  try {
    return result(
      "complete",
      `${periodNetMinutes(p)} min líquidos; pausa descontada somente deste período`,
    );
  } catch (e) {
    return result("invalid", (e as Error).message);
  }
}
export function dayProgress(d: Day): Progress {
  if (d.participants !== undefined) {
    if (!d.date) return result("pending", "Informe a data");
    if (!realDate(d.date)) return result("invalid", "Data inexistente");
    try {
      validateDayParticipants(d);
    } catch (e) {
      return result("invalid", (e as Error).message);
    }
    const present = d.participants.filter((x) => x.present);
    if (!present.length)
      return result("pending", "Selecione quem trabalhou neste dia");
    return combineProgress(
      present.map((x) => participantProgress(d, x.technicianId)),
    );
  }
  const periods = dayPeriods(d);
  const readings = [
    d.odometerStart,
    d.odometerEnd,
    d.hourmeterLower ?? d.hourmeter,
    d.hourmeterUpper,
  ];
  if (
    !readings.some(filled) &&
    !periods.some((p) => p.start || p.end || p.pauseMinutes)
  )
    return result("empty", "Sem dados operacionais; dia não contabilizado");
  if (!d.date) return result("pending", "Informe a data");
  if (!realDate(d.date)) return result("invalid", "Data inexistente");
  if (readings.some(readingInvalid))
    return result("invalid", "Leituras precisam ser positivas, zero ou N/A");
  if (
    filled(d.odometerStart) &&
    filled(d.odometerEnd) &&
    d.odometerStart !== "N/A" &&
    d.odometerEnd !== "N/A" &&
    Number(d.odometerEnd) < Number(d.odometerStart)
  )
    return result("invalid", "KM final menor que o inicial");
  if (
    periods.some((p) =>
      [p.start, p.end].some((v) => v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)),
    )
  )
    return result("invalid", "Horário inválido");
  const progress = periods.map(periodProgress);
  const invalid = progress.find((p) => p.state === "invalid");
  if (invalid) return invalid;
  const pending = progress.find((p) => p.state === "pending");
  if (pending) return pending;
  return result("complete", "Data, leituras e períodos válidos");
}
export function participantProgress(day: Day, id: string): Progress {
  try {
    const resolved = participantDay(day, id);
    const progress = dayProgress(resolved);
    if (
      progress.state === "complete" &&
      !dayPeriods(resolved).some((p) => p.start && p.end)
    )
      return result("pending", "Informe os horários deste profissional");
    return progress.state === "empty"
      ? result("pending", "Informe os horários deste profissional")
      : progress;
  } catch (e) {
    return result("invalid", (e as Error).message);
  }
}
export function reportProgress(entry: Entry): Record<string, Progress> {
  const p = entry.payload as Report;
  const team: TeamMember[] = [
    { technicianId: entry.technicianId || "", role: "technician" },
    ...(p.additionalTechnicians ??
      p.auxiliaries
        .filter((id) => id !== entry.technicianId)
        .map((technicianId) => ({ technicianId, role: "auxiliary" as const }))),
  ];
  const teamState = combineProgress(team.map((m) => memberProgress(m, team)));
  const anyIdentity = !!(
    entry.number ||
    entry.clientId ||
    entry.technicianId ||
    p.operator ||
    p.requester ||
    p.location
  );
  let A = result(
    anyIdentity ? "pending" : "empty",
    "Informe número, data, cliente e equipe",
  );
  if (entry.date && !realDate(entry.date))
    A = result("invalid", "Data inválida");
  else if (teamState.state === "invalid") A = teamState;
  else if (
    filled(entry.number) &&
    entry.date &&
    entry.clientId &&
    teamState.state === "complete"
  )
    A = result(
      "complete",
      "Dados obrigatórios preenchidos; operador, solicitante e local são opcionais",
    );
  const eq = p.equipment;
  let B = result(
    Object.values(eq).some(filled) ? "pending" : "empty",
    "Informe tipo, marca, modelo e série no cadastro",
  );
  if (
    ["odometer", "hourmeter", "hourmeterLower", "hourmeterUpper"].some((k) =>
      readingInvalid(eq[k]),
    )
  )
    B = result("invalid", "KM/horímetros inválidos");
  else if (["type", "brand", "model", "serial"].every((k) => filled(eq[k])))
    B = result(
      "complete",
      "Cadastro válido; ano, placa, frota e leituras são opcionais",
    );
  const C = combineProgress(
    p.reasons.map(reasonProgress),
    "Adicione pelo menos um motivo e seu serviço",
  );
  const D = combineProgress(p.parts.map(partProgress));
  let E = combineProgress(
    p.days.map(dayProgress).filter((day) => day.state !== "empty"),
    "Cronograma não informado (opcional)",
  );
  if (p.type === "interno" && hasReportTravel(p))
    E = result("invalid", "Atendimento interno não utiliza deslocamento");
  const finalValues = [
    p.concluded,
    p.released,
    p.photosSent,
    p.technicianSignature?.uri,
    p.clientSignature?.uri,
  ];
  const F = result(
    finalValues.every(filled)
      ? "complete"
      : finalValues.some(filled) || p.observations
        ? "pending"
        : "empty",
    finalValues.every(filled)
      ? "Status e assinaturas registrados"
      : "Preencha os três status e salve ambas as assinaturas",
  );
  return { A, B, C, D, E, F };
}

// Resolve only on entry into a block, never while typing: completing a field
// must not collapse the user's current editor or steal focus.
export function reportPendingPaths(entry: Entry): Record<string, string[]> {
  const p = entry.payload as Report;
  const paths: Record<string, string[]> = {};
  const team: TeamMember[] = [
    { technicianId: entry.technicianId || "", role: "technician" },
    ...(p.additionalTechnicians ??
      (p.auxiliaries || [])
        .filter((id) => id !== entry.technicianId)
        .map((technicianId) => ({ technicianId, role: "auxiliary" as const }))),
  ];
  const unfinished = <T>(items: T[], progress: (item: T) => Progress) => {
    const invalid = items.findIndex(
      (item) => progress(item).state === "invalid",
    );
    return invalid >= 0
      ? invalid
      : items.findIndex((item) => progress(item).state !== "complete");
  };
  const member = unfinished(team, (m) => memberProgress(m, team));
  paths["A/team"] =
    member < 0 ? ["A", "team"] : ["A", "team", `tech-${member}`];
  paths.A =
    filled(entry.number) && realDate(entry.date) && entry.clientId
      ? paths["A/team"]
      : ["A"];
  // A complete team does not require opening anything when returning to A.
  if (member < 0) paths.A = ["A"];
  for (const reason of p.reasons) {
    const base = ["C", reason.id],
      services = [...base, `services-${reason.id}`];
    const index = unfinished(reason.services, serviceProgress);
    paths[services.join("/")] =
      index < 0 ? services : [...services, reason.services[index].id];
    paths[base.join("/")] =
      filled(reason.description) && (index >= 0 || !reason.services.length)
        ? paths[services.join("/")]
        : base;
  }
  const reason = unfinished(p.reasons, reasonProgress);
  paths.C = reason < 0 ? ["C"] : paths[["C", p.reasons[reason].id].join("/")];
  const part = unfinished(p.parts, partProgress);
  paths.D = part < 0 ? ["D"] : ["D", p.parts[part].id];
  const day = unfinished(p.days, dayProgress);
  for (const d of p.days) {
    const people = dayParticipants(d, reportTeam(entry));
    if (people.length || d.participants !== undefined) {
      const current = { ...d, participants: people },
        base = ["E", d.id];
      const present = people.filter((x) => x.present);
      const pending = present.find(
        (x) =>
          participantProgress(current, x.technicianId).state !== "complete",
      );
      paths[base.join("/")] = base;
      for (const person of present) {
        const personPath = [...base, `person-${person.technicianId}`];
        paths[personPath.join("/")] = personPath;
        if (!person.sameHoursAs) {
          const index = unfinished(person.periods, periodProgress);
          if (
            index >= 0 &&
            ![person.odometerStart, person.odometerEnd].some(readingInvalid)
          )
            paths[personPath.join("/")] = [
              ...personPath,
              `periods-${person.periods[index].kind}`,
              person.periods[index].id,
            ];
          for (const kind of ["outbound", "work", "inbound"] as const) {
            const group = [...personPath, `periods-${kind}`],
              items = person.periods.filter((p) => p.kind === kind),
              i = unfinished(items, periodProgress);
            paths[group.join("/")] = i < 0 ? group : [...group, items[i].id];
          }
        }
      }
      if (realDate(d.date) && pending)
        paths[base.join("/")] =
          paths[[...base, `person-${pending.technicianId}`].join("/")];
      continue;
    }
    const base = ["E", d.id],
      periods = dayPeriods(d),
      index = unfinished(periods, periodProgress);
    paths[base.join("/")] =
      index < 0 ||
      !realDate(d.date) ||
      [d.odometerStart, d.odometerEnd].some(readingInvalid)
        ? base
        : [...base, `periods-${periods[index].kind}`, periods[index].id];
    for (const kind of ["outbound", "work", "inbound"] as const) {
      const group = [...base, `periods-${kind}`],
        items = periods.filter((p) => p.kind === kind),
        i = unfinished(items, periodProgress);
      paths[group.join("/")] = i < 0 ? group : [...group, items[i].id];
    }
  }
  paths.E = day < 0 ? ["E"] : paths[["E", p.days[day].id].join("/")];
  return paths;
}
