import { getClock, type Clock, type ClockMode } from "../core/clock.js";

export function getCliClock(params: { clockIso?: string; mode?: ClockMode }): Clock {
  return getClock(params);
}
