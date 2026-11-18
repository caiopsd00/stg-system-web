/** Original BR LIFT outlines, extracted from the brand artwork. */
export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className={`br-brand${large ? " br-brand-large" : ""}`}>
      <img
        src="/brand/brlift-lime.svg"
        width="199"
        height="157"
        alt="BR LIFT"
      />
      {!large && <span>Operação e gestão</span>}
    </div>
  );
}
