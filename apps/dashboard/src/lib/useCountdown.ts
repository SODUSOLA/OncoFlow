import { useEffect, useState } from "react";

export function useCountdown(target: string | null) {
  const [remaining, setRemaining] = useState(() => (target ? new Date(target).getTime() - Date.now() : 0));

  useEffect(() => {
    if (!target) return;
    const interval = setInterval(() => setRemaining(new Date(target).getTime() - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [target]);

  const clamped = Math.max(0, remaining);
  const days = Math.floor(clamped / 86_400_000);
  const hours = Math.floor((clamped % 86_400_000) / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1_000);
  return { days, hours, minutes, seconds, isPast: remaining <= 0 };
}
