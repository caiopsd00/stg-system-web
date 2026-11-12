import {
  dayPeriods,
  dayTotals,
  hasDayData,
  hasReportTravel,
  isNonTravelReport,
  participantDay,
  periodMinutes,
  readingIssue,
  reportTeam,
  type Day,
  type DayPeriod,
  type Entry,
  type Report,
} from "../contracts/domain.ts";
import { dateISO, dateParts } from "./date-utils.ts";

export type FormIssue = { key: string; path: string[]; message: string };
type Add = (key: string, path: string[], message: string) => void;
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function scheduleIssues(
  days: Day[],
  root: string,
  ids: string[],
  requiredKm: boolean,
  add: Add,
) {
  for (const day of days.filter(hasDayData)) {
    const path = [root, day.id];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !dateISO(dateParts(day.date)))
      add("day." + day.id + ".date", path, "Informe a data do dia.");
    function periods(
      list: DayPeriod[],
      parent: string[],
      prefix: string,
      sharedTiming: (period: DayPeriod) => boolean,
      sharedKm: boolean,
    ) {
      for (const period of list) {
        const group = [...parent, "periods-" + period.kind, period.id];
        const key = prefix + "." + period.id;
        const timesValid = validTime(period.start) && validTime(period.end);
        if (!sharedTiming(period)) {
          if (!validTime(period.start))
            add(key + ".start", group, "Informe um horário inicial válido.");
          if (!validTime(period.end))
            add(key + ".end", group, "Informe um horário final válido.");
          if (timesValid) {
            const pause = Number(period.pauseMinutes || 0);
            if (
              !Number.isFinite(pause) ||
              pause < 0 ||
              pause > periodMinutes(period)
            )
              add(key + ".pause", group, "A pausa deve caber no período.");
          }
        }
        if (!sharedKm && requiredKm) {
          for (const field of ["odometerStart", "odometerEnd"] as const) {
            const value = period[field];
            const error =
              readingIssue(value) ||
              (!value ? "Informe a leitura de KM ou marque N/A." : "");
            if (error) add(key + "." + field, group, error);
          }
          if (
            period.odometerStart &&
            period.odometerEnd &&
            Number(period.odometerEnd) < Number(period.odometerStart)
          )
            add(
              key + ".odometerEnd",
              group,
              "KM final deve ser maior ou igual ao inicial.",
            );
        }
      }
    }
    if (day.participants !== undefined) {
      if (day.participants.some((person) => !ids.includes(person.technicianId)))
        add(
          "day." + day.id + ".team",
          path,
          "Revise os profissionais deste dia.",
        );
      const present = day.participants.filter((person) => person.present);
      if (!present.length)
        add(
          "day." + day.id + ".team",
          path,
          "Selecione quem trabalhou neste dia.",
        );
      for (const person of present) {
        const personPath = [...path, "person-" + person.technicianId];
        try {
          const list = dayPeriods(participantDay(day, person.technicianId));
          if (!list.some((period) => period.start && period.end))
            add(
              "day." + day.id + "." + person.technicianId,
              personPath,
              "Informe os horários deste profissional.",
            );
          periods(
            list,
            personPath,
            "period." + day.id + "." + person.technicianId,
            (period) =>
              !!person.sameHoursAs ||
              (!!person.sameVehicleAs && period.kind !== "work"),
            !!person.sameVehicleAs,
          );
        } catch (error) {
          add(
            "day." + day.id + "." + person.technicianId,
            personPath,
            (error as Error).message,
          );
        }
      }
    } else {
      const list = dayPeriods(day);
      if (requiredKm && !list.some((period) => period.start && period.end))
        add(
          "day." + day.id + ".periods",
          path,
          "Informe pelo menos um período com início e fim.",
        );
      periods(list, path, "period." + day.id, () => false, false);
    }
    try {
      dayTotals(day);
    } catch (error) {
      add("day." + day.id + ".totals", path, (error as Error).message);
    }
  }
}

export function finalizationIssues(entry: Entry): FormIssue[] {
  const issues: FormIssue[] = [];
  const add: Add = (key, path, message) => issues.push({ key, path, message });
  if (!entry.number.trim()) add("number", [], "Informe a O.S. OMIE.");
  if (!entry.clientId) add("clientId", ["A"], "Selecione o cliente.");
  if (!entry.technicianId)
    add(
      entry.kind === "reports" ? "team.0" : "technicianId",
      entry.kind === "reports" ? ["A", "team", "tech-0"] : ["A"],
      "Selecione o técnico responsável.",
    );

  if (entry.kind === "inspections") {
    const p = entry.payload;
    if (!entry.equipmentId)
      add("equipmentId", ["A"], "Selecione o equipamento.");
    for (const key of ["010", "012"]) {
      const value = p.documentFields?.[key] || "";
      if (value && !dateISO(dateParts(value)))
        add("document." + key, ["A"], "Informe uma data válida.");
    }
    for (const key of ["006", "007", "hourmeterUpper"]) {
      const issue = readingIssue(p.documentFields?.[key]);
      if (issue) add("document." + key, ["A"], issue);
    }
    scheduleIssues(p.days || [], "schedule", [], true, add);
    for (const section of p.sections || [])
      for (const item of section.items || [])
        if (!["A", "B", "C", "D"].includes(item.situation))
          add(
            "item." + item.id,
            ["B", section.id, item.id],
            "Selecione a situação do item " + item.code + ".",
          );
    if (!["Aprovada", "Rejeitada"].includes(p.documentFields?.["011"]))
      add("document.011", ["C"], "Selecione Aprovada ou Rejeitada.");
    if (!p.technicianSignature?.uri)
      add("technicianSignature", ["C"], "Assinatura do técnico obrigatória.");
    if (!(p.clientSignature?.uri || p.signature?.uri))
      add("clientSignature", ["C"], "Assinatura do cliente obrigatória.");
    return issues;
  }

  const p = entry.payload as Report;
  const team = reportTeam(entry);
  const ids = team.map((member) => member.technicianId).filter(Boolean);
  team.forEach((member, index) => {
    const path = ["A", "team", "tech-" + index];
    if (!member.technicianId && index > 0)
      add("team." + index, path, "Selecione ou remova este profissional.");
    else if (
      member.technicianId &&
      ids.filter((id) => id === member.technicianId).length > 1
    )
      add("team." + index, path, "Profissional repetido na equipe.");
    if (p.formRevision === 2 && member.technicianId && !member.charged)
      add(
        "team." + index + ".charged",
        path,
        "Informe se o serviço deste profissional foi cobrado.",
      );
  });
  if (!entry.equipmentId) add("equipmentId", ["B"], "Selecione o equipamento.");
  for (const [key, label] of [
    ["type", "tipo"],
    ["brand", "marca"],
    ["model", "modelo"],
    ["serial", "série/chassi"],
  ])
    if (!p.equipment?.[key]?.trim())
      add(
        "equipmentId",
        ["B"],
        "O cadastro do equipamento precisa informar " + label + ".",
      );
  for (const key of [
    "odometer",
    "hourmeter",
    "hourmeterLower",
    "hourmeterUpper",
  ]) {
    const error = readingIssue(p.equipment?.[key]);
    if (error) add("equipment." + key, ["B"], error);
  }
  if (!p.reasons?.length)
    add("reasons", ["C"], "Adicione pelo menos um motivo.");
  for (const reason of p.reasons || []) {
    const base = ["C", reason.id];
    if (!reason.description.trim())
      add("reason." + reason.id, base, "Descreva o motivo.");
    if (reason.services.length !== 1)
      add("reason." + reason.id, base, "Informe um serviço por motivo.");
    for (const service of reason.services) {
      const path = [...base, `services-${reason.id}`, service.id];
      if (!service.description.trim())
        add("service." + service.id, path, "Descreva o serviço realizado.");
      if (p.formRevision === 2 && !service.completed)
        add(
          "service." + service.id + ".completed",
          path,
          "Informe se o serviço foi concluído.",
        );
    }
  }
  for (const part of p.parts || []) {
    const path = ["D", part.id],
      key = "part." + part.id;
    if (!part.code.trim())
      add(key + ".code", path, "Selecione uma peça com código.");
    if (!Number.isFinite(Number(part.quantity)) || Number(part.quantity) <= 0)
      add(key + ".quantity", path, "Informe quantidade maior que zero.");
    if (!["requested", "replaced"].includes(part.kind))
      add(key + ".kind", path, "Selecione o tipo de serviço.");
  }
  if (isNonTravelReport(p.type) && hasReportTravel(p))
    add(
      "schedule.travel",
      ["E"],
      "Atendimento interno ou remoto não usa deslocamento; revise o cronograma.",
    );
  scheduleIssues(p.days || [], "E", ids, p.formRevision === 2, add);
  if (!p.concluded)
    add("concluded", ["F"], "Informe se o atendimento foi concluído.");
  if (!p.released)
    add("released", ["F"], "Informe se o equipamento foi liberado.");
  if (!p.technicianSignature?.uri)
    add("technicianSignature", ["F"], "Assinatura do técnico obrigatória.");
  if (!p.clientSignature?.uri)
    add("clientSignature", ["F"], "Assinatura do cliente obrigatória.");
  return issues;
}
