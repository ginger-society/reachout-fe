import { useEffect, useRef } from "react";

/**
 * Closes a popover on outside click / tap or Escape.
 * Attach the returned ref to the element that wraps trigger + popover.
 */
export function useDismissable<T extends HTMLElement>(
  open: boolean,
  onDismiss: () => void
) {
  const ref = useRef<T>(null);
  const callback = useRef(onDismiss);

  useEffect(() => {
    callback.current = onDismiss;
  });

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback.current();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") callback.current();
    };

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return ref;
}
