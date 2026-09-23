"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldBaseClasses = cn(
  "w-full rounded-xl border border-neutral-300 bg-surface px-4 py-2.5 text-sm text-neutral-900",
  "transition-[border-color,box-shadow] duration-fast ease-out placeholder:text-neutral-400",
  "focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-50",
  "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400"
);

const fieldErrorClasses =
  "border-critical focus:border-critical focus:ring-critical-bg";

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

// Wrapper adding a label, hint and error to a form field.
export function FieldWrapper({ label, htmlFor, error, hint, required, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-800">
        {label}
        {required && <span className="ml-0.5 text-critical">*</span>}
      </label>
      {children}
      <div className="grid transition-[grid-template-rows] duration-fast ease-out" style={{ gridTemplateRows: error || hint ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          {error ? (
            <p role="alert" className="pt-0.5 text-sm text-critical transition-opacity duration-fast">
              {error}
            </p>
          ) : hint ? (
            <p className="pt-0.5 text-sm text-neutral-500">{hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const Input = ({
  className,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) => (
  <input className={cn(fieldBaseClasses, error && fieldErrorClasses, className)} {...props} />
);

export const PasswordInput = ({
  className,
  error,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { error?: boolean }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <input
        type={revealed ? "text" : "password"}
        className={cn(fieldBaseClasses, "pr-11", error && fieldErrorClasses, className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-400 transition-colors duration-fast hover:text-neutral-600"
        aria-label={revealed ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
};

export const Textarea = ({
  className,
  error,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) => (
  <textarea
    className={cn(fieldBaseClasses, "min-h-32 resize-y", error && fieldErrorClasses, className)}
    {...props}
  />
);

export const Select = ({
  className,
  error,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) => (
  <select className={cn(fieldBaseClasses, error && fieldErrorClasses, className)} {...props}>
    {children}
  </select>
);
