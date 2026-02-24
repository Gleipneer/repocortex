export type Clock = {
  nowIso: () => string;
};

export type ClockMode = "best-effort" | "deterministic";

export function getClock(params: { clockIso?: string; mode?: ClockMode }): Clock {
  const mode = params.mode ?? "best-effort";
  if (mode === "deterministic" && !params.clockIso) {
    throw new Error("Deterministic clock required: pass --clock-iso or set REPOCORTEX_CLOCK_ISO.");
  }
  return {
    nowIso: () => params.clockIso ?? new Date().toISOString()
  };
}
