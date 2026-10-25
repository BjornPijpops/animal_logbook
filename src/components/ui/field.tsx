import type { ReactNode } from "react";

type FieldProps = {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: (aria: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid": boolean;
  }) => ReactNode;
};

// Wires label, hint and error to the control so screen readers announce them.
export function Field({ id, label, error, hint, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        "aria-invalid": Boolean(error),
      })}
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
