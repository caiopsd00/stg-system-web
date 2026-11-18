import { useEffect, useId, useRef, useState } from "react";
import { filterCatalogOptions, type CatalogOption } from "./catalog-search";

/** Catalogs are already loaded by App. Typing never requests the server. */
export function CatalogSelect({
  label,
  value,
  options,
  disabled,
  invalid,
  onChange,
}: {
  label: string;
  value: string;
  options: CatalogOption[];
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId().replace(/:/g, ""),
    root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const selected = options.find((option) => option.value === value);
  const visible = filterCatalogOptions(options, query);
  const choose = (option: CatalogOption) => {
    if (!option.disabled) {
      onChange(option.value);
      setOpen(false);
      setQuery("");
    }
  };
  useEffect(() => {
    setOpen(false);
    setQuery("");
  }, [value, disabled]);
  useEffect(() => {
    if (!open) return;
    const option = document.getElementById(id + "-option-" + active);
    const list = document.getElementById(id + "-list");
    if (!option || !list) return;
    const top = option.offsetTop,
      bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight;
  }, [active, query, open, id]);
  return (
    <div
      className="br-catalog-select"
      ref={root}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="br-catalog-input">
        <input
          id={id}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={id + "-list"}
          aria-autocomplete="list"
          aria-activedescendant={
            open && visible[active] ? id + "-option-" + active : undefined
          }
          data-value={value}
          aria-invalid={invalid}
          autoComplete="off"
          disabled={disabled}
          placeholder="Selecione ou pesquise"
          value={open ? query : selected?.label || ""}
          onFocus={() => {
            setActive(0);
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
              setQuery("");
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              event.stopPropagation();
              if (!open) {
                setOpen(true);
                setActive(
                  Math.max(
                    0,
                    visible.findIndex((option) => option.value === value),
                  ),
                );
                return;
              }
              setActive((n) =>
                Math.max(
                  0,
                  Math.min(
                    visible.length - 1,
                    n + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (event.key === "Enter" && open) {
              event.preventDefault();
              event.stopPropagation();
              if (visible[active]) choose(visible[active]);
            }
          }}
        />
        <span aria-hidden="true">▾</span>
      </div>
      {open && !disabled && (
        <div
          className="br-catalog-options"
          role="listbox"
          id={id + "-list"}
          aria-label={label + " — opções"}
        >
          {!query && (
            <div
              role="option"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange("");
                  setOpen(false);
                  setQuery("");
                  root.current?.querySelector("input")?.focus();
                }
              }}
              aria-selected={!value}
              data-value=""
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange("");
                setOpen(false);
                setQuery("");
              }}
            >
              Limpar seleção
            </div>
          )}
          {visible.map((option, index) => (
            <div
              key={option.value}
              id={id + "-option-" + index}
              role="option"
              data-value={option.value}
              aria-selected={option.value === value}
              aria-disabled={option.disabled}
              className={index === active ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {option.label}
            </div>
          ))}
          {!visible.length && (
            <div role="status">Nenhum cadastro encontrado.</div>
          )}
        </div>
      )}
    </div>
  );
}
