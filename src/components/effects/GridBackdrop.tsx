/** Animated moving grid backdrop. Purely decorative. */
export function GridBackdrop({ soft = false }: { soft?: boolean }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className={soft ? "grid-motion-soft" : "grid-motion"} />
    </span>
  );
}
