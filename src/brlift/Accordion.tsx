import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useLayoutEffect,
  type ReactNode,
} from "react";
import type { Progress } from "./report-progress";
type AccordionContext = {
  active: string[];
  setActive: (path: string[]) => void;
  statuses: Record<string, Progress>;
  reveal: (path: string[], focus?: boolean) => void;
  invalidPaths: string[][];
  errorPaths: string[][];
};
const Context = createContext<AccordionContext | null>(null);
const Parent = createContext<string[]>([]);
export const useAccordion = () => useContext(Context);
export const useAccordionPath = () => useContext(Parent);
const labels = {
  empty: "Vazio",
  pending: "Pendente",
  invalid: "Inválido",
  complete: "Completo",
};
const icons = { empty: "○", pending: "◐", invalid: "!", complete: "✓" };
export function openFold(path: string[]) {
  window.dispatchEvent(new CustomEvent("brlift:open-fold", { detail: path }));
}
const selector = "input,select,textarea,button,a[href],[tabindex]";
function visible(el: HTMLElement) {
  return (
    !el.closest("[hidden]") &&
    !el.matches(":disabled") &&
    el.tabIndex >= 0 &&
    el.getClientRects().length > 0
  );
}
function controls(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter(visible)
    .filter(
      (el) =>
        !(
          el instanceof HTMLInputElement &&
          el.type === "radio" &&
          !el.checked &&
          root.querySelector(
            `input[type="radio"][name="${CSS.escape(el.name)}"]:checked`,
          )
        ),
    );
}
function pathFor(el: HTMLElement, root: HTMLElement) {
  const path: string[] = [];
  let fold = el.closest<HTMLElement>("[data-fold]");
  while (fold && root.contains(fold)) {
    path.unshift(fold.dataset.fold!);
    fold = fold.parentElement?.closest<HTMLElement>("[data-fold]") ?? null;
  }
  return path;
}
export function AccordionRoot({
  active,
  setActive,
  statuses,
  children,
  pendingPaths,
  errorPaths = [],
}: {
  active: string[];
  setActive: (path: string[]) => void;
  statuses: Record<string, Progress>;
  children: ReactNode;
  pendingPaths: Record<string, string[]>;
  errorPaths?: string[][];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [invalidPaths, setInvalidPaths] = useState<string[][]>([]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    // Segmented dates retain incomplete/invalid text locally, while their model
    // value is empty. Include that field validation in ancestor badges as well.
    const paths = Array.from(
      ref.current.querySelectorAll<HTMLElement>('[aria-invalid="true"]'),
    )
      .filter((el) => !el.closest('[role="dialog"]'))
      .map((el) => pathFor(el, ref.current!));
    if (JSON.stringify(paths) !== JSON.stringify(invalidPaths))
      setInvalidPaths(paths);
  });
  const latest = useRef({ active, setActive, pendingPaths });
  latest.current = { active, setActive, pendingPaths };
  const set = (path: string[]) => {
    if (path.join("/") !== latest.current.active.join("/"))
      latest.current.setActive(path);
  };
  function reveal(path: string[], focus = true) {
    const target = latest.current.pendingPaths[path.join("/")] || path;
    const shouldFocus = focus || target.length > path.length;
    path = target;
    set(path);
    if (!shouldFocus) return;
    requestAnimationFrame(() => {
      const panel = Array.from(
        ref.current?.querySelectorAll<HTMLElement>("[data-fold]") || [],
      ).find((el) => pathFor(el, ref.current!).join("/") === path.join("/"));
      const body = panel?.querySelector<HTMLElement>(
        ":scope > [data-fold-body]",
      );
      if (body) {
        const first =
          Array.from(
            body.querySelectorAll<HTMLElement>('[data-pending-focus="true"]'),
          ).find(visible) ||
          controls(body)[0] ||
          panel?.querySelector<HTMLElement>(":scope > :is(h2,h3,h4) > button");
        if (first?.matches("[data-fold-toggle]") && body.contains(first)) {
          reveal(pathFor(first, ref.current!));
          return;
        }
        first?.focus();
        panel?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }
  useEffect(() => {
    const initial =
      latest.current.pendingPaths[latest.current.active.join("/")];
    if (initial) set(initial);
    const open = (event: Event) =>
      reveal((event as CustomEvent<string[]>).detail);
    const enterFromOutside = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== "Tab" ||
        !ref.current ||
        !(event.target instanceof HTMLElement) ||
        ref.current.contains(event.target)
      )
        return;
      const all = controls(document.body),
        next = all[all.indexOf(event.target) + (event.shiftKey ? -1 : 1)];
      if (next?.matches("[data-fold-toggle]") && ref.current.contains(next)) {
        event.preventDefault();
        reveal(pathFor(next, ref.current));
      }
    };
    let pointing = false;
    let pointerPath = "";
    const follow = (path: string[]) => {
      // Visiting whitespace, outside controls or a field in the parent does
      // not discard the last edited descendant. Sibling navigation still swaps it.
      if (
        path.length &&
        !path.every((part, index) => latest.current.active[index] === part)
      )
        set(path);
    };
    const startPointer = () => {
      pointing = true;
      pointerPath = latest.current.active.join("/");
    };
    const visit = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !ref.current) return;
      // Header clicks toggle themselves; dialogs (calendar and catalog) stay in their owning branch.
      if (target.closest("[data-fold-toggle]") || !target.closest(selector))
        return;
      const path = pathFor(target, ref.current);
      follow(path);
    };
    const focus = (event: Event) => {
      if (!pointing) visit(event);
    };
    const endPointer = (event: Event) => {
      const previous = pointerPath;
      const target = event.target;
      const path =
        target instanceof HTMLElement &&
        ref.current &&
        target.closest(selector) &&
        !target.closest("[data-fold-toggle]")
          ? pathFor(target, ref.current)
          : null;
      // Wait for the click handler before collapsing: moving the clicked button
      // between pointerdown and click can swallow add/remove actions.
      requestAnimationFrame(() => {
        pointing = false;
        if (path?.length && latest.current.active.join("/") === previous)
          follow(path);
      });
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("pointerdown", startPointer);
    document.addEventListener("pointerup", endPointer);
    document.addEventListener("pointercancel", endPointer);
    window.addEventListener("brlift:open-fold", open);
    document.addEventListener("keydown", enterFromOutside);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("pointerdown", startPointer);
      document.removeEventListener("pointerup", endPointer);
      document.removeEventListener("pointercancel", endPointer);
      window.removeEventListener("brlift:open-fold", open);
      document.removeEventListener("keydown", enterFromOutside);
    };
  }, []);
  return (
    <Context.Provider
      value={{
        active,
        setActive: set,
        statuses,
        reveal,
        invalidPaths,
        errorPaths,
      }}
    >
      <Parent.Provider value={[]}>
        <div
          ref={ref}
          className="br-accordion"
          onKeyDown={(event) => {
            const el = event.target as HTMLElement;
            if (
              event.defaultPrevented ||
              event.nativeEvent.isComposing ||
              !ref.current
            )
              return;
            // Never hijack modal controls, a select's native Enter, buttons or multiline text.
            const dialog = el.closest<HTMLElement>('[role="dialog"]');
            if (dialog) {
              if (
                event.key === "Tab" &&
                dialog.getAttribute("aria-modal") === "true"
              ) {
                const fields = controls(dialog),
                  first = fields[0],
                  last = fields.at(-1);
                if (event.shiftKey && el === first) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && el === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
              return;
            }
            const advanceEnter =
              event.key === "Enter" &&
              ((el instanceof HTMLInputElement &&
                !["file", "checkbox", "radio", "button", "submit"].includes(
                  el.type,
                )) ||
                (el instanceof HTMLTextAreaElement && event.ctrlKey));
            if (event.key !== "Tab" && !advanceEnter) return;
            const all = controls(document.body);
            const index = all.indexOf(el);
            const direction = event.shiftKey ? -1 : 1;
            let next = all[index + direction];
            if (advanceEnter) {
              let i = index + direction;
              while (
                all[i] &&
                all[i].matches("button:not([data-fold-toggle]),a")
              )
                i += direction;
              next = all[i];
            }
            if (!next) return;
            if (
              next.matches("[data-fold-toggle]") &&
              ref.current.contains(next)
            ) {
              event.preventDefault();
              const path = pathFor(next, ref.current);
              if (event.shiftKey) {
                requestAnimationFrame(() => next.focus());
              } else reveal(path);
            } else if (advanceEnter) {
              event.preventDefault();
              next.focus();
            }
          }}
        >
          {children}
        </div>
      </Parent.Provider>
    </Context.Provider>
  );
}
export function Fold({
  id,
  title,
  status,
  summary,
  main = false,
  children,
}: {
  id: string;
  title: string;
  status: Progress;
  summary?: string;
  main?: boolean;
  children: ReactNode;
}) {
  const context = useAccordion()!;
  const parent = useAccordionPath();
  const path = [...parent, id];
  if (
    [...context.invalidPaths, ...context.errorPaths].some((invalid) =>
      path.every((p, i) => invalid[i] === p),
    )
  )
    status = {
      state: "invalid",
      detail: "Corrija os campos inválidos desta seção",
    };
  const uid = useId();
  const open = path.every((p, i) => context.active[i] === p);
  const Heading = main ? "h2" : "h3";
  return (
    <section
      className={main ? "br-section br-fold" : "br-block br-fold"}
      data-fold={id}
      data-main-fold={main ? "true" : undefined}
      data-open={open}
      data-status={status.state}
    >
      <Heading aria-label={title}>
        <button
          type="button"
          data-fold-toggle
          aria-expanded={open}
          aria-controls={uid}
          aria-label={title}
          onClick={() => {
            open ? context.setActive(parent) : context.setActive(path);
          }}
        >
          <span className="br-fold-chevron" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          <span className="br-fold-title">
            {title}
            {summary && <small>{summary}</small>}
          </span>
          <span
            className={"br-progress br-progress-" + status.state}
            title={status.detail}
          >
            <span aria-hidden="true">{icons[status.state]}</span>{" "}
            {labels[status.state]}
          </span>
        </button>
      </Heading>
      <div id={uid} data-fold-body hidden={!open}>
        <p className="br-fold-hint">{status.detail}</p>
        <Parent.Provider value={path}>{children}</Parent.Provider>
      </div>
    </section>
  );
}
