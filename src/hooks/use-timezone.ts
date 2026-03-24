"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "analytics_timezone";

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

function getSavedTimezone(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getTimezone(): string {
  return getSavedTimezone() || detectTimezone();
}

export function useTimezone() {
  const [timezone, setTimezoneState] = useState(detectTimezone);

  useEffect(() => {
    const saved = getSavedTimezone();
    if (saved) setTimezoneState(saved);
  }, []);

  const setTimezone = (tz: string) => {
    setTimezoneState(tz);
    try {
      localStorage.setItem(STORAGE_KEY, tz);
    } catch { /* ignore */ }
  };

  const resetTimezone = () => {
    const detected = detectTimezone();
    setTimezoneState(detected);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  };

  return { timezone, setTimezone, resetTimezone };
}
