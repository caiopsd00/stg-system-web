import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Media } from "../contracts/domain";
import { mediaUrl, upload, uploadData } from "./api";
import { DateField } from "./DateField";
import { TimeField } from "./TimeField";
import { beginMediaActivity } from "./media-activity";
import { Fold, useAccordion } from "./Accordion";
export function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  onBlur,
  readOnly = false,
  error,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  onBlur?: () => void;
  readOnly?: boolean;
  error?: string;
}) {
  if (type === "time")
    return (
      <div className="br-field-with-error">
        <TimeField
          label={label}
          value={value || ""}
          onChange={onChange}
          required={required}
          onBlur={onBlur}
          error={error}
        />
        {error && (
          <small className="br-inline-error" role="alert">
            {error}
          </small>
        )}
      </div>
    );
  if (type === "date")
    return (
      <div className="br-field-with-error">
        <DateField
          label={label}
          value={value || ""}
          onChange={onChange}
          required={required}
          onBlur={onBlur}
          error={error}
        />
        {error && (
          <small className="br-inline-error" role="alert">
            {error}
          </small>
        )}
      </div>
    );
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type={type}
        step={type === "number" ? "any" : undefined}
        readOnly={readOnly}
        disabled={readOnly}
        tabIndex={readOnly ? -1 : undefined}
        value={value ?? ""}
        required={required}
        aria-invalid={!!error}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <small className="br-inline-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
export function TextField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <label>
      {label}
      <textarea
        aria-label={label}
        value={value || ""}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <small className="br-inline-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
export function ChoiceButtons({
  label,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  error?: string;
}) {
  const name = useId();
  return (
    <fieldset className="br-choice" aria-invalid={!!error}>
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <label
            key={option.value}
            className={value === option.value ? "selected" : ""}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && (
        <small className="br-inline-error" role="alert">
          {error}
        </small>
      )}
    </fieldset>
  );
}
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const accordion = useAccordion();
  const id = title.split(".")[0];
  if (accordion?.statuses[id])
    return (
      <Fold id={id} title={title} main status={accordion.statuses[id]}>
        {children}
      </Fold>
    );
  return (
    <section className="br-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Photos({
  value,
  onChange,
}: {
  value: Media[];
  onChange: (v: Media[]) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  return (
    <div className="br-photos">
      <div className="br-thumbs">
        {value.map((p, i) => (
          <div key={(p.id || p.uri) + ":" + i}>
            <a href={mediaUrl(p.uri)} target="_blank" rel="noreferrer">
              <img src={mediaUrl(p.uri)} alt={p.name} />
            </a>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            >
              Remover foto {i + 1}
            </button>
          </div>
        ))}
      </div>
      <label className="br-file">
        {busy ? "Enviando..." : "Adicionar fotos"}
        <input
          aria-label="Adicionar fotos"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={busy}
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            setBusy(true);
            setError("");
            const finish = beginMediaActivity();
            try {
              for (const f of files) {
                const added = await upload(f);
                latest.current.onChange([...latest.current.value, added]);
                latest.current.value = [...latest.current.value, added];
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
              finish();
            }
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function Signature({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: Media;
  onChange: (v: Media | undefined) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    dirty = useRef(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const latestChange = useRef(onChange);
  latestChange.current = onChange;
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 600, 180);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
    }
  }, []);
  const point = (e: React.PointerEvent) => {
    const c = canvas.current!,
      r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height,
    ];
  };
  return (
    <div className="br-signature">
      <h3>{label}</h3>
      {value && <img alt={label + " salva"} src={mediaUrl(value.uri)} />}
      <canvas
        aria-label={label}
        ref={canvas}
        width={600}
        height={180}
        onPointerDown={(e) => {
          if (busy) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const [x, y] = point(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          dirty.current = true;
          const [x, y] = point(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
      <div className="br-actions">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!dirty.current) {
              setError("Desenhe a assinatura antes de salvar.");
              return;
            }
            setBusy(true);
            const finish = beginMediaActivity();
            try {
              const uploaded = await uploadData(
                canvas.current!.toDataURL("image/png"),
                label + ".png",
              );
              latestChange.current(uploaded);
              setError("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
              finish();
            }
          }}
        >
          Salvar assinatura
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const ctx = canvas.current!.getContext("2d")!;
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, 600, 180);
            dirty.current = false;
            onChange(undefined);
          }}
        >
          Limpar
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
