import { useEffect, useId, useRef, useState } from "react";
import { localDate } from "../contracts/domain";
import { dateParts, dateISO, type DateParts } from "./date-utils";

export function DateField({
  label,
  value = "",
  onChange,
  required = false,
  onBlur,
  error,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  required?: boolean;
  onBlur?: () => void;
  error?: string;
}) {
  const [parts, setParts] = useState<DateParts>(() => dateParts(value));
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [above, setAbove] = useState(false);
  const [month, setMonth] = useState(
    () => new Date((dateISO(dateParts(value)) || localDate()) + "T12:00:00"),
  );
  const root = useRef<HTMLDivElement>(null),
    inputs = useRef<(HTMLInputElement | null)[]>([]);
  const emitted = useRef(value),
    calendarId = useId(),
    labelId = useId();
  useEffect(() => {
    if (value !== emitted.current) {
      setParts(dateParts(value));
      emitted.current = value;
    }
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function commit(next: DateParts) {
    setParts(next);
    const iso = dateISO(next);
    emitted.current = iso;
    onChange(iso);
    if (iso) setMonth(new Date(iso + "T12:00:00"));
  }
  function focus(index: number) {
    inputs.current[index]?.focus();
    inputs.current[index]?.select();
  }
  function show() {
    const rect = root.current?.getBoundingClientRect();
    setAlignRight((rect?.left || 0) + 300 > window.innerWidth - 16);
    setAbove(
      Boolean(rect && rect.bottom + 360 > window.innerHeight && rect.top > 360),
    );
    if (!open)
      setMonth(new Date((dateISO(parts) || localDate()) + "T12:00:00"));
    setOpen(true);
  }
  function choose(iso: string) {
    commit(dateParts(iso));
    focus(0);
    setOpen(false);
  }
  const y = month.getFullYear(),
    m = month.getMonth();
  const start = new Date(y, m, 1).getDay(),
    days = new Date(y, m + 1, 0).getDate();
  const invalid = parts.some(Boolean) && !dateISO(parts);
  return (
    <div
      ref={root}
      className="br-date"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          onBlur?.();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <span
        id={labelId}
        className="br-field-label"
        onClick={() => {
          show();
          focus(0);
        }}
      >
        {label}
      </span>
      <div
        className="br-date-input"
        role="group"
        aria-labelledby={labelId}
        aria-invalid={invalid || !!error}
        onClick={(e) => {
          show();
          if (
            !(e.target instanceof HTMLInputElement) &&
            !(e.target as HTMLElement).closest("button")
          )
            focus(0);
        }}
      >
        {parts.map((part, i) => (
          <span key={i} className="br-date-part">
            {i > 0 && <span aria-hidden="true">/</span>}
            <input
              ref={(el) => {
                inputs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              aria-label={`${label}: ${["dia", "mês", "ano"][i]}`}
              aria-controls={calendarId}
              aria-expanded={open}
              aria-invalid={invalid}
              required={required}
              placeholder={["dd", "mm", "aaaa"][i]}
              className={i === 2 ? "br-date-year" : ""}
              value={part}
              maxLength={i === 2 ? 4 : 2}
              onFocus={(e) => {
                show();
                e.currentTarget.select();
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                show();
                focus(i);
              }}
              onClick={(e) => {
                e.currentTarget.focus();
                e.currentTarget.select();
              }}
              onChange={(e) => {
                const digits = e.target.value
                  .replace(/\D/g, "")
                  .slice(0, i === 2 ? 4 : 2);
                const next = [...parts] as DateParts;
                next[i] = digits;
                commit(next);
                if (
                  i < 2 &&
                  (digits.length === 2 || Number(digits) > (i === 0 ? 3 : 1))
                )
                  focus(i + 1);
              }}
              onBlur={() => {
                if (i < 2)
                  setParts(
                    (current) =>
                      current.map((p, j) =>
                        i === j && p ? p.padStart(2, "0") : p,
                      ) as DateParts,
                  );
              }}
              onPaste={(e) => {
                const pasted = dateParts(
                  e.clipboardData.getData("text").trim(),
                );
                if (dateISO(pasted)) {
                  e.preventDefault();
                  commit(pasted);
                  focus(2);
                }
              }}
              onKeyDown={(e) => {
                if (["ArrowLeft", "ArrowRight", "/"].includes(e.key)) {
                  e.preventDefault();
                  focus(
                    Math.max(
                      0,
                      Math.min(2, i + (e.key === "ArrowLeft" ? -1 : 1)),
                    ),
                  );
                }
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const next = [...parts] as DateParts;
                  next[i] = String(
                    Math.max(
                      1,
                      Math.min(
                        i === 0 ? 31 : i === 1 ? 12 : 9999,
                        Number(
                          part || (i === 2 ? new Date().getFullYear() : 1),
                        ) + (e.key === "ArrowUp" ? 1 : -1),
                      ),
                    ),
                  ).padStart(i === 2 ? 4 : 2, "0");
                  commit(next);
                }
              }}
            />
          </span>
        ))}
        <button
          type="button"
          aria-label={`Abrir calendário: ${label}`}
          onClick={() => {
            show();
            focus(0);
          }}
        >
          ▦
        </button>
      </div>
      {invalid && (
        <small role="status">Complete uma data válida (dia/mês/ano).</small>
      )}
      {open && (
        <div
          id={calendarId}
          role="dialog"
          aria-label={`Calendário: ${label}`}
          className="br-calendar"
          style={{
            ...(alignRight ? { right: 0, left: "auto" } : {}),
            ...(above ? { bottom: "100%", top: "auto" } : {}),
          }}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) e.preventDefault();
          }}
        >
          <div className="br-calendar-nav">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => setMonth(new Date(y, m - 1, 1))}
            >
              ‹
            </button>
            <strong aria-live="polite">
              {month.toLocaleDateString("pt-BR", {
                month: "long",
                year: "numeric",
              })}
            </strong>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => setMonth(new Date(y, m + 1, 1))}
            >
              ›
            </button>
          </div>
          <div className="br-calendar-grid">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((day, i) => (
              <span key={`w${i}`} aria-hidden="true">
                {day}
              </span>
            ))}
            {Array.from({ length: start }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  key={iso}
                  type="button"
                  aria-label={`${String(i + 1).padStart(2, "0")}/${String(m + 1).padStart(2, "0")}/${y}`}
                  aria-pressed={iso === dateISO(parts)}
                  aria-current={iso === localDate() ? "date" : undefined}
                  onClick={() => choose(iso)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="br-calendar-nav">
            <button type="button" onClick={() => choose(localDate())}>
              Hoje
            </button>
            <button
              type="button"
              onClick={() => {
                commit(["", "", ""]);
                focus(0);
                setOpen(false);
              }}
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => {
                focus(0);
                setOpen(false);
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
