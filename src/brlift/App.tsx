import { useEffect, useRef, useState } from "react";
import type { Catalog, CatalogKind, Entry, Kind } from "../contracts/domain";
import {
  newReport,
  catalogKinds,
  canAdminister,
  isTechnician,
  singleService,
  type Report,
  validateReport,
  validateReportTeam,
} from "../contracts/domain";
import {
  createTemplateSections,
  documentFields,
} from "../contracts/inspection-template";
import { catalogs, discardConflict, preparePdf, kickSavedVersions, onSaveConflict, onVersionSaved, pendingVersions, request, savedConflicts, saveVersion, stageVersion } from "./api";
import type { SaveConflict } from "./record-outbox";
import { ConfirmationDialog, confirmAction } from "./ConfirmationDialog";
import { PdfActionsDialog } from "./PdfActionsDialog";
import { IdentificationFields } from "./IdentificationFields";
import { EntrySummary } from "./EntrySummary";
import { Field } from "./Fields";
import { RecordFilters, emptyFilters } from "./RecordFilters";
import { ReportEditor } from "./ReportEditor";
import { ReportTeamEditor } from "./ReportTeamEditor";
import { InspectionEditor } from "./InspectionEditor";
import { UserRegistration } from "./UserRegistration";
import { ProfileEditor } from "./ProfileEditor";
import { usePendingMedia } from "./media-activity";
import { finalizationIssues } from "./form-validation";
import { FormErrors } from "./FormErrors";
import { openFold } from "./Accordion";
import { createId } from "./id";
import { Brand } from "./Brand";
import { UserContext } from "./UserContext";
import { recordVisibleToUser } from "./record-access";
import "./style.css";
const emptyCatalog = (): Record<CatalogKind, Catalog[]> => ({
  clients: [],
  technicians: [],
  equipment: [],
  parts: [],
  vehicles: [],
  rentalCompanies: [],
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
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [conflicts, setConflicts] = useState<SaveConflict[]>([]);
  const [resolution, setResolution] = useState<{ conflict: SaveConflict; source: "server" | "local" } | null>(null);
  const [filters, setFilters] = useState(emptyFilters),
    [dirty, setDirty] = useState(false);
  const [finalizeAttempted, setFinalizeAttempted] = useState(false);
  const formIssues =
    entry && finalizeAttempted ? finalizationIssues(entry) : [];
  const entryConflict = entry && conflicts.find(({ entry: copy }) => copy.kind === entry.kind && copy.id === entry.id);
  const listRequestVersion = useRef(0);
  const catalogRequestVersion = useRef(0);
  useEffect(() => {
    request("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setBoot(false));
  }, []);
  useEffect(() => onVersionSaved((saved) => {
    setConflicts(savedConflicts());
    setEntry((current) => current?.id === saved.id && current.version < saved.version
      ? { ...current, version: saved.version }
      : current);
    setEntries((items) => items.map((item) => item.id === saved.id ? saved : item));
  }), []);
  useEffect(() => onSaveConflict(() => {
    setConflicts(savedConflicts());
    void reload().catch(() => undefined);
  }), [user, kind, filters]);
  useEffect(() => {
    window.addEventListener("online", kickSavedVersions);
    return () => window.removeEventListener("online", kickSavedVersions);
  }, []);
  async function reloadCatalog() {
    const version = ++catalogRequestVersion.current;
    const catalogsByKind = await Promise.all(
      catalogKinds.map(
        async (kind) => [kind, (await catalogs(kind)).items] as const,
      ),
    );
    if (version === catalogRequestVersion.current)
      setCatalog(
        Object.fromEntries(catalogsByKind) as Record<CatalogKind, Catalog[]>,
      );
  }
  async function reload() {
    setConflicts(savedConflicts());
    const version = ++listRequestVersion.current;
    const params = new URLSearchParams(
      Object.entries(filters).filter(
        ([key, value]) =>
          value && (canAdminister(user?.role) || key !== "technicianId"),
      ),
    );
    const r = await request("/" + kind + "?" + params);
    if (version === listRequestVersion.current) {
      const items = r.items as Entry[];
      const pending = pendingVersions().filter((item) => item.kind === kind);
      const local = new Map(pending.map((item) => [item.id, item]));
      const visible = items.map((item) => local.get(item.id) || item);
      setEntries(params.size ? visible : [...pending.filter((item) => !items.some((server) => item.id === server.id)), ...visible]);
    }
  }
  function clearSessionData() {
    listRequestVersion.current++;
    catalogRequestVersion.current++;
    setEntries([]);
    setCatalog(emptyCatalog());
    setFilters(emptyFilters());
    setEntry(null);
    setDetail(null);
    setPdfFile(null);
    setConflicts([]);
    setResolution(null);
    setDirty(false);
    setFinalizeAttempted(false);
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
    setEntry((previous) => previous?.id === e.id && previous.version > e.version ? { ...e, version: previous.version } : e);
    setDirty(true);
  }
  function create() {
    if (busy) return;
    setResolution(null);
    const id = createId();
    const ownTechnician = isTechnician(user?.role)
      ? catalog.technicians.find((item) => item.data.userId === user.id)
      : null;
    setEntry({
      id,
      kind,
      number: "",
      clientId: null,
      technicianId: ownTechnician?.id || null,
      equipmentId: null,
      vehicleId: null,
      date: "",
      status: "draft",
      version: 0,
      createdAt: "",
      updatedAt: "",
      payload:
        kind === "reports"
          ? { ...newReport(), formRevision: 2 }
          : {
              formRevision: 2,
              days: [],
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
    setError("");
    setNotice("");
    setBusy(true);
    void request("/" + kind + "/" + id + "/filling-start", {})
      .catch((cause) => setError((cause as Error).message))
      .finally(() => setBusy(false));
  }
  function editRecord(record: Entry) {
    const next = structuredClone(record);
    next.payload.formRevision = 2;
    let merged = false;
    if (next.kind === "reports") {
      const report = next.payload as Report;
      merged = report.reasons.some((reason) => reason.services.length > 1);
      report.reasons = report.reasons.map((reason) => ({
        ...reason,
        services: [singleService(reason)],
      }));
    } else {
      next.payload.days ??= [];
      next.payload.clientSignature ??= next.payload.signature;
    }
    setEntry(next);
    setResolution(null);
    setDirty(false);
    setFinalizeAttempted(false);
    setError("");
    setNotice(
      merged
        ? "Os serviços antigos de cada motivo foram reunidos, preservando descrições, observações e fotos."
        : "",
    );
  }
  async function reviewConflict(conflict: SaveConflict, source: "server" | "local") {
    if (busy || pendingMedia) return;
    if (dirty && !(await confirmAction(
      "Trocar a versão em revisão?", "As alterações ainda não salvas desta revisão serão descartadas.", "Trocar versão", true,
    ))) return;
    setBusy(true);
    try {
      const { item } = await request<{ item: Entry }>("/" + conflict.entry.kind + "/" + conflict.entry.id);
      if (!savedConflicts().some((current) => current.token === conflict.token))
        throw Error("A cópia mudou. Abra as opções de revisão novamente.");
      editRecord(source === "server" ? item : { ...conflict.entry, status: item.status, version: item.version });
      setDetail(null);
      setResolution({ conflict, source });
      setNotice(source === "local"
        ? "Você está revisando a cópia local. Ela só substitui a versão do servidor se você salvar e confirmar."
        : "Você está revisando a versão do servidor. A outra cópia continua guardada neste navegador.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function keepServerVersion(conflict: SaveConflict) {
    if (busy || pendingMedia || !(await confirmAction(
      "Manter versão do servidor?", "A cópia em conflito guardada neste navegador será descartada.", "Manter versão do servidor", true,
    ))) return;
    setBusy(true);
    try {
      const { item } = await request<{ item: Entry }>("/" + conflict.entry.kind + "/" + conflict.entry.id);
      discardConflict(conflict);
      editRecord(item);
      setNotice("Versão do servidor mantida.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    if (busy) {
      setError("Aguarde a operação em andamento antes de sair.");
      return false;
    }
    if (pendingMedia) {
      setError("Aguarde o envio das fotos e assinaturas antes de sair.");
      return false;
    }
    if (entry && (resolution || entryConflict)) {
      if (dirty && !(await confirmAction(
        "Sair da revisão?", "As alterações desta revisão não serão salvas. A cópia em conflito continua guardada.", "Sair da revisão", true,
      ))) return false;
    } else if (entry && (dirty || entry.version === 0)) {
      try {
        const next = { ...entry, updatedAt: new Date().toISOString() };
        const delivery = stageVersion(next);
        setEntries((items) => [next, ...items.filter((item) => item.id !== next.id)]);
        void delivery.catch(() => undefined);
      } catch (error) {
        setError((error as Error).message);
        return false;
      }
    }
    setEntry(null);
    setResolution(null);
    setDirty(false);
    setFinalizeAttempted(false);
    setError("");
    void reload().catch(() => undefined);
    return true;
  }
  async function navigate(target: Kind | "users" | "profile") {
    if (
      target === "users" || target === "profile"
        ? accountPage === target
        : !accountPage && kind === target
    )
      return;
    if (entry && !(await leave())) return;
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
  function validateCurrent(entry: Entry) {
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
      return false;
    }
    try {
      if (entry.kind === "reports") {
        validateReportTeam(entry);
        validateReport(entry.payload, true);
      }
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    }
  }
  async function act(action: "save" | "finish" | "pdf") {
    if (!entry || busy || pendingMedia) return;
    if (resolution || entryConflict) {
      if (action !== "save" || !resolution) return;
      const detail = resolution.source === "local"
        ? "O conteúdo revisado da cópia local substituirá a versão do servidor que você abriu."
        : "As alterações da revisão serão salvas e substituirão a cópia em conflito deste navegador.";
      if (!(await confirmAction("Salvar a versão revisada?", detail, "Salvar versão revisada", true))) return;
    }
    if (action !== "save" && !validateCurrent(entry)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = { ...entry, updatedAt: new Date().toISOString() };
      if (action === "finish") next.status = "finalized";
      if (action === "finish" && next.kind === "inspections")
        next.payload = {
          ...next.payload,
          documentFields: {
            ...next.payload.documentFields,
            "000": next.number,
          },
          finalizedAt: next.payload.finalizedAt || next.updatedAt,
        };
      const { item: saved, reason, conflict } = await saveVersion(next, action === "finish" ? "finalize" : undefined, resolution?.conflict.token);
      setResolution(null);
      setConflicts(savedConflicts());
      if (conflict) {
        setDirty(false);
        setNotice(reason || "A cópia continua salva neste navegador.");
        return;
      }
      const visible = !saved || recordVisibleToUser(saved, user, catalog.technicians);
      const current = saved || next;
      setEntry(visible ? current : null);
      setDirty(false);
      setFinalizeAttempted(false);
      setEntries((items) => visible ? [current, ...items.filter((item) => item.id !== current.id)] : items.filter((item) => item.id !== current.id));
      if (!visible) {
        setNotice("Salvo para a equipe selecionada.");
      } else if (action === "pdf" && !saved) {
        setNotice(reason || "Salvo neste navegador. Quando estiver conectado, toque em Gerar PDF novamente.");
      } else if (saved && action === "pdf") {
        setPdfFile(await preparePdf(saved));
      } else {
        setNotice(saved ? action === "finish" ? "Registro finalizado." : "Versão salva."
          : reason || (action === "finish" ? "Finalizado neste navegador. O envio é automático." : "Salvo neste navegador. O envio é automático."));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pdf(e: Entry) {
    const pending = pendingVersions().find((local) => local.kind === e.kind && local.id === e.id);
    const current = pending || e;
    if (finalizationIssues(current).length) {
      setDetail(null);
      editRecord(current);
      validateCurrent(current);
      return;
    }
    setBusy(true);
    try {
      if (pending) {
        const { item, reason } = await saveVersion(pending);
        if (!item) {
          setNotice(reason || "Salvo neste navegador. Quando estiver conectado, toque em Gerar PDF novamente.");
          return;
        }
        setPdfFile(await preparePdf(item));
      } else {
        setPdfFile(await preparePdf(e));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function conflictActions(conflict: SaveConflict) {
    return (
      <div className="br-actions br-conflict-actions">
        <button type="button" disabled={busy || pendingMedia > 0} onClick={() => void reviewConflict(conflict, "server")}>Abrir versão do servidor</button>
        <button type="button" disabled={busy || pendingMedia > 0} onClick={() => void reviewConflict(conflict, "local")}>Revisar cópia local</button>
      </div>
    );
  }
  if (boot)
    return (
      <main className="br-boot">
        <Brand large />
        <p role="status">Carregando sua operação…</p>
      </main>
    );
  if (!user)
    return (
      <main className="br-login">
        <section
          className="br-login-intro"
          aria-label="BR LIFT — Serviços técnicos"
        >
          <Brand large />
          <div>
            <span className="br-brand-eyebrow">SERVIÇOS TÉCNICOS</span>
            <h2>
              Precisão em campo.
              <br />
              Controle na gestão.
            </h2>
            <p>
              Guindastes &amp; movimentação.
              <br />A sua operação, conectada de ponta a ponta.
            </p>
          </div>
          <div className="br-brand-disciplines">
            <span>Atendimento técnico</span>
            <span>Inspeções</span>
            <span>Gestão</span>
          </div>
        </section>
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
          <span className="br-brand-eyebrow">PLATAFORMA BR LIFT</span>
          <h1>Acesse sua operação</h1>
          <p>Entre com os dados da sua conta.</p>
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
          <p className="br-login-note">Acesso exclusivo à equipe autorizada.</p>
        </form>
        <footer className="br-login-footer">
          BR LIFT <span>Serviços técnicos · Guindastes &amp; movimentação</span>
        </footer>
      </main>
    );
  return (
    <UserContext.Provider value={user}>
      <ConfirmationDialog />
      {pdfFile && <PdfActionsDialog file={pdfFile} onClose={() => setPdfFile(null)} />}
      <div className="br-app">
        <header className="br-header">
          <Brand />
          <nav aria-label="Navegação principal">
            <button
              aria-pressed={!accountPage && kind === "reports"}
              onClick={() => navigate("reports")}
            >
              Relatório Técnico
            </button>
            <button
              aria-pressed={!accountPage && kind === "inspections"}
              onClick={() => navigate("inspections")}
            >
              Inspeções
            </button>
            {canAdminister(user.role) && (
              <button
                aria-pressed={accountPage === "users"}
                onClick={() => navigate("users")}
              >
                Cadastros
              </button>
            )}
            {!canAdminister(user.role) && (
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
                if (dirty && !(await confirmAction("Sair da conta?", "Há alterações que ainda não foram salvas.", "Sair sem salvar", true))) return;
                try {
                  await request("/auth/logout", {});
                  clearSessionData();
                  setUser(null);
                } catch {
                  setError("Não foi possível sair da conta. Tente novamente quando estiver conectado.");
                }
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
                if (updated.id !== user.id) {
                  void reloadCatalog().catch((cause) =>
                    setError((cause as Error).message),
                  );
                  return;
                }
                if (updated.role !== user.role) clearSessionData();
                setUser((current: any) =>
                  current?.id === updated.id
                    ? { ...current, ...updated }
                    : current,
                );
                if (!canAdminister(updated.role)) setAccountPage(null);
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
                    {resolution
                      ? "Versão em revisão"
                      : dirty
                      ? "Alterações não salvas"
                      : entry.version
                        ? "Versão " + entry.version + " salva"
                        : "Novo registro"}
                  </p>
                </div>
              </div>
              {entryConflict && (
                <section className="br-section">
                  <p>Há duas versões. Escolha qual você quer revisar.</p>
                  {conflictActions(entryConflict)}
                  {resolution?.source === "server" && (
                    <div className="br-actions">
                      <button type="button" disabled={busy || pendingMedia > 0} onClick={() => void keepServerVersion(entryConflict)}>Manter versão do servidor</button>
                    </div>
                  )}
                </section>
              )}
              <FormErrors issues={formIssues}>
                <fieldset
                  className="br-form-content"
                  disabled={busy || pendingMedia > 0}
                >
                  {(entry.kind === "reports" ||
                    entry.kind === "inspections") && (
                    <div className="br-grid" style={{ marginBottom: 20 }}>
                      <Field
                        label="O.S. OMIE"
                        inputMode="numeric"
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
                  {pendingMedia > 0 && <p role="status">Aguarde o envio das fotos e assinaturas…</p>}
                  <button type="button" disabled={busy || pendingMedia > 0 || (!!entryConflict && !resolution)} onClick={() => void act("save")}>
                    Salvar versão
                  </button>
                  <button type="button" className="primary" disabled={busy || pendingMedia > 0 || !!entryConflict || !!resolution} onClick={() => void act("finish")}>
                    Finalizar {entry.kind === "reports" ? "atendimento" : "inspeção"}
                  </button>
                  <button type="button" disabled={busy || pendingMedia > 0 || !!entryConflict || !!resolution} onClick={() => void act("pdf")}>
                    Gerar PDF
                  </button>
                </footer>
              </FormErrors>
            </>
          ) : (
            <>
              <div className="br-title">
                <div>
                  <p className="muted">
                    {canAdminister(user.role)
                      ? "PAINEL DE GESTÃO"
                      : "MEUS REGISTROS"}
                  </p>
                  <h1>
                    {kind === "reports"
                      ? canAdminister(user.role)
                        ? "Atendimentos técnicos"
                        : "Meus atendimentos"
                      : canAdminister(user.role)
                        ? "Inspeções"
                        : "Minhas inspeções"}
                  </h1>
                </div>
                <button className="primary" onClick={create} disabled={busy}>
                  + {kind === "reports" ? "Novo atendimento" : "Nova inspeção"}
                </button>
              </div>
              {conflicts.filter(({ entry: copy }) => copy.kind === kind).map((conflict) => (
                <section key={conflict.token} className="br-section">
                  <p><strong>O.S. {conflict.entry.number || "sem número"}:</strong> a cópia local é diferente da versão do servidor.</p>
                  {conflictActions(conflict)}
                </section>
              ))}
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
              <RecordFilters key={kind} value={filters} onChange={setFilters}
                clients={catalog.clients} technicians={catalog.technicians}
                showTechnician={canAdminister(user.role)} />
              <div className="br-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>O.S. OMIE</th>
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
                            {e.payload.formRevision !== 2 && (
                              <small>
                                {e.date.split("-").reverse().join("/")}
                              </small>
                            )}
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
                              <button onClick={() => setDetail(e)}>
                                Resumo
                              </button>
                              <button onClick={() => {
                                const conflict = conflicts.find(({ entry: copy }) => copy.kind === e.kind && copy.id === e.id);
                                if (conflict) void reviewConflict(conflict, "server");
                                else editRecord(e);
                              }}>
                                Editar
                              </button>
                              <button disabled={busy} onClick={() => pdf(e)}>
                                Gerar PDF
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
                  {detail.payload.formRevision !== 2 &&
                    detail.date.split("-").reverse().join("/") + " · "}
                  {detail.status === "finalized"
                    ? "Finalizado"
                    : "Em preenchimento"}
                </p>
                <EntrySummary
                  entry={detail}
                  technicians={catalog.technicians}
                />
                <div className="br-actions">
                  <button
                    onClick={() => {
                      editRecord(detail);
                      setDetail(null);
                    }}
                  >
                    Editar
                  </button>
                  <button disabled={busy} onClick={() => pdf(detail)}>
                    Gerar PDF
                  </button>
                  <button onClick={() => setDetail(null)}>Fechar</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </UserContext.Provider>
  );
}
