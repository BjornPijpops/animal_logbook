"use client";

import { useEffect, useState } from "react";

export const DOSE_LOGGED_EVENT = "dose-logged";

// A polite live region that outlives the row it announces: after a dose is logged the page
// refreshes and the row disappears, so the confirmation cannot live inside the row.
export function DoseLiveRegion() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const onLogged = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        setMessage(event.detail);
      }
    };
    window.addEventListener(DOSE_LOGGED_EVENT, onLogged);
    return () => window.removeEventListener(DOSE_LOGGED_EVENT, onLogged);
  }, []);
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}
