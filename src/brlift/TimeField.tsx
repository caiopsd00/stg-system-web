import { useEffect, useId, useRef, useState } from "react";
import {
  timeParts,
  timeValue,
  timeInputValue,
  type TimeParts,
} from "./time-utils";

export function TimeField({
  label,
  value = "",
  onChange,
  required = false,
  onBlur,
  error,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  required?: boolean;
  onBlur?: () => void;
  error?: string;
}) {
  const [parts, setParts] = useState<TimeParts>(() => timeParts(value));
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [right, setRight] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const emitted = useRef(value);
  const labelId = useId(),
    pickerId = useId();
  const invalid = parts.some(Boolean) && !timeValue(parts);
  useEffect(() => {
    if (!open) return;
    // Open the lists near the selected value, including late hours/minutes.
    for (const button of root.current?.querySelectorAll<HTMLElement>(
      '.br-time-options [aria-pressed="true"]',
    ) || []) {
      const list = button.parentElement!;
      list.scrollTop +=
        button.getBoundingClientRect().top -
        list.getBoundingClientRect().top -
        (list.clientHeight - button.clientHeight) / 2;
    }
  }, [open]);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setParts(timeParts(value));
    }
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function commit(next: TimeParts) {
    setParts(next);
    emitted.current = timeInputValue(next);
    onChange(emitted.current);
  }
  function focus(index: number) {
    inputs.current[index]?.focus();
    inputs.current[index]?.select();
  }
  function show() {
    const rect = root.current?.getBoundingClientRect();
    setRight(Boolean(rect && rect.left + 280 > window.innerWidth - 16));
    setAbove(
      Boolean(rect && rect.bottom + 320 > window.innerHeight && rect.top > 320),
    );
    setOpen(true);
  }
  function choose(index: number, value: string) {
    const next = [...parts] as TimeParts;
    next[index] = value;
    commit(next);
    focus(1);
    if (index === 1) setOpen(false);
  }
  return (
    <div
      className="br-time"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          onBlur?.();
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
        className="br-time-input"
        role="group"
        aria-labelledby={labelId}
        aria-invalid={invalid || !!error}
        onClick={(event) => {
          show();
          if (
            !(event.target instanceof HTMLInputElement) &&
            !(event.target as HTMLElement).closest("button")
          )
            focus(0);
        }}
      >
        {parts.map((part, index) => (
          <span className="br-time-part" key={index}>
            {index > 0 && <span aria-hidden="true">:</span>}
            <input
              ref={(el) => {
                inputs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              aria-label={`${label}: ${index === 0 ? "hora" : "minuto"}`}
              aria-controls={pickerId}
              aria-expanded={open}
              aria-invalid={invalid}
              required={required}
              placeholder={index === 0 ? "hh" : "mm"}
              maxLength={2}
              value={part}
              onFocus={(event) => {
                show();
                event.currentTarget.select();
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                show();
                focus(index);
              }}
              onClick={(event) => event.currentTarget.select()}
              onChange={(event) => {
                const digits = event.target.value
                  .replace(/\D/g, "")
                  .slice(0, 2);
                const next = [...parts] as TimeParts;
                next[index] = digits;
                commit(next);
                if (index === 0 && (digits.length === 2 || Number(digits) > 2))
                  focus(1);
              }}
              onBlur={() =>
                setParts(
                  (current) =>
                    current.map((part, i) =>
                      i === index && part ? part.padStart(2, "0") : part,
                    ) as TimeParts,
                )
              }
              onPaste={(event) => {
                const pasted = timeParts(event.clipboardData.getData("text"));
                if (timeValue(pasted)) {
                  event.preventDefault();
                  commit(pasted);
                  focus(1);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpen(false);
                } else if (
                  ["ArrowLeft", "ArrowRight", ":"].includes(event.key) ||
                  (event.key === "Enter" && index === 0)
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  focus(event.key === "ArrowLeft" ? 0 : 1);
                } else if (["ArrowUp", "ArrowDown"].includes(event.key)) {
                  event.preventDefault();
                  event.stopPropagation();
                  const max = index === 0 ? 24 : 60;
                  const next = [...parts] as TimeParts;
                  next[index] = String(
                    (Number(part || 0) +
                      (event.key === "ArrowUp" ? 1 : -1) +
                      max) %
                      max,
                  ).padStart(2, "0");
                  commit(next);
                  show();
                }
              }}
            />
          </span>
        ))}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Abrir horários: ${label}`}
          onClick={() => {
            show();
            focus(0);
          }}
        >
          ◷
        </button>
      </div>
      {open && (
        <div
          id={pickerId}
          role="dialog"
          aria-label={`Selecionar horário: ${label}`}
          className={
            "br-time-picker" +
            (above ? " br-time-above" : "") +
            (right ? " br-time-right" : "")
          }
        >
          <div className="br-time-columns">
            {[24, 60].map((count, index) => (
              <div key={index}>
                <strong>{index === 0 ? "Hora" : "Minuto"}</strong>
                <div className="br-time-options">
                  {Array.from({ length: count }, (_, n) =>
                    String(n).padStart(2, "0"),
                  ).map((option) => (
                    <button
                      type="button"
                      tabIndex={-1}
                      key={option}
                      aria-pressed={
                        parts[index] !== "" &&
                        Number(parts[index]) === Number(option)
                      }
                      aria-label={`${index === 0 ? "Hora" : "Minuto"} ${option}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(index, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="br-actions">
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                commit(["", ""]);
                focus(0);
                setOpen(false);
              }}
            >
              Limpar
            </button>
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                focus(1);
                setOpen(false);
              }}
            >
              Fechar
            </button>
          </div>
          <small>
            Digite hora e minuto. ↑ ↓ ajustam; Tab avança; Esc fecha.
          </small>
        </div>
      )}
    </div>
  );
}
