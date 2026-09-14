import { config } from "./config.js";
import { logger } from "./logger.js";
import { getKeypair, getSolBalance } from "./wallet.js";
import { TradeEngine } from "./execution/tradeEngine.js";
import { startServer } from "./server/api.js";

async function main(): Promise<void> {
  logger.info("memecoin-trader kaynnistyy...");
  logger.info(`Tila: ${config.LIVE_TRADING ? "OIKEA RAHA (LIVE)" : "PAPERIKAUPPA (SIMULAATIO)"}`);

  if (config.LIVE_TRADING) {
    const keypair = getKeypair();
    const balance = await getSolBalance();
    logger.warn(`LIVE-KAUPPA ON PAALLA. Lompakko: ${keypair.publicKey.toBase58()}, saldo: ${balance.toFixed(4)} SOL`);
    logger.warn("Botti kayttaa OIKEAA RAHAA seuraavasta kierroksesta alkaen. Paina Ctrl+C 5 sekunnin sisalla jos tama ei ollut tarkoitus.");
    await new Promise((r) => setTimeout(r, 5000));
  } else {
    logger.info("Paperikaupassa ei liikutella oikeaa rahaa. Aseta LIVE_TRADING=true .env:iin kun olet valmis oikeisiin kauppoihin.");
  }

  const engine = new TradeEngine();
  startServer(engine);

  const intervalMs = config.SCAN_INTERVAL_SECONDS * 1000;
  await engine.tick();
  setInterval(() => {
    engine.tick();
  }, intervalMs);
}

main().catch((err) => {
  logger.error("Botti kaatui kaynnistyksessa", err);
  process.exit(1);
});
