export type InputFormat = "cpf" | "cnpj" | "phone";

function groups(value: string, widths: number[], separators: string[]) {
  let offset = 0;
  return widths
    .map((width, index) => {
      const part = value.slice(offset, offset + width);
      offset += width;
      return part ? (index ? separators[index - 1] : "") + part : "";
    })
    .join("");
}

export function formatInput(value: string, kind: InputFormat) {
  if (kind === "cpf")
    return groups(value.replace(/\D/g, ""), [3, 3, 3, 2], [".", ".", "-"]);
  if (kind === "cnpj")
    return groups(
      value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      [2, 3, 3, 4, 2],
      [".", ".", "/", "-"],
    );
  const digits = value.replace(/\D/g, "").slice(0, 15);
  const international = value.trimStart().startsWith("+") || digits.length > 11;
  if (!digits) return international ? "+" : "";
  // Brazilian numbers get DDD + number. With extra digits, treat the prefix
  // as an international code; an explicit + also works for shorter numbers.
  const ddiLength = digits.startsWith("55")
    ? 2
    : digits.startsWith("1") || digits.startsWith("7")
      ? 1
      : digits.length >= 14
        ? 3
        : Math.min(2, digits.length);
  const ddi = international ? digits.slice(0, ddiLength) : "";
  const national = digits.slice(ddi.length);
  const prefix = ddi ? "+" + ddi + (national ? " " : "") : "";
  if (!national) return prefix;
  if (ddi && ddi !== "55") return prefix + national;
  if (national.length <= 2) return prefix + "(" + national;
  const number = national.slice(2);
  const split = number.length > 8 ? 5 : 4;
  return (
    prefix +
    "(" +
    national.slice(0, 2) +
    ") " +
    number.slice(0, split) +
    (number.length > split ? "-" + number.slice(split) : "")
  );
}

export function formatForLabel(label: string): InputFormat | undefined {
  if (/\bcpf\b/i.test(label)) return "cpf";
  if (/\bcnpj\b/i.test(label)) return "cnpj";
  if (/\b(telefone|celular)\b/i.test(label)) return "phone";
}

export function changeFormattedInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  format: (value: string) => string,
  onChange: (value: string) => void,
) {
  const raw = input.value;
  const next = format(raw);
  const caret = input.selectionStart;
  const nextCaret = caret === null ? null : format(raw.slice(0, caret)).length;
  onChange(next);
  if (raw !== next && nextCaret !== null)
    requestAnimationFrame(() => {
      if (document.activeElement === input && input.value === next)
        input.setSelectionRange(nextCaret, nextCaret);
    });
}
