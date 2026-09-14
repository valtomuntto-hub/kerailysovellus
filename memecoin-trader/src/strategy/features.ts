import { pairAgeMinutes } from "../data/dexscreener.js";
import type { CopyTradeInfo, TwitterSignalInfo } from "../persistence/db.js";
import type { FeatureVector, TokenPair } from "../types.js";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function buySellRatio(buys: number, sells: number): number {
  // Valilla [-1, 1]: 1 = pelkkia ostoja, -1 = pelkkia myynteja.
  return (buys - sells) / Math.max(buys + sells, 1);
}

/**
 * Copy-trade-piirre: yhdistaa "kuinka moni seurattu lompakko pitaa tata
 * hallussaan" (breadth) ja "kuinka tuoreesti tama havaittiin" (freshness,
 * vanhenee ~2h:ssa). Palauttaa 0 jos seurantaa ei ole tai kukaan seuratuista
 * ei pida tokenia.
 */
function copyTradeScore(info?: CopyTradeInfo): number {
  if (!info || info.watchedByCount === 0) return 0;
  const freshness = clamp(1 - info.minFirstSeenMinutesAgo / 120, 0, 1);
  const breadth = clamp(info.watchedByCount / 3, 0, 1);
  return clamp(freshness * 0.7 + breadth * 0.3, 0, 1);
}

/**
 * X (Twitter) -piirre: tuoreen, seuratulta tililta tulleen kryptomaininnan
 * (tarkka tokenin ticker tai geneerinen kryptomaininta) voimakkuus.
 * Vanhenee nopeammin kuin copy-trade (~1h) - twiitin vaikutus markkinaan on
 * tyypillisesti hyvin lyhytaikainen.
 */
function twitterScore(info?: TwitterSignalInfo): number {
  if (!info) return 0;
  return clamp(1 - info.minMinutesAgo / 60, 0, 1);
}

export function computeFeatures(pair: TokenPair, copyTrade?: CopyTradeInfo, twitter?: TwitterSignalInfo): FeatureVector {
  const liq = Math.max(pair.liquidity.usd, 1);
  return {
    momentum5m: clamp(pair.priceChange.m5 / 100, -1, 3),
    momentum1h: clamp(pair.priceChange.h1 / 100, -1, 3),
    volLiquidityRatio: clamp(pair.volume.h1 / liq, 0, 10),
    buySellRatio5m: buySellRatio(pair.txns.m5.buys, pair.txns.m5.sells),
    buySellRatio1h: buySellRatio(pair.txns.h1.buys, pair.txns.h1.sells),
    liquidityUsd: pair.liquidity.usd,
    ageMinutes: pairAgeMinutes(pair),
    copyTradeSignal: copyTradeScore(copyTrade),
    twitterSignal: twitterScore(twitter),
  };
}

/**
 * Muuntaa piirrevektorin kiintean mittaiseksi numerovektoriksi oppivalle
 * mallille (mukana bias-termi indeksissa 0). Raaka likviditeetti ja ika
 * kaytetaan muualla kovina suodattimina (riskManager), joten tassa niista
 * otetaan vain skaalattu, saturoituva signaali.
 */
export function toModelInput(f: FeatureVector): number[] {
  return [
    1, // bias
    f.momentum5m,
    f.momentum1h,
    Math.tanh(f.volLiquidityRatio / 3),
    f.buySellRatio5m,
    f.buySellRatio1h,
    Math.tanh(f.ageMinutes / 720), // ~puoli paivaa -> saturoituu lahella 1:ta
    f.copyTradeSignal,
    f.twitterSignal,
  ];
}

export const MODEL_INPUT_LABELS = [
  "bias",
  "momentum_5m",
  "momentum_1h",
  "volyymi/likviditeetti",
  "osto/myynti_5m",
  "osto/myynti_1h",
  "ika",
  "copy-trade",
  "twitter/X",
];
