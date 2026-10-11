import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Media } from "../contracts/domain";
import { mediaUrl, uploadData } from "./api";
import { beginMediaActivity } from "./media-activity";
import "./Signature.css";

type Point = { x: number; y: number };
export function Signature({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value?: Media;
  onChange: (value: Media | undefined) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="br-signature">
      <h3>{label}</h3>
      <button
        type="button"
        className="br-signature-preview"
        aria-label={`Abrir ${label.toLowerCase()}`}
        onClick={() => setOpen(true)}
      >
        {value ? (
          <img alt={label + " salva"} src={mediaUrl(value.uri)} />
        ) : (
          <span>Toque para assinar</span>
        )}
      </button>
      <div className="br-actions">
        <button type="button" onClick={() => setOpen(true)}>
          Assinar
        </button>
        <button
          type="button"
          disabled={!value}
          onClick={() => onChange(undefined)}
        >
          Limpar
        </button>
      </div>
      {error && (
        <small className="br-inline-error" role="alert">
          {error}
        </small>
      )}
      {open && (
        <SignatureDialog
          label={label}
          value={value}
          onCancel={() => setOpen(false)}
          onSave={(media) => {
            onChange(media);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
function SignatureDialog({
  label,
  value,
  onCancel,
  onSave,
}: {
  label: string;
  value?: Media;
  onCancel: () => void;
  onSave: (media: Media | undefined) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const strokes = useRef<Point[][]>([]),
    base = useRef<HTMLImageElement | null>(null),
    pointer = useRef<number | null>(null),
    modified = useRef(false);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!!value),
    [error, setError] = useState("");
  const latest = useRef({ onSave, onCancel });
  latest.current = { onSave, onCancel };
  function draw() {
    const c = canvas.current,
      ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    if (base.current) {
      const img = base.current,
        scale = Math.min(c.width / img.width, c.height / img.height);
      ctx.drawImage(
        img,
        (c.width - img.width * scale) / 2,
        (c.height - img.height * scale) / 2,
        img.width * scale,
        img.height * scale,
      );
    }
    ctx.strokeStyle = "#151515";
    ctx.fillStyle = "#151515";
    ctx.lineWidth = c.width / 450;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes.current) {
      if (!stroke.length) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * c.width, stroke[0].y * c.height);
      for (const p of stroke) ctx.lineTo(p.x * c.width, p.y * c.height);
      ctx.stroke();
      if (stroke.length === 1) {
        ctx.beginPath();
        ctx.arc(
          stroke[0].x * c.width,
          stroke[0].y * c.height,
          ctx.lineWidth / 2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current!.showModal();
    const resize = () => {
      const box = stage.current!.getBoundingClientRect(),
        c = canvas.current!,
        width = Math.max(1, Math.min(box.width, box.height * 2.5)),
        height = width / 2.5,
        dpr = Math.min(window.devicePixelRatio || 1, 3);
      c.style.width = width + "px";
      c.style.height = height + "px";
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage.current!);
    resize();
    return () => {
      observer.disconnect();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!value) return;
    let disposed = false,
      url: string | undefined;
    const controller = new AbortController();
    fetch(mediaUrl(value.uri), {
      credentials: "include",
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok)
          throw Error(
            "Não foi possível carregar a assinatura. Cancele e tente novamente.",
          );
        return r.blob();
      })
      .then((blob) => {
        if (disposed) return;
        url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (disposed) return;
          base.current = img;
          draw();
          setLoading(false);
        };
        img.onerror = () => {
          if (!disposed) {
            setError(
              "Não foi possível carregar a assinatura. Cancele e tente novamente.",
            );
            setLoading(false);
          }
        };
        img.src = url;
      })
      .catch((e) => {
        if (!disposed) {
          setError((e as Error).message);
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [value]);
  function point(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }
  async function save() {
    if (busy || loading) return;
    if (!base.current && !strokes.current.length) {
      if (modified.current) {
        latest.current.onSave(undefined);
        return;
      }
      setError("Desenhe a assinatura antes de salvar.");
      return;
    }
    if (!modified.current && value) {
      latest.current.onSave(value);
      return;
    }
    setBusy(true);
    setError("");
    const finish = beginMediaActivity();
    try {
      const result = await uploadData(
        canvas.current!.toDataURL("image/png"),
        label + ".png",
      );
      latest.current.onSave(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      finish();
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="br-signature-dialog"
      aria-label={label}
      aria-modal="true"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) latest.current.onCancel();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header>
        <h2>{label}</h2>
        <p>
          Assine na área branca. No celular, vire de lado para ter mais espaço.
        </p>
      </header>
      <div className="br-signature-stage" ref={stage}>
        <canvas
          ref={canvas}
          aria-label={`Área para ${label.toLowerCase()}`}
          onPointerDown={(e) => {
            if (busy || loading || pointer.current !== null || e.button !== 0)
              return;
            e.preventDefault();
            pointer.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            strokes.current.push([point(e)]);
            modified.current = true;
            setError("");
            draw();
          }}
          onPointerMove={(e) => {
            if (pointer.current !== e.pointerId) return;
            e.preventDefault();
            strokes.current.at(-1)!.push(point(e));
            draw();
          }}
          onPointerUp={(e) => {
            if (pointer.current === e.pointerId) {
              strokes.current.at(-1)!.push(point(e));
              pointer.current = null;
              draw();
            }
          }}
          onPointerCancel={() => {
            pointer.current = null;
          }}
          onLostPointerCapture={() => {
            pointer.current = null;
          }}
        />
      </div>
      {loading && <p role="status">Carregando assinatura…</p>}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button
          type="button"
          className="primary"
          disabled={busy || loading}
          onClick={save}
        >
          {busy ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => {
            base.current = null;
            strokes.current = [];
            pointer.current = null;
            modified.current = true;
            setError("");
            draw();
          }}
        >
          Limpar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => latest.current.onCancel()}
        >
          Cancelar
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
