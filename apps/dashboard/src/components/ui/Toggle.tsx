import { cn } from "../../lib/utils";

export interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}

// A generic on/off switch — not Regional-Admin-specific, so any future phase/screen that needs
// a toggle reuses this one rather than building its own (ONCOFLOW_REGIONAL_ADMIN_BUILD_GUIDE.md
// Phase 8's acceptance criteria calls this out explicitly).
export function Toggle({ checked, onChange, disabled, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed",
        checked ? "bg-ink" : "bg-gray-300",
        disabled && "opacity-50",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
