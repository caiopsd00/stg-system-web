import { useId, useState } from "react";
import type { Catalog } from "../contracts/domain";
import { Field } from "./Fields";
import "./RecordFilters.css";

export const emptyFilters = () => ({ q: "", from: "", to: "", clientId: "", technicianId: "", status: "" });
type Filters = ReturnType<typeof emptyFilters>;

export function RecordFilters({ value, onChange, clients, technicians, showTechnician }: {
  value: Filters;
  onChange: (value: Filters) => void;
  clients: Catalog[];
  technicians: Catalog[];
  showTechnician: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const count = Number(!!(value.from || value.to)) + Number(!!value.clientId) +
    Number(showTechnician && !!value.technicianId) + Number(!!value.status);
  const update = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const options = (items: Catalog[]) => <>
    <option value="">Todos</option>
    {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
  </>;

  return <section className="br-section br-record-filters" aria-label="Busca e filtros">
    <div className="br-record-filter-bar">
      <Field label={showTechnician ? "Buscar número, cliente ou técnico" : "Buscar número ou cliente"} value={value.q} onChange={(q) => update({ q })} />
      <button type="button" className="br-record-filter-toggle" aria-controls={id}
        aria-label={count ? `Filtros (${count} ${count === 1 ? "ativo" : "ativos"})` : "Filtros"}
        aria-expanded={expanded} data-active={count > 0} onClick={() => setExpanded((open) => !open)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <path d="M3 7h6m4 0h8M3 17h11m4 0h3" />
          <circle cx="11" cy="7" r="2" /><circle cx="16" cy="17" r="2" />
        </svg>
        <span>Filtros</span>
        {count > 0 && <small aria-hidden="true">{count}</small>}
      </button>
    </div>
    <div id={id} hidden={!expanded}>
      {expanded && <div className="br-record-filter-panel">
        <div className="br-grid">
          <Field label="De" type="date" value={value.from} onChange={(from) => update({ from })} />
          <Field label="Até" type="date" value={value.to} onChange={(to) => update({ to })} />
          <label>Cliente<select value={value.clientId} onChange={(event) => update({ clientId: event.target.value })}>{options(clients)}</select></label>
          {showTechnician && <label>Técnico<select value={value.technicianId} onChange={(event) => update({ technicianId: event.target.value })}>{options(technicians)}</select></label>}
          <label>Status<select value={value.status} onChange={(event) => update({ status: event.target.value })}>
            <option value="">Todos</option><option value="draft">Em preenchimento</option><option value="finalized">Finalizado</option>
          </select></label>
        </div>
        {!!count && <button type="button" className="br-record-filter-clear" onClick={() => onChange({ ...emptyFilters(), q: value.q })}>Limpar filtros</button>}
      </div>}
    </div>
  </section>;
}
