import type { CatalogKind, Entry, Media } from "../contracts/domain";
import { documentFilename, type SignatureTarget } from "../contracts/domain";
import { createId } from "./id";
import { createRecordOutbox, type SaveIntent } from "./record-outbox";
export const API = import.meta.env.VITE_API_URL || "/api";
let databaseId = "";
let actorId = "";
let authGeneration = 0;
const savedListeners = new Set<(item: Entry) => void>();
const conflictListeners = new Set<() => void>();
export function databaseHeaders() {
  return { "X-BRLIFT-Database": databaseId, "X-BRLIFT-Contract": "4" };
}
async function rawRequest<T = any>(
  url: string,
  body?: any,
  method = body ? "POST" : "GET",
): Promise<T> {
  const response = await fetch(API + url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...databaseHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(value.error || "Não foi possível conectar à API."), { status: response.status });
  return value;
}

export async function request<T = any>(url: string, body?: any, method?: string): Promise<T> {
  const auth = url.startsWith("/auth/");
  const generation = auth ? ++authGeneration : authGeneration;
  const priorActor = actorId;
  if (url === "/auth/logout" || url === "/auth/login") actorId = "";
  const value = await rawRequest(url, body, method).catch((error) => {
    if (url === "/auth/logout" && generation === authGeneration) actorId = priorActor;
    throw error;
  });
  if (url === "/auth/login" || url === "/auth/me") {
    if (value.contractVersion !== 4 || !value.databaseId)
      throw Error("Atualize o backend BR LIFT antes de continuar.");
    if (generation === authGeneration) {
      databaseId = value.databaseId;
      actorId = value.user?.id || "";
    }
  }
  if (actorId && url !== "/auth/logout") kickSavedVersions();
  return value;
}
export function catalogs(kind: CatalogKind) {
  return request("/catalog/" + kind);
}
async function saveEntry(entry: Entry, mutationId: string, saveIntent?: SaveIntent) {
  return (
    await rawRequest(
      "/" + entry.kind + "/" + entry.id,
      {
        ...entry,
        date: entry.payload.formRevision === 2 ? undefined : entry.date,
        baseVersion: entry.version,
        mutationId,
        saveIntent,
      },
      "PUT",
    )
  ).item as Entry;
}

const outbox = createRecordOutbox({
  storage: () => localStorage,
  scope: () => databaseId && actorId ? `${databaseId}:${actorId}` : null,
  id: createId,
  submit: saveEntry,
  onSent: (item) => savedListeners.forEach((listener) => listener(item)),
  onConflict: () => conflictListeners.forEach((listener) => listener()),
  lock: (key, run) => typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(key, run) : run(),
});

let syncing = false;
export function kickSavedVersions() {
  if (syncing) return;
  syncing = true;
  void outbox.flush().catch(() => undefined).finally(() => { syncing = false; });
}
export const saveVersion = outbox.save;
export const stageVersion = outbox.stage;
export const discardConflict = outbox.discardConflict;
export function savedConflicts() {
  try { return outbox.conflicts(); }
  catch { return []; }
}
export function onSaveConflict(listener: () => void) {
  conflictListeners.add(listener);
  return () => { conflictListeners.delete(listener); };
}
export function pendingVersions() {
  try { return outbox.pending(); }
  catch { return []; }
}
export function onVersionSaved(listener: (item: Entry) => void) {
  savedListeners.add(listener);
  return () => { savedListeners.delete(listener); };
}
export function mediaUrl(uri: string) {
  return uri.startsWith("/api/") ? API.replace(/\/api$/, "") + uri : uri;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const UPLOAD_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function prepareUploadFile(file: File): Promise<File> {
  if (file.size <= MAX_IMAGE_BYTES && UPLOAD_IMAGE_TYPES.has(file.type))
    return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Este formato de imagem não pôde ser aberto no navegador.");
  }
  try {
    for (const [maxSide, quality] of [
      [3200, 0.82],
      [2200, 0.7],
    ]) {
      const scale = Math.min(
        1,
        maxSide / Math.max(bitmap.width, bitmap.height),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar a foto.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error("Não foi possível preparar a foto.")),
          "image/jpeg",
          quality,
        ),
      );
      if (blob.size <= MAX_IMAGE_BYTES)
        return new File(
          [blob],
          (file.name || "foto").replace(/\.[^.]+$/, "") + ".jpg",
          {
            type: "image/jpeg",
          },
        );
    }
    throw new Error("A foto ainda excede 10 MB após a otimização.");
  } finally {
    bitmap.close();
  }
}

export async function upload(file: File): Promise<Media> {
  const prepared = await prepareUploadFile(file);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(prepared);
  });
  return uploadData(dataUrl, prepared.name);
}
export async function uploadData(
  dataUrl: string,
  name: string,
  signature?: SignatureTarget,
): Promise<Media> {
  return (await request("/media", { dataUrl, name, signature })).media;
}
export async function preparePdf(entry: Entry): Promise<File> {
  const res = await fetch(
    API + "/" + entry.kind + "/" + entry.id + "/document/pdf",
    { credentials: "include", headers: databaseHeaders() },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw Error(error.error || "Não foi possível gerar o PDF.");
  }
  kickSavedVersions();
  const name = documentFilename(
    entry.clientName || entry.payload.clientSnapshot?.name, entry.number, "pdf",
  );
  return new File([await res.blob()], name, { type: "application/pdf" });
}
