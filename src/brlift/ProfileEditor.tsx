import { useEffect, useState, type FormEvent } from "react";
import { request } from "./api";

type Profile = {
  id: string;
  name: string;
  email: string;
  cpf: string;
  role: "admin" | "technician";
};

export function ProfileEditor({
  onUpdated,
}: {
  onUpdated: (user: Profile) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    request<{ user: Profile }>("/profile")
      .then(({ user }) => {
        if (!mounted) return;
        setProfile(user);
        setName(user.name);
        setCpf(user.cpf);
        setEmail(user.email);
      })
      .catch((cause) => {
        if (mounted) setError((cause as Error).message);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<{ user: Omit<Profile, "cpf"> }>(
        "/profile",
        {
          name,
          cpf,
          email,
          currentPassword,
          ...(newPassword ? { password: newPassword } : {}),
        },
        "PUT",
      );
      const updated = { ...result.user, cpf: cpf.replace(/\D/g, "") };
      setProfile(updated);
      setName(updated.name);
      setCpf(updated.cpf);
      setEmail(updated.email);
      setCurrentPassword("");
      setNewPassword("");
      setNotice("Perfil atualizado com sucesso.");
      onUpdated(updated);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="br-user-page">
      <div className="br-user-toolbar">
        <div>
          <p className="muted">MINHA CONTA</p>
          <h1>Editar perfil</h1>
          <p>Atualize seus dados de acesso e seu cadastro técnico.</p>
        </div>
      </div>
      {error && (
        <p className="br-user-message br-user-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="br-user-message br-user-success" role="status">
          {notice}
        </p>
      )}
      {!profile ? (
        !error && <p className="muted">Carregando seu perfil…</p>
      ) : (
        <form className="br-section br-profile-card" onSubmit={submit}>
          <fieldset disabled={busy}>
            <div className="br-grid">
              <label>
                Nome completo
                <input
                  autoComplete="name"
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
              <div className="br-profile-role">
                <span>Perfil de acesso</span>
                <strong>
                  {profile.role === "admin" ? "Administrador" : "Técnico"}
                </strong>
                <small>
                  Somente um administrador pode alterar este perfil.
                </small>
              </div>
              <label>
                Senha atual
                <input
                  autoComplete="current-password"
                  maxLength={1024}
                  required
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                <small>Confirme sua senha para salvar as alterações.</small>
              </label>
              <label>
                Nova senha (opcional)
                <input
                  autoComplete="new-password"
                  minLength={newPassword ? 10 : undefined}
                  maxLength={1024}
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <small>Deixe em branco para manter a senha atual.</small>
              </label>
            </div>
            <div className="br-user-form-actions">
              <button className="primary" type="submit">
                {busy ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
