"use client";

import { useEffect } from "react";
import { clearOfflineEmergency } from "./emergency-cache";

// Rendered only for signed-out visitors, so any leftover offline data is removed.
export function ClearOfflineEmergencyOnMount() {
  useEffect(() => {
    void clearOfflineEmergency();
  }, []);
  return null;
}
