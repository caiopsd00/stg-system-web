import { useEffect, useRef, useState } from "react";
import type { Catalog, CatalogKind, Entry, Kind } from "../contracts/domain";
import {
  newReport,
  validateReport,
  validateReportTeam,
  localDate,
} from "../contracts/domain";
import {
  createTemplateSections,
  documentFields,
} from "../contracts/inspection-template";
import { catalogs, download, request, saveEntry } from "./api";
import { IdentificationFields } from "./IdentificationFields";
import { EntrySummary } from "./EntrySummary";
import { Field } from "./Fields";
import { ReportEditor } from "./ReportEditor";
import { ReportTeamEditor } from "./ReportTeamEditor";
import { InspectionEditor } from "./InspectionEditor";
import { UserRegistration } from "./UserRegistration";
import { ProfileEditor } from "./ProfileEditor";
import { usePendingMedia } from "./media-activity";
import { finalizationIssues } from "./form-validation";
import { FormErrors } from "./FormErrors";
import { openFold } from "./Accordion";
import "./style.css";
const today = localDate;
const emptyCatalog = (): Record<CatalogKind, Catalog[]> => ({
  clients: [],
  technicians: [],
  equipment: [],
  parts: [],
});
const emptyFilters = () => ({
  q: "",
  from: "",
  to: "",
  clientId: "",
  technicianId: "",
  status: "",
});
export default function App() {
  const pendingMedia = usePendingMedia();
  const [user, setUser] = useState<any>(null),
    [boot, setBoot] = useState(true),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [accountPage, setAccountPage] = useState<"users" | "profile" | null>(
    null,
  );
  const [kind, setKind] = useState<Kind>("reports"),
    [entries, setEntries] = useState<Entry[]>([]),
    [entry, setEntry] = useState<Entry | null>(null),
    [detail, setDetail] = useState<Entry | null>(null);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [filters, setFilters] = useState(emptyFilters),
    [dirty, setDirty] = useState(false);
  const [finalizeAttempted, setFinalizeAttempted] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const formIssues =
    entry && finalizeAttempted ? finalizationIssues(entry) : [];
  const listRequestVersion = useRef(0);
  const catalogRequestVersion = useRef(0);
  useEffect(() => {
    request("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setBoot(false));
  }, []);
  async function reloadCatalog() {
    const version = ++catalogRequestVersion.current;
    const [c, t, e, p] = await Promise.all(
      ["clients", "technicians", "equipment", "parts"].map((k) =>
        catalogs(k as CatalogKind),
      ),
    );
    if (version === catalogRequestVersion.current)
      setCatalog({
        clients: c.items,
        technicians: t.items,
        equipment: e.items,
        parts: p.items,
      });
  }
  async function reload() {
    const version = ++listRequestVersion.current;
    const params = new URLSearchParams(
      Object.entries(filters).filter(
        ([key, value]) =>
          value && (user?.role === "admin" || key !== "technicianId"),
      ),
    );
    const r = await request("/" + kind + "?" + params);
    if (version === listRequestVersion.current) setEntries(r.items);
  }
  function clearSessionData() {
    listRequestVersion.current++;
    catalogRequestVersion.current++;
    setEntries([]);
    setCatalog(emptyCatalog());
    setFilters(emptyFilters());
    setEntry(null);
    setDetail(null);
    setDirty(false);
    setFinalizeAttempted(false);
    setConfirmFinalize(false);
    setAccountPage(null);
    setError("");
    setNotice("");
  }
  useEffect(() => {
    if (user) void reloadCatalog().catch((e) => setError(e.message));
  }, [user]);
  useEffect(() => {
    if (user) void reload().catch((e) => setError(e.message));
  }, [user, kind, filters]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  function update(e: Entry) {
    setEntry(e);
    setDirty(true);
  }
  function create() {
    const id = crypto.randomUUID();
    const ownTechnician =
      user?.role === "admin"
        ? null
        : catalog.technicians.find((item) => item.data.userId === user.id);
    setEntry({
      id,
      kind,
      number: "",
      clientId: null,
      technicianId: ownTechnician?.id || null,
      equipmentId: null,
      date: today(),
      status: "draft",
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      payload:
        kind === "reports"
          ? newReport()
          : {
              id,
              name: "Inspeção BR LIFT",
              documentFields: Object.fromEntries(
                documentFields.map((f) => [
                  f.key,
                  ["009", "164"].includes(f.key)
                    ? ownTechnician?.name || ""
                    : f.defaultValue || "",
                ]),
              ),
              documentImages: {},
              sections: createTemplateSections(),
            },
    });
    setDirty(false);
    setFinalizeAttempted(false);
    setConfirmFinalize(false);
    setError("");
    setNotice("");
  }
  function leave() {
    if (busy) {
      setError("Aguarde a operação em andamento antes de sair.");
      return false;
    }
    if (pendingMedia) {
      setError("Aguarde o envio das fotos e assinaturas antes de sair.");
      return false;
    }
    if (
      dirty &&
      !confirm("Há alterações não salvas. Deseja sair do formulário?")
    )
      return false;
    setEntry(null);
    setDirty(false);
    setFinalizeAttempted(false);
    setConfirmFinalize(false);
    setError("");
    void reload().catch((cause) => setError((cause as Error).message));
    return true;
  }
  function navigate(target: Kind | "users" | "profile") {
    if (
      target === "users" || target === "profile"
        ? accountPage === target
        : !accountPage && kind === target
    )
      return;
    if (entry && !leave()) return;
    setDetail(null);
    setError("");
    setNotice("");
    if (target === "users" || target === "profile") {
      setAccountPage(target);
    } else {
      setAccountPage(null);
      setKind(target);
    }
  }
  function requestFinalize() {
    if (!entry) return;
    if (pendingMedia) {
      setError("Aguarde o envio das fotos e assinaturas antes de finalizar.");
      return;
    }
    setFinalizeAttempted(true);
    setError("");
    const issues = finalizationIssues(entry);
    if (issues.length) {
      requestAnimationFrame(() => {
        if (issues[0].path.length) openFold(issues[0].path);
        requestAnimationFrame(() => {
          const first = Array.from(
            document.querySelectorAll<HTMLElement>(
              '.br-inline-error, [aria-invalid="true"]',
            ),
          ).find((element) => element.getClientRects().length > 0);
          first?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      });
      return;
    }
    try {
      if (entry.kind === "reports") {
        validateReportTeam(entry);
        validateReport(entry.payload, true);
      }
      setConfirmFinalize(true);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function saveDraft() {
    if (!entry || busy || pendingMedia) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveEntry({ ...entry, status: "draft" });
      setEntry(saved);
      setDirty(false);
      setNotice("Rascunho salvo no servidor.");
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finalize(withPdf: boolean) {
    if (!entry) return;
    if (finalizationIssues(entry).length) {
      setConfirmFinalize(false);
      setFinalizeAttempted(true);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = {
        ...entry,
        status: "finalized" as const,
      };
      if (next.kind === "reports") {
        validateReportTeam(next);
        validateReport(next.payload, true);
      } else
        next.payload = {
          ...next.payload,
          signature: undefined,
          documentFields: {
            ...next.payload.documentFields,
            "000": next.number,
          },
          finalizedAt: new Date().toISOString(),
        };
      const saved = await saveEntry(next);
      setConfirmFinalize(false);
      setEntry(null);
      setDirty(false);
      setFinalizeAttempted(false);
      setDetail(null);
      setNotice("Registro finalizado e salvo no servidor.");
      if (withPdf) {
        try {
          await download(saved);
        } catch (error) {
          setError(
            `Registro finalizado, mas o PDF não foi baixado: ${(error as Error).message}`,
          );
        }
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
      setConfirmFinalize(false);
    } finally {
      setBusy(false);
    }
  }
  async function pdf(e: Entry) {
    setBusy(true);
    try {
      await download(e);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (boot) return <main className="br-login">Carregando BR LIFT...</main>;
  if (!user)
    return (
      <main className="br-login">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await request("/auth/login", { email, password });
              setPassword("");
              clearSessionData();
              setUser(r.user);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h1>BR LIFT</h1>
          <p>Atendimento técnico · Inspeções · Gestão</p>
          <Field
            label="E-mail"
            type="email"
            value={email}
            onChange={setEmail}
          />
          <Field
            label="Senha"
            type="password"
            value={password}
            onChange={setPassword}
          />
          {error && <p role="alert">{error}</p>}
          <button className="primary" disabled={busy}>
            Entrar
          </button>
        </form>
      </main>
    );
  return (
    <div className="br-app">
      <header className="br-header">
        <div>
          <strong>BR LIFT</strong>
          <small>Operação e gestão</small>
        </div>
        <nav>
          <button
            aria-pressed={!accountPage && kind === "reports"}
            onClick={() => navigate("reports")}
          >
            Operacional
          </button>
          <button
            aria-pressed={!accountPage && kind === "inspections"}
            onClick={() => navigate("inspections")}
          >
            Inspeções
          </button>
          {user.role === "admin" && (
            <button
              aria-pressed={accountPage === "users"}
              onClick={() => navigate("users")}
            >
              Cadastros
            </button>
          )}
          {user.role !== "admin" && (
            <button
              aria-pressed={accountPage === "profile"}
              onClick={() => navigate("profile")}
            >
              Editar perfil
            </button>
          )}
        </nav>
        <div className="br-header-actions">
          <button
            className="br-logout-button"
            disabled={busy || pendingMedia > 0}
            onClick={async () => {
              if (dirty && !confirm("Sair sem salvar?")) return;
              await request("/auth/logout", {});
              clearSessionData();
              setUser(null);
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <main className="br-main">
        {error && (
          <div className="br-alert" role="alert">
            {error}
            <button onClick={() => setError("")}>Fechar</button>
          </div>
        )}
        {notice && (
          <div role="status" className="br-notice">
            {notice}
          </div>
        )}
        {accountPage === "users" ? (
          <UserRegistration
            currentUserId={user.id}
            onUserUpdated={(updated) => {
              if (updated.id === user.id && updated.role !== user.role)
                clearSessionData();
              setUser((current: any) => ({ ...current, ...updated }));
              if (updated.id === user.id && updated.role !== "admin")
                setAccountPage(null);
            }}
            onCreated={async () => {
              try {
                await reloadCatalog();
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          />
        ) : accountPage === "profile" ? (
          <ProfileEditor
            onUpdated={(updated) => {
              setUser((current: any) => ({ ...current, ...updated }));
              void reloadCatalog().catch((cause) =>
                setError((cause as Error).message),
              );
            }}
          />
        ) : entry ? (
          <>
            <div className="br-title">
              <div>
                <button onClick={leave}>← Voltar à gestão</button>
                <h1>
                  {entry.kind === "reports"
                    ? "Atendimento técnico"
                    : "Inspeção técnica"}{" "}
                  {entry.number}
                </h1>
                <p>
                  {dirty
                    ? "Alterações não salvas"
                    : entry.version
                      ? "Versão " + entry.version + " salva"
                      : "Novo registro"}
                </p>
              </div>
            </div>
            <FormErrors issues={formIssues}>
              <fieldset
                className="br-form-content"
                disabled={busy || pendingMedia > 0}
              >
                {(entry.kind === "reports" || entry.kind === "inspections") && (
                  <div className="br-grid" style={{ marginBottom: 20 }}>
                    <Field
                      label="Número identificador (único)"
                      error={
                        formIssues.find((issue) => issue.key === "number")
                          ?.message
                      }
                      value={entry.number}
                      onChange={(number) => update({ ...entry, number })}
                      required
                    />
                  </div>
                )}
                {entry.kind === "reports" ? (
                  <ReportEditor
                    technicians={catalog.technicians}
                    key={entry.id}
                    identification={
                      <IdentificationFields
                        entry={entry}
                        onChange={update}
                        catalog={catalog}
                        reload={reloadCatalog}
                      />
                    }
                    team={
                      <ReportTeamEditor
                        entry={entry}
                        onChange={update}
                        technicians={catalog.technicians}
                        reload={reloadCatalog}
                      />
                    }
                    entry={entry}
                    onChange={update}
                    equipment={catalog.equipment}
                    parts={catalog.parts}
                    reloadCatalog={reloadCatalog}
                    validationIssues={formIssues}
                  />
                ) : (
                  <InspectionEditor
                    key={entry.id}
                    entry={entry}
                    onChange={update}
                    technicians={catalog.technicians}
                    reloadCatalog={reloadCatalog}
                    validationIssues={formIssues}
                    identification={
                      <IdentificationFields
                        entry={entry}
                        onChange={update}
                        catalog={catalog}
                        reload={reloadCatalog}
                      />
                    }
                  />
                )}
              </fieldset>
              <footer className="br-save">
                {pendingMedia > 0 && (
                  <p role="status">Aguarde o envio das fotos e assinaturas…</p>
                )}
                {entry.status === "draft" && (
                  <button
                    type="button"
                    disabled={busy || pendingMedia > 0}
                    onClick={saveDraft}
                  >
                    Salvar rascunho
                  </button>
                )}
                <button
                  className="primary"
                  disabled={busy || pendingMedia > 0}
                  onClick={requestFinalize}
                >
                  Finalizar{" "}
                  {entry.kind === "reports" ? "atendimento" : "inspeção"}
                </button>
              </footer>
            </FormErrors>
            {confirmFinalize && (
              <div
                className="br-modal"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget)
                    setConfirmFinalize(false);
                }}
              >
                <section
                  className="br-dialog br-finalize-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="br-finalize-title"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setConfirmFinalize(false);
                  }}
                >
                  <h2 id="br-finalize-title">
                    Finalizar{" "}
                    {entry.kind === "reports" ? "atendimento" : "inspeção"}?
                  </h2>
                  <p>
                    Todos os campos obrigatórios estão válidos. Escolha como
                    deseja concluir.
                  </p>
                  <div className="br-actions">
                    <button
                      type="button"
                      onClick={() => setConfirmFinalize(false)}
                      disabled={busy}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => finalize(false)}
                      disabled={busy}
                    >
                      Só finalizar
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => finalize(true)}
                      disabled={busy}
                    >
                      Finalizar e baixar PDF
                    </button>
                  </div>
                </section>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="br-title">
              <div>
                <p className="muted">
                  {user.role === "admin"
                    ? "PAINEL DE GESTÃO"
                    : "MEUS REGISTROS"}
                </p>
                <h1>
                  {kind === "reports"
                    ? user.role === "admin"
                      ? "Atendimentos técnicos"
                      : "Meus atendimentos"
                    : user.role === "admin"
                      ? "Inspeções"
                      : "Minhas inspeções"}
                </h1>
              </div>
              <button className="primary" onClick={create}>
                + {kind === "reports" ? "Novo atendimento" : "Nova inspeção"}
              </button>
            </div>
            <div className="br-metrics">
              <div>
                <strong>{entries.length}</strong> registros encontrados
              </div>
              <div>
                <strong>
                  {entries.filter((e) => e.status === "draft").length}
                </strong>{" "}
                em preenchimento
              </div>
              <div>
                <strong>
                  {entries.filter((e) => e.status === "finalized").length}
                </strong>{" "}
                finalizados
              </div>
            </div>
            <section className="br-section br-grid">
              <Field
                label={
                  user.role === "admin"
                    ? "Buscar número, cliente ou técnico"
                    : "Buscar número ou cliente"
                }
                value={filters.q}
                onChange={(q) => setFilters({ ...filters, q })}
              />
              <Field
                label="De"
                type="date"
                value={filters.from}
                onChange={(from) => setFilters({ ...filters, from })}
              />
              <Field
                label="Até"
                type="date"
                value={filters.to}
                onChange={(to) => setFilters({ ...filters, to })}
              />
              <label>
                Cliente
                <select
                  value={filters.clientId}
                  onChange={(e) =>
                    setFilters({ ...filters, clientId: e.target.value })
                  }
                >
                  <option value="">Todos</option>
                  {catalog.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              {user.role === "admin" && (
                <label>
                  Técnico
                  <select
                    value={filters.technicianId}
                    onChange={(e) =>
                      setFilters({ ...filters, technicianId: e.target.value })
                    }
                  >
                    <option value="">Todos</option>
                    {catalog.technicians.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Status
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters({ ...filters, status: e.target.value })
                  }
                >
                  <option value="">Todos</option>
                  <option value="draft">Em preenchimento</option>
                  <option value="finalized">Finalizado</option>
                </select>
              </label>
            </section>
            <div className="br-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Número / data</th>
                    <th>Cliente</th>
                    <th>Técnico</th>
                    <th>Status / progresso</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const items =
                      e.payload.sections?.flatMap((s: any) => s.items) || [];
                    return (
                      <tr key={e.id}>
                        <td>
                          <strong>{e.number}</strong>
                          <small>{e.date.split("-").reverse().join("/")}</small>
                        </td>
                        <td>{e.clientName || "Não informado"}</td>
                        <td>{e.technicianName || "Não informado"}</td>
                        <td>
                          {e.status === "finalized"
                            ? "Finalizado"
                            : "Em preenchimento"}
                          {items.length > 0 && (
                            <small>
                              {items.filter((i: any) => i.situation).length}/
                              {items.length} itens
                            </small>
                          )}
                        </td>
                        <td>
                          <div className="br-actions">
                            <button onClick={() => setDetail(e)}>Resumo</button>
                            <button
                              onClick={() => {
                                setEntry(structuredClone(e));
                                setError("");
                                setNotice("");
                              }}
                            >
                              Editar
                            </button>
                            <button disabled={busy} onClick={() => pdf(e)}>
                              PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!entries.length && (
                <p className="br-empty">
                  Nenhum registro encontrado. Crie o primeiro ou ajuste os
                  filtros.
                </p>
              )}
            </div>
          </>
        )}
        {detail && (
          <div
            className="br-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Resumo do registro"
          >
            <div className="br-dialog">
              <h2>{detail.number}</h2>
              <p>
                {detail.clientName} · {detail.technicianName}
              </p>
              <p>
                {detail.date.split("-").reverse().join("/")} ·{" "}
                {detail.status === "finalized"
                  ? "Finalizado"
                  : "Em preenchimento"}
              </p>
              <EntrySummary entry={detail} technicians={catalog.technicians} />
              <div className="br-actions">
                <button
                  onClick={() => {
                    setEntry(structuredClone(detail));
                    setDetail(null);
                  }}
                >
                  Editar
                </button>
                <button disabled={busy} onClick={() => pdf(detail)}>
                  Baixar PDF
                </button>
                <button onClick={() => setDetail(null)}>Fechar</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
