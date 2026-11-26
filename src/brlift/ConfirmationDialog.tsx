import { useEffect, useId, useRef, useSyncExternalStore } from "react";

type Confirmation = { title: string; message: string; action: string; destructive: boolean; resolve: (choice: boolean) => void };
let active: Confirmation | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function confirmAction(title: string, message: string, action: string, destructive = false): Promise<boolean> {
  if (active) return Promise.resolve(false);
  return new Promise((resolve) => {
    active = { title, message, action, destructive, resolve };
    notify();
  });
}

export function ConfirmationDialog() {
  const value = useSyncExternalStore(subscribe, () => active);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!value || !element) return;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, [value]);

  function complete(result: boolean) {
    if (!value || active !== value) return;
    dialog.current?.close();
    active = null;
    notify();
    value.resolve(result);
  }

  if (!value) return null;
  return <dialog ref={dialog} className="br-dialog br-confirmation" aria-labelledby={titleId} aria-describedby={messageId}
    onCancel={(event) => { event.preventDefault(); complete(false); }}
    onClick={(event) => { if (event.currentTarget === event.target) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) complete(false);
    } }}>
    <h2 id={titleId}>{value.title}</h2>
    <p id={messageId}>{value.message}</p>
    <div className="br-actions">
      <button type="button" autoFocus onClick={() => complete(false)}>Cancelar</button>
      <button type="button" className={value.destructive ? "br-confirm-danger" : "primary"} onClick={() => complete(true)}>{value.action}</button>
    </div>
  </dialog>;
}
