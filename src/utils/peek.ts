/** How long the pointer must rest on the eye before the glance preview appears. */
export const PEEK_HOVER_DELAY_MS = 1000;

/** Where the peek card should line up: the top of the queue row, just right of the queue. */
export interface PeekAnchor {
  top: number;
  left: number;
}

/**
 * glance = hover preview: read-only, disappears when the pointer leaves the eye.
 * pinned = clicked: stays open and reveals the quick replies.
 */
export type PeekMode = "glance" | "pinned";