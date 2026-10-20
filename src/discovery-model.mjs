// Pet and Ancient Relic finds from Folk actions. Pure: no game globals.

/**
 * The crew as a whole rolls for the Hiring pet like one skill would, then half as often:
 * the engine's chance per roll is (interval s × Hiring level) / 250,000 %, so the interval
 * handed to it is split across the Folks working at that moment and halved.
 */
export const PET_ROLL_FACTOR = 0.5;

export function petRollIntervalMs(intervalMs, workingCount, factor = PET_ROLL_FACTOR) {
  if (!(intervalMs > 0)) return 0;
  const n = Math.max(1, Math.floor(workingCount) || 1);
  return (intervalMs * factor) / n;
}

/** Expected rolls per hour and chance per hour (%) at a Hiring level; a readout for balancing. */
export function petChancePerHour({ level, intervalMs = 3000, workingCount = 1, factor = PET_ROLL_FACTOR }) {
  const rollInterval = petRollIntervalMs(intervalMs, workingCount, factor);
  const chancePerRoll = ((rollInterval / 1000) * level) / 250000; // percent, engine formula
  const rollsPerHour = (3600000 / intervalMs) * workingCount;
  return chancePerRoll * rollsPerHour;
}

/** Relics roll on every finished action, failed or not, like the engine does for its skills. */
export function relicRollLevel(hiringLevel) {
  return Math.max(1, Math.floor(hiringLevel) || 1);
}
