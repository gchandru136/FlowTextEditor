export interface ErrorToasterProps {
  /** Message to display, or `null` when there is nothing to show. */
  message: string | null;
  /** When `true` the toast is not rendered. */
  hidden: boolean;
}

/**
 * Minimal transient error toast. Presentational only — the parent controls
 * visibility and auto-dismiss timing. Internal to the library.
 */
export function ErrorToaster({ message, hidden }: ErrorToasterProps) {
  if (hidden || !message) return null;

  return (
    <div className="erte-toast" role="alert">
      {message}
    </div>
  );
}
