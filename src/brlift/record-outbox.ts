import type { Entry } from "../contracts/domain.ts";

export type SaveIntent = "save" | "draft" | "finalize";
type Version = { entry: Entry; mutationId: string; saveIntent?: SaveIntent };
type Job = { desired: Version; inFlight?: Version; blocked?: string };
export type SaveConflict = { entry: Entry; token: string };
export type Delivery = { item?: Entry; reason?: string; conflict?: SaveConflict };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
const conflictReason = "Existe uma versão mais recente. A sua continua salva neste navegador.";
const asConflict = (job: Job | null): SaveConflict | undefined =>
  job?.blocked === conflictReason ? { entry: job.desired.entry, token: job.desired.mutationId } : undefined;

export function createRecordOutbox(options: {
  storage: () => Store;
  scope: () => string | null;
  id: () => string;
  submit: (entry: Entry, mutationId: string, saveIntent?: SaveIntent) => Promise<Entry>;
  onSent?: (item: Entry) => void;
  onConflict?: () => void;
  lock?: <T>(key: string, run: () => Promise<T>) => Promise<T>;
}) {
  const inProgress = new Map<string, Promise<Delivery>>();
  const prefix = (scope: string) => `brlift:saves:${scope}:`;
  const read = (key: string): Job | null => {
    const raw = options.storage().getItem(key);
    return raw ? JSON.parse(raw) : null;
  };
  const write = (key: string, job: Job) => options.storage().setItem(key, JSON.stringify(job));
  const keys = (scope: string) => {
    const store = options.storage();
    return Array.from({ length: store.length }, (_, index) => store.key(index))
      .filter((key): key is string => !!key?.startsWith(prefix(scope)));
  };

  // Run sends for one record in order; re-use the original mutation ID when
  // a response is lost. Rebase only on a confirmed write from this queue.
  async function deliver(scope: string, key: string): Promise<Delivery> {
    let confirmed: Entry | undefined;
    while (options.scope() === scope) {
      const job = read(key);
      if (!job) return { item: confirmed };
      if (job.blocked) {
        const conflict = asConflict(job);
        return conflict ? { reason: job.blocked, conflict } : { reason: job.blocked };
      }
      const attempt = job.inFlight || job.desired;
      write(key, { ...job, inFlight: attempt });
      let saved: Entry;
      try {
        saved = await options.submit(attempt.entry, attempt.mutationId, attempt.saveIntent);
      } catch (cause) {
        const error = cause as Error & { status?: number };
        if (options.scope() !== scope || ![400, 403, 409, 422].includes(error.status || 0)) return {};
        const current = read(key);
        if (!current || current.inFlight?.mutationId !== attempt.mutationId) return {};
        const newerVersion = error.status === 409 && error.message.startsWith("Conflito: existe uma edição mais recente");
        const reason = newerVersion ? conflictReason : error.message;
        const corrected = [400, 422].includes(error.status || 0) && current.desired.mutationId !== attempt.mutationId;
        const blocked = { desired: current.desired, blocked: corrected ? undefined : reason };
        write(key, blocked);
        if (corrected) continue;
        const conflict = asConflict(blocked);
        if (conflict) options.onConflict?.();
        return conflict ? { reason, conflict } : { reason };
      }
      if (options.scope() !== scope) return {};
      const latest = read(key);
      if (!latest || latest.inFlight?.mutationId !== attempt.mutationId) return {};
      if (latest.desired.mutationId === attempt.mutationId) {
        options.storage().removeItem(key);
      } else {
        const desired = latest.desired;
        write(key, { desired: { ...desired, entry: { ...desired.entry, version: saved.version } } });
      }
      confirmed = saved;
      options.onSent?.(saved);
      if (latest.desired.mutationId === attempt.mutationId) return { item: saved };
    }
    return {};
  }

  function send(scope: string, key: string) {
    const existing = inProgress.get(key);
    if (existing) return existing;
    const task = Promise.resolve().then(() =>
      options.lock ? options.lock(key, () => deliver(scope, key)) : deliver(scope, key)
    ).finally(() => inProgress.delete(key));
    inProgress.set(key, task);
    return task;
  }

  function stage(entry: Entry, saveIntent: SaveIntent = entry.status === "draft" ? "draft" : "save", reviewedToken?: string) {
    const scope = options.scope();
    if (!scope) throw Error("Entre novamente para salvar a versão.");
    const key = prefix(scope) + entry.kind + ":" + entry.id;
    const current = read(key);
    if (asConflict(current)?.token !== reviewedToken)
      throw Error("A cópia em conflito mudou ou ainda não foi revisada. Abra as opções de revisão.");
    write(key, {
      desired: { entry, mutationId: options.id(), saveIntent },
      inFlight: current?.inFlight,
    });
    return send(scope, key);
  }
  return {
    stage,
    async save(entry: Entry, saveIntent?: SaveIntent, reviewedToken?: string): Promise<Delivery> {
      return stage(entry, saveIntent, reviewedToken);
    },
    async flush() {
      const scope = options.scope();
      if (!scope) return;
      for (const key of keys(scope)) {
        if (options.scope() !== scope) return;
        await send(scope, key);
      }
    },
    pending(): Entry[] {
      const scope = options.scope();
      return scope ? keys(scope).flatMap((key) => {
        const job = read(key);
        return job && !asConflict(job) ? [job.desired.entry] : [];
      }) : [];
    },
    conflicts(): SaveConflict[] {
      const scope = options.scope();
      return scope ? keys(scope).flatMap((key) => {
        const conflict = asConflict(read(key));
        return conflict ? [conflict] : [];
      }) : [];
    },
    discardConflict(conflict: SaveConflict) {
      const scope = options.scope();
      if (!scope) throw Error("Entre novamente para revisar a cópia.");
      const key = prefix(scope) + conflict.entry.kind + ":" + conflict.entry.id;
      if (asConflict(read(key))?.token !== conflict.token)
        throw Error("A cópia mudou. Abra as opções de revisão novamente.");
      options.storage().removeItem(key);
      options.onConflict?.();
    },
  };
}
