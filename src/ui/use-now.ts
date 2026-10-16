"use client";
import { useEffect, useState } from "react";

/** Bieżący czas odświeżany domyślnie co 30 s (do względnych opisów typu „2 minuty temu”). */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
