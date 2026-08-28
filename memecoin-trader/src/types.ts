// Yhteiset tyypit koko sovellukselle.

/** Yksi DexScreenerin palauttama kaupankaynti-pari (token/SOL), normalisoituna. */
export interface TokenPair {
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceUsd: number;
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  volume: { m5: number; h1: number; h6: number; h24: number };
  liquidity: { usd: number };
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
  };
  fdv?: number;
  /** Unix-aikaleima millisekunteina, jos DexScreener sen raportoi. */
  pairCreatedAt?: number;
}

/** Ihmisluettava piirrevektori yhdesta token-parista, ennen mallille syottamista. */
export interface FeatureVector {
  momentum5m: number;
  momentum1h: number;
  volLiquidityRatio: number;
  buySellRatio5m: number;
  buySellRatio1h: number;
  liquidityUsd: number;
  ageMinutes: number;
  /** 0-1: kuinka vahva copy-trade-signaali (seurattujen lompakoiden hallussapito). 0 = ei seurantaa/ei havaintoa. */
  copyTradeSignal: number;
}
