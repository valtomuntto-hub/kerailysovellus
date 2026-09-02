import { config } from "../config.js";
import { logger } from "../logger.js";
import * as db from "../persistence/db.js";

/** Onko botti pysaytetty tanaan paivan tappiorajan (MAX_DAILY_LOSS_SOL) takia. */
export function isTradingHaltedToday(): boolean {
  const stats = db.getTodayStats();
  if (stats.halted) return true;

  const realizedLoss = -stats.realizedPnlSol; // positiivinen luku = tappiota
  if (realizedLoss >= config.MAX_DAILY_LOSS_SOL) {
    db.setHaltedToday(true);
    logger.error(
      `Paivan tappioraja saavutettu (${realizedLoss.toFixed(4)} / ${config.MAX_DAILY_LOSS_SOL} SOL) - botti pysaytetty tanaan.`
    );
    return true;
  }
  return false;
}

export function canOpenNewPosition(): boolean {
  if (isTradingHaltedToday()) return false;
  return db.getOpenPositions().length < config.MAX_CONCURRENT_POSITIONS;
}

export function passesMarketFilters(liquidityUsd: number, ageMinutes: number): { ok: boolean; reason?: string } {
  if (liquidityUsd < config.MIN_LIQUIDITY_USD) {
    return { ok: false, reason: `liikaa vahan likviditeettia ($${liquidityUsd.toFixed(0)})` };
  }
  if (ageMinutes < config.MIN_PAIR_AGE_MINUTES) {
    return { ok: false, reason: `pari liian uusi (${ageMinutes.toFixed(1)} min) - huijausriski` };
  }
  return { ok: true };
}

/** Kuinka monta SOL:aa uuteen positioon kaytetaan, huomioiden saatavilla oleva saldo ja gas-varaus. */
export function positionSizeSol(availableSol: number): number {
  const usable = Math.max(availableSol - 0.02, 0); // varaa vahan verkkomaksuihin
  return Math.min(config.MAX_POSITION_SOL, usable);
}
