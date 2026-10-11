import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { request } from "./api";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "technician";
  active: boolean;
  technician: { id: string; cpf: string; active: boolean } | null;
};

export function UserRegistration({
  currentUserId,
  onUserUpdated,
  onCreated,
}: {
  currentUserId: string;
  onUserUpdated: (user: {
    id: string;
    name: string;
    email: string;
    role: string;
  }) => void;
  onCreated: () => Promise<void>;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"technician" | "admin">("technician");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshUsers() {
    setUsers((await request<{ users: ManagedUser[] }>("/users")).users);
  }
  useEffect(() => {
    refreshUsers().catch((cause) => setPageError((cause as Error).message));
  }, []);

  function clearForm() {
    setEditing(null);
    setName("");
    setCpf("");
    setEmail("");
    setPassword("");
    setRole("technician");
    setError("");
  }
  function closeModal() {
    if (busy) return;
    setModalOpen(false);
    clearForm();
  }
  function openCreate() {
    clearForm();
    setModalOpen(true);
  }
  function openEdit(user: ManagedUser) {
    setEditing(user);
    setName(user.name);
    setCpf(user.technician?.cpf ?? "");
    setEmail(user.email);
    setPassword("");
    setRole(user.role);
    setError("");
    setModalOpen(true);
  }
  function onModalKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") closeModal();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setPageError("");
    setNotice("");
    try {
      const data = {
        name,
        cpf,
        email,
        ...(password ? { password } : {}),
        role,
      };
      if (editing) {
        const result = await request<{
          user: { id: string; name: string; email: string; role: string };
        }>(`/users/${editing.id}`, data, "PUT");
        onUserUpdated(result.user);
        setNotice("Usuário e cadastro técnico atualizados.");
      } else {
        await request("/users", { ...data, password });
        setNotice("Usuário criado e cadastrado como técnico.");
        await onCreated();
      }
      await refreshUsers();
      setModalOpen(false);
      clearForm();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeActive(user: ManagedUser) {
    const active = !user.active;
    if (
      !active &&
      !confirm(
        `Desativar ${user.name}? O cadastro e o histórico serão preservados, mas o acesso será bloqueado.`,
      )
    )
      return;
    setBusy(true);
    setPageError("");
    setNotice("");
    try {
      await request(`/users/${user.id}/active`, { active }, "PUT");
      await refreshUsers();
      setNotice(
        active
          ? "Usuário reativado."
          : "Usuário desativado. O histórico foi preservado.",
      );
      await onCreated();
    } catch (cause) {
      setPageError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="br-user-page">
      <div className="br-user-toolbar">
        <div>
          <p className="muted">ADMINISTRAÇÃO</p>
          <h1>Cadastros</h1>
          <p>Usuários do sistema e seus cadastros técnicos vinculados.</p>
        </div>
        <button className="primary" type="button" onClick={openCreate}>
          + Adicionar usuário
        </button>
      </div>

      {pageError && (
        <p className="br-user-message br-user-error" role="alert">
          {pageError}
        </p>
      )}
      {notice && (
        <p className="br-user-message br-user-success" role="status">
          {notice}
        </p>
      )}

      <section className="br-section br-user-list-section">
        <div className="br-user-list-heading">
          <div>
            <h2>Usuários cadastrados</h2>
            <p>
              Gerencie o acesso, os dados e o cadastro técnico de cada pessoa.
            </p>
          </div>
          <span>
            {users.length} {users.length === 1 ? "usuário" : "usuários"}
          </span>
        </div>
        {users.length === 0 ? (
          <p className="muted">Nenhum usuário cadastrado.</p>
        ) : (
          <div className="br-user-list">
            {users.map((item) => (
              <article
                className={`br-user-card${item.active ? "" : " is-inactive"}`}
                key={item.id}
              >
                <div className="br-user-card-main">
                  <span className="br-user-avatar" aria-hidden="true">
                    {item.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="br-user-card-identity">
                    <strong>
                      {item.name}
                      {item.id === currentUserId && (
                        <small className="br-user-you">Você</small>
                      )}
                    </strong>
                    <span>{item.email}</span>
                  </div>
                </div>
                <div className="br-user-card-meta">
                  <span
                    className={`br-user-status ${item.active ? "is-active" : "is-inactive"}`}
                  >
                    {item.active ? "Ativo" : "Desativado"}
                  </span>
                  <span>
                    {item.role === "admin" ? "Administrador" : "Técnico"}
                  </span>
                  <span>
                    {item.technician
                      ? `Cadastro técnico · CPF ${item.technician.cpf}`
                      : "Sem cadastro técnico"}
                  </span>
                </div>
                <div className="br-user-card-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openEdit(item)}
                  >
                    Editar
                  </button>
                  {item.active ? (
                    <button
                      type="button"
                      className="br-user-deactivate"
                      disabled={busy || item.id === currentUserId}
                      title={
                        item.id === currentUserId
                          ? "Não é possível desativar sua própria conta"
                          : undefined
                      }
                      onClick={() => changeActive(item)}
                    >
                      Desativar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => changeActive(item)}
                    >
                      Reativar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {modalOpen && (
        <div
          className="br-modal-scrim"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            className="br-user-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="br-user-modal-title"
            onKeyDown={onModalKeyDown}
          >
            <div className="br-user-modal-heading">
              <div>
                <p className="muted">CADASTROS</p>
                <h2 id="br-user-modal-title">
                  {editing ? "Editar usuário" : "Adicionar usuário"}
                </h2>
                <p>
                  {editing
                    ? "Nome e CPF também atualizam o cadastro técnico. Deixe a senha vazia para mantê-la."
                    : "A conta também será cadastrada como técnico usando o CPF informado."}
                </p>
              </div>
              <button
                type="button"
                className="br-modal-close"
                aria-label="Fechar modal"
                disabled={busy}
                onClick={closeModal}
              >
                ×
              </button>
            </div>
            <form className="br-user-modal-form" onSubmit={submit}>
              <div className="br-grid">
                <label>
                  Nome completo
                  <input
                    autoComplete="name"
                    autoFocus
                    maxLength={300}
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  CPF
                  <input
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={14}
                    placeholder="000.000.000-00"
                    required
                    value={cpf}
                    onChange={(event) => setCpf(event.target.value)}
                  />
                </label>
                <label>
                  E-mail de acesso
                  <input
                    autoComplete="email"
                    maxLength={254}
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <label>
                  {editing ? "Nova senha (opcional)" : "Senha inicial"}
                  <input
                    autoComplete="new-password"
                    minLength={password ? 10 : undefined}
                    maxLength={1024}
                    required={!editing}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <small>
                    {editing
                      ? "Deixe em branco para não alterar."
                      : "Mínimo de 10 caracteres."}
                  </small>
                </label>
                <label>
                  Perfil de acesso
                  <select
                    value={role}
                    onChange={(event) =>
                      setRole(event.target.value as "technician" | "admin")
                    }
                  >
                    <option value="technician">Técnico</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
              </div>
              {error && (
                <p className="br-user-message br-user-error" role="alert">
                  {error}
                </p>
              )}
              <div className="br-user-form-actions">
                <button type="button" disabled={busy} onClick={closeModal}>
                  Cancelar
                </button>
                <button className="primary" type="submit" disabled={busy}>
                  {busy
                    ? "Salvando…"
                    : editing
                      ? "Salvar alterações"
                      : "Criar usuário e técnico"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
