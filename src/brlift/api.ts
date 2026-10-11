import type { CatalogKind, Entry, Media } from "../contracts/domain";
import { createId } from "./id";
export const API = import.meta.env.VITE_API_URL || "/api";
let databaseId = "";
export function databaseHeaders() {
  return { "X-BRLIFT-Database": databaseId, "X-BRLIFT-Contract": "4" };
}
export async function request<T = any>(
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
    throw new Error(value.error || "Não foi possível conectar à API.");
  if (url === "/auth/login" || url === "/auth/me") {
    if (value.contractVersion !== 4 || !value.databaseId)
      throw Error("Atualize o backend BR LIFT antes de continuar.");
    databaseId = value.databaseId;
  }
  return value;
}
export function catalogs(kind: CatalogKind) {
  return request("/catalog/" + kind);
}
export async function saveEntry(entry: Entry, mutationId = createId()) {
  return (
    await request(
      "/" + entry.kind + "/" + entry.id,
      { ...entry, baseVersion: entry.version, mutationId },
      "PUT",
    )
  ).item as Entry;
}
export function mediaUrl(uri: string) {
  return uri.startsWith("/api/") ? API.replace(/\/api$/, "") + uri : uri;
}
export async function upload(file: File): Promise<Media> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return uploadData(dataUrl, file.name);
}
export async function uploadData(
  dataUrl: string,
  name: string,
): Promise<Media> {
  return (await request("/media", { dataUrl, name })).media;
}
export async function download(entry: Entry, format = "pdf") {
  const res = await fetch(
    API + "/" + entry.kind + "/" + entry.id + "/document/" + format,
    { credentials: "include", headers: databaseHeaders() },
  );
  if (!res.ok) throw Error((await res.json()).error);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download =
    "BR-LIFT-" + entry.number.replace(/[^a-z0-9_-]/gi, "-") + "." + format;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
