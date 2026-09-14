import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { getSolBalance } from "../wallet.js";
import { fetchPairsForMints, pairAgeMinutes } from "../data/dexscreener.js";
import { getCandidateUniverse } from "../data/tokenUniverse.js";
import { fetchWatchedWalletHoldings, parseWatchedWallets } from "../data/walletTracker.js";
import { fetchNewRelevantTweets, isEnabled as isTwitterEnabled } from "../data/twitterSignal.js";
import { computeFeatures, toModelInput } from "../strategy/features.js";
import { OnlineLearner } from "../strategy/learner.js";
import { checkTokenSafety } from "../safety/tokenSafety.js";
import { executeSwap, getQuote, SOL_MINT } from "./jupiter.js";
import * as riskManager from "./riskManager.js";
import * as db from "../persistence/db.js";
import type { TokenPair } from "../types.js";

/**
 * Botin paasilmukka: hoitaa avoimet positiot (myyntipaatokset) ja etsii
 * uusia ostomahdollisuuksia joka kierroksella. Kaikki paatokset kulkevat
 * riskManagerin ja turvatarkistusten kautta ennenkuin mitaan kaupataan.
 */
export class TradeEngine {
  learner: OnlineLearner;
  private currentSolUsd = 150; // fallback-arvo, paivitetaan joka kierroksella
  private copyTradeSignals = new Map<string, db.CopyTradeInfo>();
  private lastTwitterPollMs = 0;

  constructor() {
    this.learner = new OnlineLearner(db.loadLearnerState());
  }

  async tick(): Promise<void> {
    logger.info("--- Uusi tarkistuskierros ---");
    try {
      this.currentSolUsd = await this.fetchSolUsdPrice();
      this.copyTradeSignals = await this.refreshCopyTradeSignals();
      await this.pollTwitterIfDue();
      await this.manageOpenPositions();
      await this.scanForEntries();
    } catch (err) {
      logger.error("Virhe tarkistuskierroksella", err);
    }
  }

  /** Paivittaa seurattujen lompakoiden (WATCHED_WALLETS) hallussapidon ja palauttaa per-mint copy-trade-signaalin. */
  private async refreshCopyTradeSignals(): Promise<Map<string, db.CopyTradeInfo>> {
    if (parseWatchedWallets().length === 0) return new Map();
    try {
      const holdings = await fetchWatchedWalletHoldings();
      return db.syncWalletSightingsAndGetSignals(holdings);
    } catch (err) {
      logger.warn("Seurattujen lompakoiden haku epaonnistui talla kierroksella", err);
      return this.copyTradeSignals; // pidetaan edellinen tunnettu tila mieluummin kuin nollataan
    }
  }

  /**
   * Kyselee X:aa vain harvakseltaan (TWITTER_POLL_INTERVAL_SECONDS) - jokainen
   * kysely maksaa oikeaa rahaa, joten tata ei tehda joka 45s-kierroksella.
   */
  private async pollTwitterIfDue(): Promise<void> {
    if (!isTwitterEnabled()) return;
    const elapsedMs = Date.now() - this.lastTwitterPollMs;
    if (elapsedMs < config.TWITTER_POLL_INTERVAL_SECONDS * 1000) return;
    this.lastTwitterPollMs = Date.now();

    try {
      const sinceIds = db.getTwitterLastSeenIds();
      const { relevant, latestSeenIds } = await fetchNewRelevantTweets(sinceIds);

      for (const tweet of relevant) {
        if (tweet.mentionedSymbols.length > 0) {
          for (const symbol of tweet.mentionedSymbols) {
            db.insertTwitterSignal(tweet.handle, tweet.tweetId, symbol, tweet.createdAt);
          }
        } else if (tweet.genericCryptoMention) {
          db.insertTwitterSignal(tweet.handle, tweet.tweetId, null, tweet.createdAt);
        }
        logger.info(
          `X-signaali: @${tweet.handle} mainitsi ${tweet.mentionedSymbols.length > 0 ? tweet.mentionedSymbols.join(", ") : "kryptoa yleisesti"}`
        );
      }

      // Aina eteenpain viimeksi NAHTYYN (ei vain relevanttiin) - ei osteta samoja epaolennaisia twiitteja uudelleen.
      for (const [handle, tweetId] of latestSeenIds) {
        db.setTwitterLastSeen(handle, tweetId);
      }
    } catch (err) {
      logger.warn("X:n kysely epaonnistui talla kierroksella", err);
    }
  }

  // -------------------------------------------------------------------
  // Avoimien positioiden hallinta (myynti-logiikka)
  // -------------------------------------------------------------------

  private async manageOpenPositions(): Promise<void> {
    const open = db.getOpenPositions();
    if (open.length === 0) return;

    const priceMap = await fetchPairsForMints(open.map((p) => p.mint), config.DEXSCREENER_CHAIN);

    for (const pos of open) {
      const pair = priceMap.get(pos.mint);
      if (!pair || pair.priceUsd <= 0) {
        logger.warn(`Ei hintadataa positiolle ${pos.symbol} (${pos.mint}) - ohitetaan talla kierroksella.`);
        continue;
      }

      if (pair.priceUsd > pos.athPriceUsd) {
        db.updatePositionAth(pos.id, pair.priceUsd);
        pos.athPriceUsd = pair.priceUsd;
      }

      const pnlPct = ((pair.priceUsd - pos.entryPriceUsd) / pos.entryPriceUsd) * 100;
      const drawdownFromAthPct = ((pair.priceUsd - pos.athPriceUsd) / pos.athPriceUsd) * 100;
      const heldMinutes = (Date.now() - pos.entryTimestamp) / 60_000;

      let exitReason: string | null = null;
      if (pnlPct >= config.TAKE_PROFIT_PCT) {
        exitReason = `take-profit (${pnlPct.toFixed(1)}%)`;
      } else if (pnlPct <= -config.STOP_LOSS_PCT) {
        exitReason = `stop-loss (${pnlPct.toFixed(1)}%)`;
      } else if (drawdownFromAthPct <= -config.TRAILING_STOP_PCT) {
        exitReason = `trailing-stop (${drawdownFromAthPct.toFixed(1)}% ATH:sta)`;
      } else if (heldMinutes >= config.MAX_HOLD_MINUTES) {
        exitReason = `max hold time (${heldMinutes.toFixed(0)} min)`;
      } else {
        const twitterSignal = db.getTwitterSignalForSymbol(pos.symbol);
        const features = computeFeatures(pair, this.copyTradeSignals.get(pos.mint), twitterSignal);
        const score = this.learner.score(toModelInput(features));
        if (score < config.SELL_SCORE_THRESHOLD) {
          exitReason = `mallin pisteet laskivat (${score.toFixed(2)})`;
        }
      }

      if (exitReason) {
        await this.closePosition(pos, pair, exitReason);
      }
    }
  }

  private async closePosition(pos: db.Position, pair: TokenPair, reason: string): Promise<void> {
    let signature: string | undefined;
    let solReceived = (pos.amountTokens * pair.priceUsd) / this.currentSolUsd;

    if (config.LIVE_TRADING) {
      const quote = await getQuote(pos.mint, SOL_MINT, Math.floor(pos.amountTokens));
      if (!quote) {
        logger.error(`Ei saatu myyntitarjousta ${pos.symbol}:lle, yritetaan seuraavalla kierroksella.`);
        return;
      }
      const sig = await executeSwap(quote);
      if (!sig) {
        logger.error(`Myynti epaonnistui ${pos.symbol}:lle, yritetaan seuraavalla kierroksella.`);
        return;
      }
      signature = sig;
      solReceived = Number(quote.outAmount) / LAMPORTS_PER_SOL;
    }

    const pnlSol = solReceived - pos.solSpent;
    const pnlPct = (pnlSol / pos.solSpent) * 100;

    db.closePosition(pos.id, {
      exitPriceUsd: pair.priceUsd,
      exitTimestamp: Date.now(),
      pnlSol,
      pnlPct,
      exitReason: reason,
    });
    db.insertTrade({
      timestamp: Date.now(),
      type: "sell",
      mint: pos.mint,
      symbol: pos.symbol,
      priceUsd: pair.priceUsd,
      amountTokens: pos.amountTokens,
      solAmount: solReceived,
      txSignature: signature,
      dryRun: !config.LIVE_TRADING,
      reason,
    });
    db.addRealizedPnl(pnlSol);

    // Opeta mallia toteutuneesta tuloksesta - tassa botti oikeasti "oppii".
    if (pos.featuresAtEntry) {
      const input = JSON.parse(pos.featuresAtEntry) as number[];
      this.learner.update(input, pnlSol > 0 ? 1 : 0);
      db.saveLearnerState(this.learner.getState());
    }

    logger.trade(
      `MYYTY ${pos.symbol}: ${reason}, PnL ${pnlSol.toFixed(4)} SOL (${pnlPct.toFixed(1)}%)` +
        (config.LIVE_TRADING ? "" : " [SIMULAATIO]")
    );
  }

  // -------------------------------------------------------------------
  // Uusien positioiden etsinta (osto-logiikka)
  // -------------------------------------------------------------------

  private async scanForEntries(): Promise<void> {
    if (!riskManager.canOpenNewPosition()) return;

    const universe = await getCandidateUniverse();
    if (universe.length === 0) return;

    const alreadyOpen = new Set(db.getOpenPositions().map((p) => p.mint));
    const solBalance = config.LIVE_TRADING
      ? await getSolBalance().catch(() => 0)
      : db.getPaperBalanceSol(config.PAPER_STARTING_BALANCE_SOL);
    const positionSize = riskManager.positionSizeSol(solBalance);
    if (positionSize <= 0) {
      logger.warn("SOL-saldo liian pieni uuden position avaamiseen.");
      return;
    }

    const candidates = universe
      .filter((p) => p.baseToken.address && !alreadyOpen.has(p.baseToken.address))
      .map((pair) => {
        const ageMinutes = pairAgeMinutes(pair);
        const marketFilter = riskManager.passesMarketFilters(pair.liquidity.usd, ageMinutes);
        const twitterSignal = db.getTwitterSignalForSymbol(pair.baseToken.symbol);
        const features = computeFeatures(pair, this.copyTradeSignals.get(pair.baseToken.address), twitterSignal);
        const input = toModelInput(features);
        const score = this.learner.score(input);
        return { pair, marketFilter, input, score };
      })
      .filter((c) => c.marketFilter.ok && c.score >= config.BUY_SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) return;

    const best = candidates[0];
    const safety = await checkTokenSafety(best.pair.baseToken.address);
    if (!safety.passed) {
      logger.warn(`Ohitetaan ${best.pair.baseToken.symbol}: ${safety.reasons.join(" ")}`);
      return;
    }

    await this.openPosition(best.pair, best.score, best.input, positionSize);
  }

  private async openPosition(pair: TokenPair, score: number, input: number[], solAmount: number): Promise<void> {
    let signature: string | undefined;
    let tokensReceived = (solAmount * this.currentSolUsd) / pair.priceUsd;

    if (config.LIVE_TRADING) {
      const amountLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      const quote = await getQuote(SOL_MINT, pair.baseToken.address, amountLamports);
      if (!quote) {
        logger.warn(`Ei saatu ostotarjousta ${pair.baseToken.symbol}:lle.`);
        return;
      }
      if (quote.priceImpactPct > 5) {
        logger.warn(`Ohitetaan ${pair.baseToken.symbol}: liian suuri hintavaikutus (${quote.priceImpactPct.toFixed(1)}%).`);
        return;
      }
      const sig = await executeSwap(quote);
      if (!sig) {
        logger.error(`Osto epaonnistui ${pair.baseToken.symbol}:lle.`);
        return;
      }
      signature = sig;
      tokensReceived = Number(quote.outAmount);
    }

    const id = db.insertOpenPosition({
      mint: pair.baseToken.address,
      symbol: pair.baseToken.symbol,
      entryPriceUsd: pair.priceUsd,
      amountTokens: tokensReceived,
      solSpent: solAmount,
      entryTimestamp: Date.now(),
      athPriceUsd: pair.priceUsd,
      featuresAtEntry: JSON.stringify(input),
      scoreAtEntry: score,
    });
    db.insertTrade({
      timestamp: Date.now(),
      type: "buy",
      mint: pair.baseToken.address,
      symbol: pair.baseToken.symbol,
      priceUsd: pair.priceUsd,
      amountTokens: tokensReceived,
      solAmount,
      txSignature: signature,
      dryRun: !config.LIVE_TRADING,
      score,
      reason: "malli antoi ostosignaalin",
    });

    logger.trade(
      `OSTETTU ${pair.baseToken.symbol} (pisteet ${score.toFixed(2)}), ${solAmount.toFixed(4)} SOL` +
        (config.LIVE_TRADING ? "" : " [SIMULAATIO]") +
        ` (id=${id})`
    );
  }

  // -------------------------------------------------------------------

  private async fetchSolUsdPrice(): Promise<number> {
    const map = await fetchPairsForMints([SOL_MINT], config.DEXSCREENER_CHAIN);
    const p = map.get(SOL_MINT);
    return p && p.priceUsd > 0 ? p.priceUsd : this.currentSolUsd;
  }
}
