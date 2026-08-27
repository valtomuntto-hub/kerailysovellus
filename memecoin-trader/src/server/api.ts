import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { logger } from "../logger.js";
import * as db from "../persistence/db.js";
import { getSolBalance } from "../wallet.js";
import { fetchPairsForMints } from "../data/dexscreener.js";
import type { TradeEngine } from "../execution/tradeEngine.js";
import { MODEL_INPUT_LABELS } from "../strategy/features.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../../public");

/** Kevyt read-only dashboard-API + staattisten tiedostojen tarjoilu. */
export function startServer(engine: TradeEngine): void {
  const app = express();
  app.use(express.static(publicDir));

  app.get("/api/status", async (_req, res) => {
    const today = db.getTodayStats();
    let solBalance: number | null = null;
    try {
      solBalance = await getSolBalance();
    } catch {
      // Lompakkoa ei ole asetettu (esim. pelkkaa paperikauppaa ajetaan ilman avainta).
    }
    res.json({
      liveTrading: config.LIVE_TRADING,
      solBalance,
      today,
      config: {
        maxPositionSol: config.MAX_POSITION_SOL,
        maxConcurrentPositions: config.MAX_CONCURRENT_POSITIONS,
        maxDailyLossSol: config.MAX_DAILY_LOSS_SOL,
        takeProfitPct: config.TAKE_PROFIT_PCT,
        stopLossPct: config.STOP_LOSS_PCT,
      },
      learner: {
        trainedExamples: engine.learner.trainedExamples,
        weights: engine.learner.weights,
        weightLabels: MODEL_INPUT_LABELS,
      },
    });
  });

  app.get("/api/positions", async (_req, res) => {
    const open = db.getOpenPositions();
    const priceMap = await fetchPairsForMints(open.map((p) => p.mint), config.DEXSCREENER_CHAIN).catch(() => new Map());
    const openWithPnl = open.map((p) => {
      const currentPriceUsd = priceMap.get(p.mint)?.priceUsd ?? null;
      const pnlPct = currentPriceUsd ? ((currentPriceUsd - p.entryPriceUsd) / p.entryPriceUsd) * 100 : null;
      return { ...p, currentPriceUsd, pnlPct };
    });
    res.json({ open: openWithPnl, closed: db.getClosedPositions(50) });
  });

  app.get("/api/trades", (_req, res) => {
    res.json(db.getRecentTrades(100));
  });

  app.listen(config.PORT, () => {
    logger.info(`Dashboard kaynnissa: http://localhost:${config.PORT}`);
  });
}
