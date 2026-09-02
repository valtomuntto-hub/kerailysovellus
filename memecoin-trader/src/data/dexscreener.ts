import { logger } from "../logger.js";
import type { TokenPair } from "../types.js";

const BASE = "https://api.dexscreener.com";

async function safeFetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      logger.warn(`DexScreener vastasi ${res.status}: ${url}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.warn("DexScreener-haku epaonnistui", url, err);
    return null;
  }
}

/** Hakee talla hetkella "boostatut" (trendaavat) token-osoitteet halutulta ketjulta. */
export async function fetchBoostedTokenAddresses(chain: string): Promise<string[]> {
  const [latest, top] = await Promise.all([
    safeFetchJson(`${BASE}/token-boosts/latest/v1`),
    safeFetchJson(`${BASE}/token-boosts/top/v1`),
  ]);
  const all = [...(Array.isArray(latest) ? latest : []), ...(Array.isArray(top) ? top : [])];
  const addrs = all
    .filter((t: any) => t?.chainId === chain && typeof t?.tokenAddress === "string")
    .map((t: any) => t.tokenAddress as string);
  return Array.from(new Set(addrs));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function mapPair(p: any): TokenPair {
  return {
    pairAddress: p.pairAddress,
    baseToken: {
      address: p.baseToken?.address ?? "",
      name: p.baseToken?.name ?? "",
      symbol: p.baseToken?.symbol ?? "?",
    },
    priceUsd: Number(p.priceUsd ?? 0),
    priceChange: {
      m5: Number(p.priceChange?.m5 ?? 0),
      h1: Number(p.priceChange?.h1 ?? 0),
      h6: Number(p.priceChange?.h6 ?? 0),
      h24: Number(p.priceChange?.h24 ?? 0),
    },
    volume: {
      m5: Number(p.volume?.m5 ?? 0),
      h1: Number(p.volume?.h1 ?? 0),
      h6: Number(p.volume?.h6 ?? 0),
      h24: Number(p.volume?.h24 ?? 0),
    },
    liquidity: { usd: Number(p.liquidity?.usd ?? 0) },
    txns: {
      m5: { buys: Number(p.txns?.m5?.buys ?? 0), sells: Number(p.txns?.m5?.sells ?? 0) },
      h1: { buys: Number(p.txns?.h1?.buys ?? 0), sells: Number(p.txns?.h1?.sells ?? 0) },
    },
    fdv: p.fdv !== undefined ? Number(p.fdv) : undefined,
    pairCreatedAt: p.pairCreatedAt !== undefined ? Number(p.pairCreatedAt) : undefined,
  };
}

/** Hakee kaupankaynti-parit annetuille token-osoitteille (max 30/era, DexScreenerin rajoitus). */
export async function fetchPairsForTokenAddresses(addresses: string[], chain: string): Promise<TokenPair[]> {
  if (addresses.length === 0) return [];
  const results: TokenPair[] = [];
  for (const batch of chunk(addresses, 30)) {
    const data = await safeFetchJson(`${BASE}/latest/dex/tokens/${batch.join(",")}`);
    const pairs: any[] = data?.pairs ?? [];
    for (const p of pairs) {
      if (p.chainId !== chain) continue;
      results.push(mapPair(p));
    }
  }
  return results;
}

/** Jos samalle tokenille loytyy useita pooleja, valitaan likvidein. */
export function dedupeBestPairPerToken(pairs: TokenPair[]): TokenPair[] {
  const byToken = new Map<string, TokenPair>();
  for (const p of pairs) {
    const key = p.baseToken.address;
    const existing = byToken.get(key);
    if (!existing || p.liquidity.usd > existing.liquidity.usd) byToken.set(key, p);
  }
  return Array.from(byToken.values());
}

/** Katevyysfunktio: hakee ja duplikaatinpoistaa parit suoraan mint-osoite -> pari -kartaksi. */
export async function fetchPairsForMints(mints: string[], chain: string): Promise<Map<string, TokenPair>> {
  const pairs = await fetchPairsForTokenAddresses(mints, chain);
  const best = dedupeBestPairPerToken(pairs);
  const map = new Map<string, TokenPair>();
  for (const p of best) map.set(p.baseToken.address, p);
  return map;
}

/**
 * Parin ika minuutteina. Jos DexScreener ei raportoi luontiaikaa, palautetaan 0
 * (eli "juuri syntynyt") - epavarmassa tilanteessa suositaan varovaisuutta,
 * jotta ika-suodatin ei paasta lapi tuntemattoman ikaisia riskitokeneita.
 */
export function pairAgeMinutes(pair: TokenPair): number {
  return pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 60_000 : 0;
}
