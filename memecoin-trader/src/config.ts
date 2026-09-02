import "dotenv/config";
import { z } from "zod";

const boolFromString = z
  .string()
  .default("false")
  .transform((v) => v.trim().toLowerCase() === "true");

const schema = z.object({
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  WALLET_PRIVATE_KEY: z.string().default(""),
  LIVE_TRADING: boolFromString,

  // Virtuaalisalkun aloitussaldo paperikaupassa (LIVE_TRADING=false) - ei koske
  // oikeaa lompakkoa, joten paperikauppaa voi testata ilman WALLET_PRIVATE_KEY:ta.
  PAPER_STARTING_BALANCE_SOL: z.coerce.number().positive().default(1),

  MAX_POSITION_SOL: z.coerce.number().positive().default(0.05),
  MAX_CONCURRENT_POSITIONS: z.coerce.number().int().positive().default(3),
  MAX_DAILY_LOSS_SOL: z.coerce.number().positive().default(0.2),
  TAKE_PROFIT_PCT: z.coerce.number().positive().default(40),
  STOP_LOSS_PCT: z.coerce.number().positive().default(15),
  TRAILING_STOP_PCT: z.coerce.number().positive().default(10),
  MAX_HOLD_MINUTES: z.coerce.number().positive().default(180),
  MIN_LIQUIDITY_USD: z.coerce.number().nonnegative().default(15000),
  MIN_PAIR_AGE_MINUTES: z.coerce.number().nonnegative().default(10),
  MAX_SLIPPAGE_BPS: z.coerce.number().int().positive().default(300),
  BUY_SCORE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.62),
  SELL_SCORE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.35),

  SCAN_INTERVAL_SECONDS: z.coerce.number().positive().default(45),
  DEXSCREENER_CHAIN: z.string().default("solana"),

  // Pilkulla erotettu lista Solana-lompakko-osoitteita joita seurataan
  // copy-trade-signaalia varten. Tyhjana (oletus) ominaisuus ei tee mitaan.
  WATCHED_WALLETS: z.string().default(""),

  // X (Twitter) -signaali: valinnainen, tyhjana pois paalta. Vaatii oman
  // X-kehittajatilin ja Bearer-tokenin (developer.x.com, "pay-per-use" -
  // hinnoittelu, ei enaa pakollista kk-tilausta). Katso README.
  TWITTER_BEARER_TOKEN: z.string().default(""),
  // Pilkulla erotettu lista kayttajatunnuksia (ilman @) joita seurataan.
  TWITTER_WATCHED_HANDLES: z.string().default(""),
  // Kuinka usein X:aa saa kysella - pidetaan harvempana kuin markkina-
  // skannaus, koska jokainen kysely maksaa oikeaa rahaa.
  TWITTER_POLL_INTERVAL_SECONDS: z.coerce.number().positive().default(120),

  PORT: z.coerce.number().positive().default(3300),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Virheelliset asetukset .env-tiedostossa:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
