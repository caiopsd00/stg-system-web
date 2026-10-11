import { createContext, useContext, type ReactNode } from "react";
import type { FormIssue } from "./form-validation";

const Context = createContext<FormIssue[]>([]);
export function FormErrors({
  issues,
  children,
}: {
  issues: FormIssue[];
  children: ReactNode;
}) {
  return <Context.Provider value={issues}>{children}</Context.Provider>;
}
export function useFieldError(key: string) {
  return useContext(Context).find((issue) => issue.key === key)?.message;
}
export function useFormErrors() {
  return useContext(Context);
}
export function InlineError({ field }: { field: string }) {
  const message = useFieldError(field);
  return message ? (
    <small className="br-inline-error" role="alert">
      {message}
    </small>
  ) : null;
}
