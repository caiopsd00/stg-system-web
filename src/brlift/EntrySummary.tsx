import type { Catalog, Entry, Media, Report } from "../contracts/domain";
import {
  dayTotals,
  dayPeriods,
  periodLabels,
  hasPeriodData,
  equipmentFields,
  hasDayData,
  reportTeam,
  participantDay,
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
export function EntrySummary({
  entry,
  technicians,
}: {
  entry: Entry;
  technicians: Catalog[];
}) {
  const p = entry.payload;
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
            .filter((f) => f.key !== "000")
            .map((f) => (
              <Value
                key={f.key}
                label={f.label}
                value={p.documentFields[f.key]}
              />
            ))}
        </div>
        {Object.entries(p.documentImages || {})
          .filter(([k]) => ["013", "014"].includes(k))
          .map(([k, v]) => (
            <Images key={k} items={v as Media[]} />
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
        <h3>Assinatura</h3>
        <Images items={p.signature ? [p.signature] : []} />
      </div>
    );
  }
  const r = p as Report;
  return (
    <div className="br-record-summary">
      <h3>A. Identificação</h3>
      <div className="br-grid">
        <Value
          label="Tipo"
          value={r.type === "interno" ? "Interno" : "Externo"}
        />
        <Value label="Operador" value={r.operator} />
        <Value label="Solicitante" value={r.requester} />
        <Value label="Local" value={r.location} />
      </div>
      <h4>Equipe do atendimento</h4>
      {reportTeam(entry)
        .filter((m) => m.technicianId)
        .map((m, i) => (
          <Value
            key={m.technicianId}
            label={`${i + 1}. ${m.role === "auxiliary" ? "Auxiliar" : "Técnico"}`}
            value={
              p.teamSnapshot?.find(
                (t: any) => t.technicianId === m.technicianId,
              )?.name ||
              technicians.find((t) => t.id === m.technicianId)?.name ||
              "Não informado"
            }
          />
        ))}
      <h3>B. Equipamento</h3>
      <div className="br-grid">
        {[
          ...equipmentFields,
          ["odometer", "KM na data"],
          ["hourmeterLower", "Horímetro inferior na data"],
          ["hourmeterUpper", "Horímetro superior na data"],
        ].map(([k, label]) => (
          <Value key={k} label={label} value={r.equipment[k]} />
        ))}
      </div>
      <h3>C. Motivos, serviços e pendências</h3>
      {r.reasons.map((reason, i) => (
        <div key={reason.id} className="br-block">
          <Value label={`Motivo ${i + 1}`} value={reason.description} />
          {reason.services.map((s, j) => (
            <div key={s.id}>
              <Value label={`Serviço ${j + 1}`} value={s.description} />
              <Value label="Observações do serviço" value={s.notes} />
              <Images items={s.photos} />
            </div>
          ))}
          <Value
            label="Pendências / próximos passos"
            value={reason.pending || "Nenhuma informada"}
          />
        </div>
      ))}
      <h3>D. Peças utilizadas / solicitadas</h3>
      {!r.parts.length && <p>Nenhuma peça informada.</p>}
      {r.parts.map((part) => (
        <div key={part.id} className="br-block">
          <Value label={part.code} value={part.description} />
          <Value label="Fornecedor" value={part.supplier} />
          <Value
            label="Quantidade / classificação"
            value={`${part.quantity} — ${part.kind === "replaced" ? "Substituída" : "Solicitada"}`}
          />
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
          total = `${t.work} min de trabalho · ${t.travel} min de deslocamento · ${t.km} km`;
        } catch {
          total = "Revise os dados deste dia.";
        }
        return (
          <div key={day.id} className="br-block">
            <h4>
              Dia {i + 1} —{" "}
              {new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
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
                <Value
                  label="KM inicial / final"
                  value={`${person.day.odometerStart || "—"} / ${person.day.odometerEnd || "—"}`}
                />
                {(["outbound", "work", "inbound"] as const).flatMap((kind) =>
                  dayPeriods(person.day)
                    .filter((p) => p.kind === kind && hasPeriodData(p))
                    .map((period, i) => (
                      <Value
                        key={period.id}
                        label={`${periodLabels[kind]} ${i + 1}`}
                        value={`${period.start || "—"} às ${period.end || "—"} · pausa: ${period.pauseMinutes || "0"} min`}
                      />
                    )),
                )}
              </div>
            ))}
            <p>{total}</p>
          </div>
        );
      })}
      <h3>F. Finalização</h3>
      <Value label="Atendimento concluído" value={r.concluded} />
      <Value label="Equipamento liberado" value={r.released} />
      <Value label="Fotos enviadas" value={r.photosSent} />
      <Value label="Observações finais" value={r.observations} />
      <h4>Assinatura do técnico</h4>
      <Images items={r.technicianSignature ? [r.technicianSignature] : []} />
      <h4>Assinatura do cliente</h4>
      <Images items={r.clientSignature ? [r.clientSignature] : []} />
    </div>
  );
}
