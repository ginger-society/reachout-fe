import { useEffect, useRef } from "react";
import { FaEye } from "react-icons/fa";
import { PEEK_HOVER_DELAY_MS, PeekAnchor } from "@/utils/peek";

interface PeekButtonProps {
  threadId: string;
  site: string;
  /** true while this row's peek is pinned open */
  pinned: boolean;
  className?: string;
  /** pointer rested on the eye for PEEK_HOVER_DELAY_MS */
  onGlance: (anchor: PeekAnchor) => void;
  /** pointer left the eye */
  onGlanceEnd: () => void;
  /** clicked: pin (or unpin) */
  onToggle: (anchor: PeekAnchor) => void;
}

/** Eye icon: hover 2s to glance at the messages, click to pin and reply. */
const PeekButton = ({
  threadId,
  site,
  pinned,
  className,
  onGlance,
  onGlanceEnd,
  onToggle,
}: PeekButtonProps) => {
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<number>();

  const clearTimer = () => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
  };

  // never fire after the row is gone
  useEffect(() => clearTimer, []);

  const anchor = (): PeekAnchor => {
    const row = ref.current?.closest("li")?.getBoundingClientRect();
    const queue = ref.current?.closest("aside")?.getBoundingClientRect();
    return { top: row?.top ?? 12, left: (queue?.right ?? 344) + 8 };
  };

  return (
    <button
      ref={ref}
      type="button"
      className={className}
      data-peek-for={threadId}
      aria-label={`Peek at chat from ${site}`}
      aria-pressed={pinned}
      title="Hover to glance, click to reply"
      onMouseEnter={() => {
        clearTimer();
        timer.current = window.setTimeout(() => {
          timer.current = undefined;
          onGlance(anchor());
        }, PEEK_HOVER_DELAY_MS);
      }}
      onMouseLeave={() => {
        clearTimer();
        onGlanceEnd();
      }}
      onClick={() => {
        clearTimer();
        onToggle(anchor());
      }}
    >
      <FaEye aria-hidden="true" />
    </button>
  );
};

export default PeekButton;