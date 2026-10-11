import {
  dayPeriods,
  dayTotals,
  hasDayData,
  hasReportTravel,
  participantDay,
  periodMinutes,
  reportTeam,
  type Entry,
  type Report,
} from "../contracts/domain.ts";
import { dateISO, dateParts } from "./date-utils.ts";

export type FormIssue = { key: string; path: string[]; message: string };

export function finalizationIssues(entry: Entry): FormIssue[] {
  const issues: FormIssue[] = [];
  const add = (key: string, path: string[], message: string) =>
    issues.push({ key, path, message });
  if (!entry.number.trim())
    add("number", [], "Informe o número identificador.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
    !dateISO(dateParts(entry.date))
  )
    add("date", ["A"], "Informe uma data válida.");
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
        add(`document.${key}`, ["A"], "Informe uma data válida.");
    }
    if (!["Aprovada", "Rejeitada"].includes(p.documentFields?.["011"]))
      add("document.011", ["A"], "Selecione Aprovada ou Rejeitada.");
    for (const section of p.sections || [])
      for (const item of section.items || [])
        if (!["A", "B", "C", "D"].includes(item.situation))
          add(
            `item.${item.id}`,
            ["B", section.id, item.id],
            `Selecione a situação do item ${item.code}.`,
          );
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
    if (!member.technicianId && index > 0)
      add(
        `team.${index}`,
        ["A", "team", `tech-${index}`],
        "Selecione ou remova este profissional.",
      );
    else if (
      member.technicianId &&
      ids.filter((id) => id === member.technicianId).length > 1
    )
      add(
        `team.${index}`,
        ["A", "team", `tech-${index}`],
        "Profissional repetido na equipe.",
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
        `O cadastro do equipamento precisa informar ${label}.`,
      );
  for (const key of [
    "odometer",
    "hourmeter",
    "hourmeterLower",
    "hourmeterUpper",
  ]) {
    const value = p.equipment?.[key];
    if (
      value &&
      value !== "N/A" &&
      (!Number.isFinite(Number(value)) || Number(value) < 0)
    )
      add(`equipment.${key}`, ["B"], "Informe número positivo ou N/A.");
  }
  if (!p.reasons?.length)
    add("reasons", ["C"], "Adicione pelo menos um motivo.");
  for (const reason of p.reasons || []) {
    if (!reason.description.trim())
      add(`reason.${reason.id}`, ["C", reason.id], "Descreva o motivo.");
    if (!reason.services.length)
      add(
        `services.${reason.id}`,
        ["C", reason.id, `services-${reason.id}`],
        "Adicione pelo menos um serviço.",
      );
    for (const service of reason.services)
      if (!service.description.trim())
        add(
          `service.${service.id}`,
          ["C", reason.id, `services-${reason.id}`, service.id],
          "Descreva o serviço realizado.",
        );
  }
  for (const part of p.parts || []) {
    const path = ["D", part.id];
    if (!part.code.trim())
      add(`part.${part.id}.code`, path, "Selecione uma peça com código.");
    if (!Number.isFinite(Number(part.quantity)) || Number(part.quantity) <= 0)
      add(
        `part.${part.id}.quantity`,
        path,
        "Informe quantidade maior que zero.",
      );
    if (!["requested", "replaced"].includes(part.kind))
      add(`part.${part.id}.kind`, path, "Selecione a classificação.");
  }
  if (p.type === "interno" && hasReportTravel(p))
    add(
      "schedule.travel",
      ["E"],
      "Atendimento interno não usa deslocamento; revise o cronograma.",
    );
  for (const day of (p.days || []).filter(hasDayData)) {
    const path = ["E", day.id];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !dateISO(dateParts(day.date)))
      add(`day.${day.id}.date`, path, "Informe a data do dia.");
    if (day.participants !== undefined) {
      for (const person of day.participants)
        if (!ids.includes(person.technicianId))
          add(`day.${day.id}.team`, path, "Revise os profissionais deste dia.");
      if (!day.participants.some((person) => person.present))
        add(`day.${day.id}.team`, path, "Selecione quem trabalhou neste dia.");
      for (const person of day.participants.filter(
        (person) => person.present,
      )) {
        const personPath = [...path, `person-${person.technicianId}`];
        try {
          const periods = dayPeriods(participantDay(day, person.technicianId));
          if (!periods.some((period) => period.start && period.end))
            add(
              `day.${day.id}.${person.technicianId}`,
              personPath,
              "Informe os horários deste profissional.",
            );
          for (const period of periods) {
            // Shared periods are read-only here; their owner receives the field error.
            if (
              person.sameHoursAs ||
              (person.sameVehicleAs && period.kind !== "work")
            )
              continue;
            const periodPath = [
              ...personPath,
              `periods-${period.kind}`,
              period.id,
            ];
            const prefix = `period.${day.id}.${person.technicianId}.${period.id}`;
            if (
              !period.start ||
              !/^([01]\d|2[0-3]):[0-5]\d$/.test(period.start)
            )
              add(
                `${prefix}.start`,
                periodPath,
                "Informe um horário inicial válido.",
              );
            if (!period.end || !/^([01]\d|2[0-3]):[0-5]\d$/.test(period.end))
              add(
                `${prefix}.end`,
                periodPath,
                "Informe um horário final válido.",
              );
            if (period.start && period.end) {
              const pause = Number(period.pauseMinutes || 0);
              if (
                !Number.isFinite(pause) ||
                pause < 0 ||
                pause > periodMinutes(period)
              )
                add(
                  `${prefix}.pause`,
                  periodPath,
                  "A pausa deve caber no período.",
                );
            }
          }
        } catch (error) {
          add(
            `day.${day.id}.${person.technicianId}`,
            personPath,
            (error as Error).message,
          );
        }
        for (const key of ["odometerStart", "odometerEnd"] as const) {
          const value = person[key];
          if (
            value &&
            value !== "N/A" &&
            (!Number.isFinite(Number(value)) || Number(value) < 0)
          )
            add(
              `day.${day.id}.${person.technicianId}.${key}`,
              personPath,
              "Informe KM positivo ou N/A.",
            );
        }
        if (
          person.odometerStart &&
          person.odometerEnd &&
          Number(person.odometerEnd) < Number(person.odometerStart)
        )
          add(
            `day.${day.id}.${person.technicianId}.odometerEnd`,
            personPath,
            "KM final deve ser maior ou igual ao inicial.",
          );
      }
    } else if (
      dayPeriods(day).some(
        (period) => Boolean(period.start) !== Boolean(period.end),
      )
    ) {
      add(
        `day.${day.id}.periods`,
        path,
        "Complete início e fim de cada período.",
      );
    }
    try {
      dayTotals(day);
    } catch (error) {
      add(`day.${day.id}.totals`, path, (error as Error).message);
    }
  }
  for (const [key, label] of [
    ["concluded", "Atendimento concluído"],
    ["released", "Equipamento liberado"],
    ["photosSent", "Fotos enviadas"],
  ])
    if (!p[key as keyof Report])
      add(key, ["F"], `Responda ${label.toLowerCase()}.`);
  if (!p.technicianSignature?.uri)
    add("technicianSignature", ["F"], "Assinatura do técnico obrigatória.");
  if (!p.clientSignature?.uri)
    add("clientSignature", ["F"], "Assinatura do cliente obrigatória.");
  return issues;
}
