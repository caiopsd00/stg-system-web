import type { Catalog, Day, Entry, Media, Report } from "../contracts/domain";
import {
  dayTotals,
  formatDuration,
  dayPeriods,
  periodLabels,
  hasPeriodData,
  equipmentFields,
  hasDayData,
  reportTeam,
  participantDay,
  reportTypeLabels,
  signatureDateTime,
  periodSummary,
} from "../contracts/domain";
import { documentFields } from "../contracts/inspection-template";
import { mediaUrl } from "./api";

function Value({ label, value }: { label: string; value: unknown }) {
  return (
    <p>
      <strong>{label}: </strong>
      {String(value ?? "").trim() || "Não informado"}
    </p>
  );
}
function Images({ items = [] }: { items?: Media[] }) {
  return (
    <div className="br-summary-images">
      {items.map((m, i) => (
        <a
          key={`${m.id || m.uri}:${i}`}
          href={mediaUrl(m.uri)}
          target="_blank"
          rel="noreferrer"
        >
          <img src={mediaUrl(m.uri)} alt={m.name || `Imagem ${i + 1}`} />
        </a>
      ))}
    </div>
  );
}

function dayLabel(day: Day) {
  return new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function PeriodValues({ day }: { day: Day }) {
  return (
    <>
      {(day.odometerStart || day.odometerEnd) && (
        <Value
          label="KM histórico do dia (inicial / final)"
          value={`${day.odometerStart || "—"} / ${day.odometerEnd || "—"}`}
        />
      )}
      {(["outbound", "work", "inbound"] as const).flatMap((kind) =>
        dayPeriods(day)
          .filter((period) => period.kind === kind && hasPeriodData(period))
          .map((period, i) => (
            <Value
              key={period.id}
              label={`${periodLabels[kind]} ${i + 1}`}
              value={
                `${period.start || "—"} às ${period.end || "—"} · pausa: ${formatDuration(Number(period.pauseMinutes || 0))} · Total: ${periodSummary(period)}` +
                (period.odometerStart || period.odometerEnd
                  ? ` · KM inicial: ${period.odometerStart || "—"} · KM final: ${period.odometerEnd || "—"}`
                  : "")
              }
            />
          )),
      )}
    </>
  );
}

function SignatureSummary({
  label,
  image,
  fallback,
}: {
  label: string;
  image?: Media;
  fallback?: string;
}) {
  return (
    <>
      <h4>{label}</h4>
      {image ? (
        <>
          <Images items={[image]} />
          <p>
            {[image.signerName || fallback, signatureDateTime(image.createdAt)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      ) : (
        <p>Não registrada.</p>
      )}
    </>
  );
}
export function EntrySummary({
  entry,
  technicians,
}: {
  entry: Entry;
  technicians: Catalog[];
}) {
  const p = entry.payload;
  const vehicle = p.vehicleSnapshot;
  const vehicleLabel =
    vehicle &&
    [vehicle.plate, vehicle.model, vehicle.color, vehicle.rentalCompany]
      .filter(Boolean)
      .join(" · ");
  if (entry.kind === "inspections") {
    const all = p.sections.flatMap((s: any) => s.items);
    return (
      <div className="br-record-summary">
        <h3>Dados da inspeção</h3>
        <p>
          {all.filter((i: any) => i.situation).length}/{all.length} itens
          preenchidos
        </p>
        <div className="br-grid">
          {documentFields
            .filter((f) => !["000", "009", "011", "165"].includes(f.key))
            .filter((f) => {
              const separate =
                "equipmentPlate" in p.documentFields ||
                "equipmentFleet" in p.documentFields;
              return f.key === "008"
                ? !separate
                : ["equipmentPlate", "equipmentFleet"].includes(f.key)
                  ? separate
                  : true;
            })
            .map((f) => (
              <Value
                key={f.key}
                label={
                  f.key === "006"
                    ? "Hor. Inferior"
                    : f.key === "007"
                      ? "KM"
                      : f.label
                }
                value={p.documentFields[f.key]}
              />
            ))}
          <Value
            label="Hor. Superior"
            value={p.documentFields.hourmeterUpper}
          />
          {vehicleLabel && <Value label="Veículo" value={vehicleLabel} />}
        </div>
        {Object.entries(p.documentImages || {})
          .filter(([k]) => ["013", "014"].includes(k))
          .map(([k, v]) => (
            <Images key={k} items={v as Media[]} />
          ))}
        <h3>Cronograma de inspeção</h3>
        {!(p.days || []).some(hasDayData) && (
          <p>Nenhum dia com dados operacionais.</p>
        )}
        {((p.days || []) as Day[]).filter(hasDayData).map((day, i) => (
          <div key={day.id} className="br-block">
            <h4>
              Dia {i + 1} — {dayLabel(day)}
            </h4>
            <Value label="Observações do dia" value={day.notes} />
            <PeriodValues day={day} />
          </div>
        ))}
        {p.sections.map((s: any) => (
          <details key={s.id} className="br-block">
            <summary>
              {s.name} — {s.items.filter((i: any) => i.situation).length}/
              {s.items.length}
            </summary>
            {s.items.map((i: any) => (
              <div key={i.id} className="br-block">
                <Value
                  label={`${i.code} — ${i.name}`}
                  value={i.situation || "Pendente"}
                />
                <Value label="Observações" value={i.observation} />
                <Images items={i.images} />
                {(i.extraImageSlots || []).map((slot: string) => (
                  <div key={slot}>
                    <Value label="Registro complementar" value={slot} />
                    <Images items={p.documentImages[slot]} />
                  </div>
                ))}
              </div>
            ))}
          </details>
        ))}
        <h3>Resultado e assinaturas</h3>
        <Value label="Resultado da vistoria" value={p.documentFields["011"]} />
        <Value label="Inspeção aprovada por" value={p.documentFields["165"]} />
        <SignatureSummary
          label="Assinatura do técnico"
          image={p.technicianSignature}
          fallback={entry.technicianName}
        />
        <SignatureSummary
          label="Assinatura do cliente"
          image={p.clientSignature || p.signature}
          fallback={entry.clientName}
        />
      </div>
    );
  }
  const r = p as Report;
  return (
    <div className="br-record-summary">
      <h3>A. Identificação</h3>
      <div className="br-grid">
        <Value label="Tipo" value={reportTypeLabels[r.type] || r.type} />
        {vehicleLabel && <Value label="Veículo" value={vehicleLabel} />}
        <Value label="Solicitante" value={r.requester} />
        <Value label="Local" value={r.location} />
      </div>
      <h4>Equipe do atendimento</h4>
      {reportTeam(entry)
        .filter((m) => m.technicianId)
        .map((m, i) => (
          <div key={m.technicianId}>
            <Value
              label={`${i + 1}. ${m.role === "auxiliary" ? "Auxiliar" : "Técnico"}`}
              value={
                p.teamSnapshot?.find(
                  (t: any) => t.technicianId === m.technicianId,
                )?.name ||
                technicians.find((t) => t.id === m.technicianId)?.name ||
                "Não informado"
              }
            />
            {m.charged && <Value label="Serviço cobrado" value={m.charged} />}
          </div>
        ))}
      <h3>B. Equipamento</h3>
      <div className="br-grid">
        {equipmentFields
          .filter(([key]) => key !== "nominalCapacity")
          .map(([k, label]) => (
            <Value key={k} label={label} value={r.equipment[k]} />
          ))}
        <Value label="Operador" value={r.operator} />
      </div>
      <h4>Horímetro e quilometragem</h4>
      <div className="br-grid">
        <Value label="KM" value={r.equipment.odometer} />
        <Value
          label="Hor. Inferior"
          value={r.equipment.hourmeterLower || r.equipment.hourmeter}
        />
        <Value label="Hor. Superior" value={r.equipment.hourmeterUpper} />
      </div>
      <h3>C. Descrição do serviço</h3>
      {r.reasons.map((reason, i) => (
        <div key={reason.id} className="br-block">
          <Value label={`Motivo ${i + 1}`} value={reason.description} />
          {reason.services.map((s, j) => (
            <div key={s.id}>
              <Value
                label={`Serviço realizado ${j + 1}`}
                value={s.description}
              />
              <Value label="Observações do serviço" value={s.notes} />
              {j === 0 && (
                <Value
                  label="Pendências / próximos passos"
                  value={reason.pending || "Nenhuma informada"}
                />
              )}
              {s.completed && (
                <Value label="Serviço concluído" value={s.completed} />
              )}
              <Images items={s.photos} />
            </div>
          ))}
          {!reason.services.length && (
            <Value
              label="Pendências / próximos passos"
              value={reason.pending || "Nenhuma informada"}
            />
          )}
        </div>
      ))}
      <h3>D. Peças utilizadas / solicitadas</h3>
      {!r.parts.length && <p>Nenhuma peça informada.</p>}
      {r.parts.map((part) => (
        <div key={part.id} className="br-block">
          <Value label={part.code} value={part.description} />
          <Value label="Fornecedor" value={part.supplier} />
          <Value
            label="Tipo de aplicação"
            value={part.kind === "replaced" ? "Substituição" : "Solicitação"}
          />
          <Value label="Quantidade" value={part.quantity} />
          {!!part.codeHistory.length && (
            <Value
              label="Códigos anteriores"
              value={part.codeHistory.join(", ")}
            />
          )}
        </div>
      ))}
      <h3>E. Cronograma</h3>
      {!r.days.some(hasDayData) && <p>Nenhum dia com dados operacionais.</p>}
      {r.days.filter(hasDayData).map((day, i) => {
        let total = "";
        try {
          const t = dayTotals(day);
          total = `${formatDuration(t.work)} de trabalho · ${formatDuration(t.travel)} de deslocamento · ${t.km} km`;
        } catch {
          total = "Revise os dados deste dia.";
        }
        return (
          <div key={day.id} className="br-block">
            <h4>
              Dia {i + 1} — {dayLabel(day)}
            </h4>
            <Value label="Observações do dia" value={day.notes} />
            {(day.participants === undefined
              ? [
                  {
                    day,
                    id: "legacy",
                    name: "Horários registrados",
                    sameHoursAs: null,
                    sameVehicleAs: null,
                  },
                ]
              : day.participants
                  .filter((x) => x.present)
                  .map((person) => ({
                    day: participantDay(day, person.technicianId),
                    id: person.technicianId,
                    name:
                      technicians.find((t) => t.id === person.technicianId)
                        ?.name ||
                      p.teamSnapshot?.find(
                        (t: { technicianId: string }) =>
                          t.technicianId === person.technicianId,
                      )?.name ||
                      person.technicianId,
                    sameHoursAs: person.sameHoursAs,
                    sameVehicleAs: person.sameVehicleAs,
                  }))
            ).map((person) => (
              <div key={person.id}>
                <h4>{person.name}</h4>
                {person.sameHoursAs && (
                  <Value
                    label="Mesmo horário de"
                    value={
                      technicians.find((t) => t.id === person.sameHoursAs)
                        ?.name ||
                      p.teamSnapshot?.find(
                        (t: { technicianId: string }) =>
                          t.technicianId === person.sameHoursAs,
                      )?.name ||
                      person.sameHoursAs
                    }
                  />
                )}
                {person.sameVehicleAs && (
                  <Value
                    label="Mesmo carro de (KM não duplicado)"
                    value={
                      technicians.find((t) => t.id === person.sameVehicleAs)
                        ?.name ||
                      p.teamSnapshot?.find(
                        (t: { technicianId: string }) =>
                          t.technicianId === person.sameVehicleAs,
                      )?.name ||
                      person.sameVehicleAs
                    }
                  />
                )}
                <PeriodValues day={person.day} />
              </div>
            ))}
            <p>{total}</p>
          </div>
        );
      })}
      <h3>F. Finalização</h3>
      <Value label="Atendimento concluído" value={r.concluded} />
      <Value label="Equipamento liberado" value={r.released} />
      <Value label="Observações finais" value={r.observations} />
      <SignatureSummary
        label={
          r.primaryTechnicianRole === "auxiliary"
            ? "Assinatura do auxiliar"
            : "Assinatura do técnico"
        }
        image={r.technicianSignature}
        fallback={entry.technicianName}
      />
      <SignatureSummary
        label="Assinatura do cliente"
        image={r.clientSignature}
        fallback={r.requester || entry.clientName}
      />
    </div>
  );
}
