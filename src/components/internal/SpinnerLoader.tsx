/**
 * Full-viewport loading overlay shown while an AI request is in flight.
 * Internal to the library (not part of the public API).
 */
export function SpinnerLoader() {
  return (
    <div className="erte-spinner-overlay" role="status" aria-live="polite" aria-label="Loading">
      <span className="erte-spinner" />
    </div>
  );
}
