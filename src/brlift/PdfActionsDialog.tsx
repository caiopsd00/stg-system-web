import { useEffect, useId, useRef, useState } from "react";

function PdfActionIcon({ share = false }: { share?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {share ? <>
      <circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="5" r="2.5" /><circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.7 7.6-4.4m-7.6 7 7.6 4.4" />
    </> : <path d="M12 3v12m-4-4 4 4 4-4m-12 5v4h16v-4" />}
  </svg>;
}

export function PdfActionsDialog({ file, onClose }: { file: File; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const description = useId();
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const shareData = { files: [file], title: file.name };
  const canShare = typeof navigator.share === "function" && navigator.canShare?.(shareData);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, []);

  function download() {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onClose();
  }

  async function share() {
    if (!canShare || sharing) return;
    setError("");
    setSharing(true);
    try {
      await navigator.share(shareData);
      onClose();
    } catch (cause) {
      if (!(cause instanceof Error) || cause.name !== "AbortError")
        setError("Não foi possível compartilhar. Você ainda pode baixar o PDF.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <dialog ref={dialog} className="br-dialog br-confirmation br-pdf-dialog" aria-labelledby={title} aria-describedby={description}
      onCancel={(event) => { event.preventDefault(); if (!sharing) onClose(); }}
      onClick={(event) => {
        if (sharing || event.target !== event.currentTarget) return;
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) onClose();
      }}>
      <h2 id={title}>PDF pronto</h2>
      <p id={description}>Escolha o que fazer com o arquivo.</p>
      <div className="br-actions br-pdf-actions">
        <button type="button" autoFocus className="primary" disabled={sharing} onClick={download}>
          <PdfActionIcon /> Baixar PDF
        </button>
        <button type="button" disabled={!canShare || sharing} onClick={() => void share()}>
          <PdfActionIcon share /> {sharing ? "Compartilhando…" : "Compartilhar PDF"}
        </button>
        {!canShare && <small className="muted">Neste navegador, baixe o arquivo para compartilhar.</small>}
        {error && <small role="alert">{error}</small>}
        <button type="button" className="br-pdf-cancel" disabled={sharing} onClick={onClose}>Cancelar</button>
      </div>
    </dialog>
  );
}
