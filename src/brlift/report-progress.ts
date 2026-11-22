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
  hasPeriodData,
  isNonTravelReport,
  periodReadingIssue,
  periodContinuityIssues,
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
  complete?: string,
): Progress {
  if (!items.length) return result("empty", empty);
  const invalid = items.find((i) => i.state === "invalid");
  if (invalid) return invalid;
  if (items.every((i) => i.state === "complete"))
    return result(
      "complete",
      complete || `${items.length} item(ns) validado(s)`,
    );
  if (items.every((i) => i.state === "empty"))
    return result("empty", items[0].detail);
  return result("pending", items.find((i) => i.state !== "complete")!.detail);
}
export function memberProgress(
  member: TeamMember,
  team: TeamMember[],
  requireCharged = false,
): Progress {
  if (!member.technicianId) return result("empty", "Selecione o profissional");
  if (team.filter((m) => m.technicianId === member.technicianId).length > 1)
    return result("invalid", "Profissional repetido");
  if (requireCharged && !member.charged)
    return result("pending", "Informe se o serviço foi cobrado");
  return result("complete", "Profissional e função definidos");
}
export function serviceProgress(
  s: Service,
  requireCompleted = false,
): Progress {
  if (filled(s.description) && requireCompleted && !s.completed)
    return result("pending", "Informe se o serviço foi concluído");
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
export function reasonProgress(r: Reason, requireCompleted = false): Progress {
  if (!filled(r.description))
    return result(
      r.services.length || r.pending ? "pending" : "empty",
      "Descreva o motivo",
    );
  if (!r.services.length)
    return result("pending", "Informe o serviço realizado");
  const services = combineProgress(
    r.services.map((s) => serviceProgress(s, requireCompleted)),
  );
  return services.state === "complete"
    ? result(
        "complete",
        "Motivo e serviço preenchidos; observações, pendências e fotos são opcionais",
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
    return result("invalid", "Selecione o tipo de aplicação");
  if (!filled(p.code))
    return result(
      p.description || p.supplier ? "pending" : "empty",
      "Informe o código da peça",
    );
  return result("complete", "Código, quantidade e tipo de aplicação válidos");
}
export function periodProgress(p: DayPeriod, requireKm = false): Progress {
  if (!hasPeriodData(p))
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
  const reading = periodReadingIssue(p);
  if (reading) return result("invalid", reading);
  try {
    const duration = periodNetMinutes(p);
    if (requireKm && (!p.odometerStart || !p.odometerEnd))
      return result("pending", "Informe KM inicial e final ou N/A");
    return result(
      "complete",
      `${duration} min líquidos; pausa descontada somente deste período`,
    );
  } catch (e) {
    return result("invalid", (e as Error).message);
  }
}
export function dayProgress(d: Day, requireKm = false): Progress {
  try {
    const timelines = d.participants
      ? d.participants
          .filter((p) => p.present)
          .map((p) => participantDay(d, p.technicianId))
      : [d];
    for (const timeline of timelines) {
      const issue = periodContinuityIssues(dayPeriods(timeline))[0];
      if (issue) return result("invalid", issue.message);
    }
  } catch (error) {
    return result("invalid", (error as Error).message);
  }
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
      present.map((x) => participantProgress(d, x.technicianId, requireKm)),
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
    !d.notes?.trim() &&
    !periods.some(hasPeriodData)
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
  if (requireKm && !periods.some((p) => p.start && p.end))
    return result("pending", "Informe os horários do dia");
  const progress = periods.map((p) => periodProgress(p, requireKm));
  const invalid = progress.find((p) => p.state === "invalid");
  if (invalid) return invalid;
  const pending = progress.find((p) => p.state === "pending");
  if (pending) return pending;
  return result("complete", "Data, leituras e períodos válidos");
}
export function participantProgress(
  day: Day,
  id: string,
  requireKm = false,
): Progress {
  try {
    const resolved = participantDay(day, id);
    const progress = dayProgress(
      resolved,
      requireKm &&
        !day.participants?.find((p) => p.technicianId === id)?.sameVehicleAs,
    );
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
  const revised = p.formRevision === 2;
  const team = reportTeam(entry);
  const teamState = combineProgress(
    team.map((m) => memberProgress(m, team, revised)),
  );
  const anyIdentity = !!(
    entry.number ||
    entry.clientId ||
    entry.technicianId ||
    p.requester ||
    p.location
  );
  let A = result(
    anyIdentity ? "pending" : "empty",
    "Informe O.S. OMIE, cliente e equipe",
  );
  if (teamState.state === "invalid") A = teamState;
  else if (
    filled(entry.number) &&
    entry.clientId &&
    teamState.state === "complete"
  )
    A = result(
      "complete",
      "Identificação preenchida; solicitante, veículo e local são opcionais",
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
      "Equipamento preenchido; ano, placa, frota e leituras são opcionais",
    );
  const C = combineProgress(
    p.reasons.map((r) => reasonProgress(r, revised)),
    "Adicione pelo menos um motivo e seu serviço",
    "Motivos e serviços preenchidos; observações, pendências e fotos são opcionais",
  );
  const D = combineProgress(
    p.parts.map(partProgress),
    "Peças não informadas (opcional)",
    "Peças preenchidas; código, quantidade e tipo de aplicação válidos",
  );
  let E = combineProgress(
    p.days
      .map((d) => dayProgress(d, revised))
      .filter((day) => day.state !== "empty"),
    "Cronograma não informado (opcional)",
    "Cronograma preenchido; datas e períodos válidos",
  );
  if (isNonTravelReport(p.type) && hasReportTravel(p))
    E = result(
      "invalid",
      "Atendimento interno ou remoto não utiliza deslocamento",
    );
  const finalValues = [
    p.concluded,
    p.released,
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
      ? "Status final preenchido e assinaturas registradas"
      : "Preencha o status e salve ambas as assinaturas",
  );
  return { A, B, C, D, E, F };
}

// Resolve only on entry into a block, never while typing: completing a field
// must not collapse the user's current editor or steal focus.
export function reportPendingPaths(entry: Entry): Record<string, string[]> {
  const p = entry.payload as Report;
  const paths: Record<string, string[]> = {};
  const revised = p.formRevision === 2;
  const team = reportTeam(entry);
  const unfinished = <T>(items: T[], progress: (item: T) => Progress) => {
    const invalid = items.findIndex(
      (item) => progress(item).state === "invalid",
    );
    return invalid >= 0
      ? invalid
      : items.findIndex((item) => progress(item).state !== "complete");
  };
  const member = unfinished(team, (m) => memberProgress(m, team, revised));
  paths["A/team"] =
    member < 0 ? ["A", "team"] : ["A", "team", `tech-${member}`];
  paths.A = filled(entry.number) && entry.clientId ? paths["A/team"] : ["A"];
  // A complete team does not require opening anything when returning to A.
  if (member < 0) paths.A = ["A"];
  for (const reason of p.reasons) {
    const base = ["C", reason.id];
    const servicesPath = base;
    const index = unfinished(reason.services, (s) =>
      serviceProgress(s, revised),
    );
    paths[base.join("/")] =
      filled(reason.description) && index >= 0 ? servicesPath : base;
    paths[servicesPath.join("/")] = servicesPath;
  }
  const reason = unfinished(p.reasons, (r) => reasonProgress(r, revised));
  paths.C = reason < 0 ? ["C"] : paths[["C", p.reasons[reason].id].join("/")];
  const part = unfinished(p.parts, partProgress);
  paths.D = part < 0 ? ["D"] : ["D", p.parts[part].id];
  const day = unfinished(p.days, (d) => dayProgress(d, revised));
  for (const d of p.days) {
    const people = dayParticipants(d, reportTeam(entry));
    if (people.length || d.participants !== undefined) {
      const current = { ...d, participants: people },
        base = ["E", d.id];
      const present = people.filter((x) => x.present);
      const pending = present.find(
        (x) =>
          participantProgress(current, x.technicianId, revised).state !==
          "complete",
      );
      paths[base.join("/")] = base;
      for (const person of present) {
        const personPath = [...base, `person-${person.technicianId}`];
        paths[personPath.join("/")] = personPath;
        if (!person.sameHoursAs || revised) {
          let periods: DayPeriod[];
          try {
            periods = dayPeriods(participantDay(current, person.technicianId));
          } catch {
            continue;
          }
          const continuity = periodContinuityIssues(periods);
          const progress = (period: DayPeriod) => {
            const issue = continuity.find((item) => item.id === period.id);
            return issue
              ? result("invalid", issue.message)
              : periodProgress(period, revised && !person.sameVehicleAs);
          };
          const index = unfinished(periods, progress);
          if (
            index >= 0 &&
            ![person.odometerStart, person.odometerEnd].some(readingInvalid)
          )
            paths[personPath.join("/")] = [
              ...personPath,
              `periods-${periods[index].kind}`,
              periods[index].id,
            ];
          for (const kind of ["outbound", "work", "inbound"] as const) {
            const group = [...personPath, `periods-${kind}`],
              items = periods.filter((p) => p.kind === kind),
              i = unfinished(items, progress);
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
      index = unfinished(periods, (p) => periodProgress(p, revised));
    paths[base.join("/")] =
      index < 0 ||
      !realDate(d.date) ||
      [d.odometerStart, d.odometerEnd].some(readingInvalid)
        ? base
        : [...base, `periods-${periods[index].kind}`, periods[index].id];
    for (const kind of ["outbound", "work", "inbound"] as const) {
      const group = [...base, `periods-${kind}`],
        items = periods.filter((p) => p.kind === kind),
        i = unfinished(items, (p) => periodProgress(p, revised));
      paths[group.join("/")] = i < 0 ? group : [...group, items[i].id];
    }
  }
  paths.E = day < 0 ? ["E"] : paths[["E", p.days[day].id].join("/")];
  return paths;
}
