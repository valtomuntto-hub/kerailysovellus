import { config } from "../config.js";
import { logger } from "../logger.js";
import { dedupeBestPairPerToken, fetchBoostedTokenAddresses, fetchPairsForTokenAddresses } from "./dexscreener.js";
import type { TokenPair } from "../types.js";

/** Kandidaattijoukko: talla hetkella trendaavat/boostatut tokenit valitulla ketjulla. */
export async function getCandidateUniverse(): Promise<TokenPair[]> {
  const addrs = await fetchBoostedTokenAddresses(config.DEXSCREENER_CHAIN);
  if (addrs.length === 0) {
    logger.warn("DexScreener ei palauttanut ehdokastokeneita talla kierroksella.");
    return [];
  }
  const pairs = await fetchPairsForTokenAddresses(addrs, config.DEXSCREENER_CHAIN);
  return dedupeBestPairPerToken(pairs);
}
