"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Open dialogs, topmost last, so Escape only closes the one on top when dialogs are stacked.
const openStack: string[] = [];

// Modal dialog: a centred card (a bottom sheet on phones) over a dimmed page. Esc or a click outside closes it,
// the page behind stops scrolling, and focus moves into the dialog while it is open.
export function Dialog({
  open, onClose, title, children, className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    openStack.push(titleId);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && openStack[openStack.length - 1] === titleId) onClose(); };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      const at = openStack.indexOf(titleId);
      if (at >= 0) openStack.splice(at, 1);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, titleId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <h2 id={titleId} className="text-base font-bold text-neutral-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-neutral-400 hover:text-neutral-700">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
