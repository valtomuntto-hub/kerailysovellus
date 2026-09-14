import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

// Kaytetaan Node.js:n SISAANRAKENNETTUA SQLite-tukea (node:sqlite) eika
// better-sqlite3-riippuvuutta: better-sqlite3 on natiivi C++-moduuli joka
// pitaa kaantaa asennuksen yhteydessa, mika vaatii Visual Studio Build
// Tools -tyokalut Windowsilla (tai vastaavat Mac/Linuxilla) jos valmista
// esikaannettya versiota ei loydy kaytossa olevalle Node-versiolle.
// node:sqlite on mukana Node itsessaan (Node 22.5+), joten taalla ei ole
// mitaan kaannettavaa - toimii samalla tavalla joka koneella.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "trader.db"));
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint TEXT NOT NULL,
  symbol TEXT NOT NULL,
  entry_price_usd REAL NOT NULL,
  amount_tokens REAL NOT NULL,
  sol_spent REAL NOT NULL,
  entry_timestamp INTEGER NOT NULL,
  ath_price_usd REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  exit_price_usd REAL,
  exit_timestamp INTEGER,
  pnl_sol REAL,
  pnl_pct REAL,
  exit_reason TEXT,
  features_at_entry TEXT,
  score_at_entry REAL
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  mint TEXT NOT NULL,
  symbol TEXT NOT NULL,
  price_usd REAL NOT NULL,
  amount_tokens REAL NOT NULL,
  sol_amount REAL NOT NULL,
  tx_signature TEXT,
  dry_run INTEGER NOT NULL,
  score REAL,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS learner_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  weights TEXT NOT NULL,
  trained_examples INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_sightings (
  wallet TEXT NOT NULL,
  mint TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (wallet, mint)
);

CREATE TABLE IF NOT EXISTS twitter_last_seen (
  handle TEXT PRIMARY KEY,
  last_tweet_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS twitter_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL,
  tweet_id TEXT NOT NULL,
  symbol TEXT,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_stats (
  day TEXT PRIMARY KEY,
  realized_pnl_sol REAL NOT NULL DEFAULT 0,
  trades_count INTEGER NOT NULL DEFAULT 0,
  halted INTEGER NOT NULL DEFAULT 0
);
`);

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export interface Position {
  id: number;
  mint: string;
  symbol: string;
  entryPriceUsd: number;
  amountTokens: number;
  solSpent: number;
  entryTimestamp: number;
  athPriceUsd: number;
  status: "open" | "closed";
  exitPriceUsd?: number;
  exitTimestamp?: number;
  pnlSol?: number;
  pnlPct?: number;
  exitReason?: string;
  featuresAtEntry?: string;
  scoreAtEntry?: number;
}

function mapPosition(row: any): Position {
  return {
    id: row.id,
    mint: row.mint,
    symbol: row.symbol,
    entryPriceUsd: row.entry_price_usd,
    amountTokens: row.amount_tokens,
    solSpent: row.sol_spent,
    entryTimestamp: row.entry_timestamp,
    athPriceUsd: row.ath_price_usd,
    status: row.status,
    exitPriceUsd: row.exit_price_usd ?? undefined,
    exitTimestamp: row.exit_timestamp ?? undefined,
    pnlSol: row.pnl_sol ?? undefined,
    pnlPct: row.pnl_pct ?? undefined,
    exitReason: row.exit_reason ?? undefined,
    featuresAtEntry: row.features_at_entry ?? undefined,
    scoreAtEntry: row.score_at_entry ?? undefined,
  };
}

export function insertOpenPosition(pos: Omit<Position, "id" | "status">): number {
  const stmt = db.prepare(`
    INSERT INTO positions
      (mint, symbol, entry_price_usd, amount_tokens, sol_spent, entry_timestamp, ath_price_usd, status, features_at_entry, score_at_entry)
    VALUES
      (@mint, @symbol, @entryPriceUsd, @amountTokens, @solSpent, @entryTimestamp, @athPriceUsd, 'open', @featuresAtEntry, @scoreAtEntry)
  `);
  const info = stmt.run({ ...pos, featuresAtEntry: pos.featuresAtEntry ?? null, scoreAtEntry: pos.scoreAtEntry ?? null });
  return Number(info.lastInsertRowid);
}

export function getOpenPositions(): Position[] {
  const rows = db.prepare(`SELECT * FROM positions WHERE status = 'open' ORDER BY entry_timestamp DESC`).all();
  return rows.map(mapPosition);
}

export function updatePositionAth(id: number, athPriceUsd: number): void {
  db.prepare(`UPDATE positions SET ath_price_usd = ? WHERE id = ?`).run(athPriceUsd, id);
}

export function closePosition(
  id: number,
  updates: { exitPriceUsd: number; exitTimestamp: number; pnlSol: number; pnlPct: number; exitReason: string }
): void {
  db.prepare(`
    UPDATE positions
    SET status = 'closed', exit_price_usd = @exitPriceUsd, exit_timestamp = @exitTimestamp,
        pnl_sol = @pnlSol, pnl_pct = @pnlPct, exit_reason = @exitReason
    WHERE id = @id
  `).run({ id, ...updates });
}

/**
 * Paperikaupan virtuaalisaldo: aloitussaldo miinus avoimiin positioihin
 * sidottu SOL, plus suljetuista positioista realisoitunut PnL. Ei koske
 * oikeaa lompakkoa - talla botti on testattavissa ilman WALLET_PRIVATE_KEY:ta.
 */
export function getPaperBalanceSol(startingBalanceSol: number): number {
  const open = db.prepare(`SELECT COALESCE(SUM(sol_spent), 0) AS s FROM positions WHERE status = 'open'`).get() as any;
  const closed = db.prepare(`SELECT COALESCE(SUM(pnl_sol), 0) AS s FROM positions WHERE status = 'closed'`).get() as any;
  return startingBalanceSol - open.s + closed.s;
}

export function getClosedPositions(limit = 50): Position[] {
  const rows = db
    .prepare(`SELECT * FROM positions WHERE status = 'closed' ORDER BY exit_timestamp DESC LIMIT ?`)
    .all(limit);
  return rows.map(mapPosition);
}

// ---------------------------------------------------------------------------
// Trades (kaupparivit: yksi per osto/myynti-toimeksianto)
// ---------------------------------------------------------------------------

export interface Trade {
  id?: number;
  timestamp: number;
  type: "buy" | "sell";
  mint: string;
  symbol: string;
  priceUsd: number;
  amountTokens: number;
  solAmount: number;
  txSignature?: string;
  dryRun: boolean;
  score?: number;
  reason?: string;
}

export function insertTrade(trade: Trade): void {
  db.prepare(`
    INSERT INTO trades
      (timestamp, type, mint, symbol, price_usd, amount_tokens, sol_amount, tx_signature, dry_run, score, reason)
    VALUES
      (@timestamp, @type, @mint, @symbol, @priceUsd, @amountTokens, @solAmount, @txSignature, @dryRun, @score, @reason)
  `).run({
    ...trade,
    dryRun: trade.dryRun ? 1 : 0,
    txSignature: trade.txSignature ?? null,
    score: trade.score ?? null,
    reason: trade.reason ?? null,
  });
}

export function getRecentTrades(limit = 50): Trade[] {
  const rows = db.prepare(`SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    type: r.type,
    mint: r.mint,
    symbol: r.symbol,
    priceUsd: r.price_usd,
    amountTokens: r.amount_tokens,
    solAmount: r.sol_amount,
    txSignature: r.tx_signature ?? undefined,
    dryRun: !!r.dry_run,
    score: r.score ?? undefined,
    reason: r.reason ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Oppivan mallin tila (jotta oppiminen sailyy botin uudelleenkaynnistysten yli)
// ---------------------------------------------------------------------------

export interface LearnerState {
  weights: number[];
  trainedExamples: number;
  updatedAt: number;
}

export function loadLearnerState(): LearnerState | undefined {
  const row = db.prepare(`SELECT * FROM learner_state WHERE id = 1`).get() as any;
  if (!row) return undefined;
  return { weights: JSON.parse(row.weights), trainedExamples: row.trained_examples, updatedAt: row.updated_at };
}

export function saveLearnerState(state: LearnerState): void {
  db.prepare(`
    INSERT INTO learner_state (id, weights, trained_examples, updated_at) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      weights = excluded.weights,
      trained_examples = excluded.trained_examples,
      updated_at = excluded.updated_at
  `).run(JSON.stringify(state.weights), state.trainedExamples, state.updatedAt);
}

// ---------------------------------------------------------------------------
// Seurattujen lompakoiden havainnot (copy-trade-signaali)
// ---------------------------------------------------------------------------

export interface CopyTradeInfo {
  watchedByCount: number;
  minFirstSeenMinutesAgo: number;
}

/**
 * Paivittaa lompakkohavainnot nykyhetkeen ja palauttaa per-mint yhteenvedon
 * oppivaa mallia varten: kuinka moni seurattu lompakko pitaa tokenia
 * hallussaan juuri nyt, ja kuinka kauan aikaa sitten aikaisin naista
 * havaittiin ensimmaisen kerran pitamassa sita (tuoreus-signaali).
 *
 * Jos lompakko ei enaa pida jotain aiemmin havaittua tokenia (myyty), sen
 * havainto poistetaan - jos sama lompakko ostaa saman tokenin uudelleen
 * myohemmin, se lasketaan taas "tuoreeksi" havainnoksi.
 */
export function syncWalletSightingsAndGetSignals(holdingsByWallet: Map<string, string[]>): Map<string, CopyTradeInfo> {
  const now = Date.now();
  const selectStmt = db.prepare(`SELECT first_seen FROM wallet_sightings WHERE wallet = ? AND mint = ?`);
  const insertStmt = db.prepare(`INSERT INTO wallet_sightings (wallet, mint, first_seen, last_seen) VALUES (?, ?, ?, ?)`);
  const updateStmt = db.prepare(`UPDATE wallet_sightings SET last_seen = ? WHERE wallet = ? AND mint = ?`);
  const prevMintsForWallet = db.prepare(`SELECT mint FROM wallet_sightings WHERE wallet = ?`);
  const deleteStmt = db.prepare(`DELETE FROM wallet_sightings WHERE wallet = ? AND mint = ?`);

  const byMint = new Map<string, { count: number; earliestFirstSeen: number }>();

  for (const [wallet, mints] of holdingsByWallet) {
    const currentSet = new Set(mints);

    // Siivoa pois tokenit joita lompakko ei enaa pida hallussaan.
    const prevRows = prevMintsForWallet.all(wallet) as any[];
    for (const row of prevRows) {
      if (!currentSet.has(row.mint)) deleteStmt.run(wallet, row.mint);
    }

    for (const mint of mints) {
      const existing = selectStmt.get(wallet, mint) as any;
      let firstSeen: number;
      if (existing) {
        firstSeen = existing.first_seen;
        updateStmt.run(now, wallet, mint);
      } else {
        firstSeen = now;
        insertStmt.run(wallet, mint, now, now);
      }

      const agg = byMint.get(mint);
      if (!agg) byMint.set(mint, { count: 1, earliestFirstSeen: firstSeen });
      else {
        agg.count += 1;
        agg.earliestFirstSeen = Math.min(agg.earliestFirstSeen, firstSeen);
      }
    }
  }

  const result = new Map<string, CopyTradeInfo>();
  for (const [mint, v] of byMint) {
    result.set(mint, { watchedByCount: v.count, minFirstSeenMinutesAgo: (now - v.earliestFirstSeen) / 60_000 });
  }
  return result;
}

// ---------------------------------------------------------------------------
// X (Twitter) -signaali
// ---------------------------------------------------------------------------

export function getTwitterLastSeenIds(): Map<string, string> {
  const rows = db.prepare(`SELECT handle, last_tweet_id FROM twitter_last_seen`).all() as any[];
  return new Map(rows.map((r) => [r.handle, r.last_tweet_id]));
}

export function setTwitterLastSeen(handle: string, tweetId: string): void {
  db.prepare(`
    INSERT INTO twitter_last_seen (handle, last_tweet_id) VALUES (?, ?)
    ON CONFLICT(handle) DO UPDATE SET last_tweet_id = excluded.last_tweet_id
  `).run(handle, tweetId);
}

/** symbol=null tallentaa "geneerisen" kryptomaininnan (koskee kaikkia ehdokkaita). */
export function insertTwitterSignal(handle: string, tweetId: string, symbol: string | null, timestamp: number): void {
  db.prepare(`INSERT INTO twitter_signals (handle, tweet_id, symbol, timestamp) VALUES (?, ?, ?, ?)`).run(
    handle,
    tweetId,
    symbol,
    timestamp
  );
}

export interface TwitterSignalInfo {
  minMinutesAgo: number;
  handle: string;
}

/**
 * Tuorein relevantti twiitti annetulle symbolille (tarkka osuma) TAI
 * geneerinen kryptomaininta (symbol IS NULL, koskee kaikkia), tietyn
 * aikaikkunan sisalla. Palauttaa undefined jos ei osumia.
 */
export function getTwitterSignalForSymbol(symbol: string, windowMinutes = 60): TwitterSignalInfo | undefined {
  const cutoff = Date.now() - windowMinutes * 60_000;
  const row = db
    .prepare(
      `SELECT handle, timestamp FROM twitter_signals
       WHERE timestamp >= ? AND (symbol = ? OR symbol IS NULL)
       ORDER BY timestamp DESC LIMIT 1`
    )
    .get(cutoff, symbol.toUpperCase()) as any;
  if (!row) return undefined;
  return { minMinutesAgo: (Date.now() - row.timestamp) / 60_000, handle: row.handle };
}

// ---------------------------------------------------------------------------
// Paivan tilastot / riskin "sulake" (MAX_DAILY_LOSS_SOL)
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureTodayRow(): void {
  db.prepare(`INSERT OR IGNORE INTO daily_stats (day, realized_pnl_sol, trades_count, halted) VALUES (?, 0, 0, 0)`).run(
    today()
  );
}

export function getTodayStats(): { realizedPnlSol: number; tradesCount: number; halted: boolean } {
  ensureTodayRow();
  const row = db.prepare(`SELECT * FROM daily_stats WHERE day = ?`).get(today()) as any;
  return { realizedPnlSol: row.realized_pnl_sol, tradesCount: row.trades_count, halted: !!row.halted };
}

export function addRealizedPnl(amountSol: number): void {
  ensureTodayRow();
  db.prepare(`UPDATE daily_stats SET realized_pnl_sol = realized_pnl_sol + ?, trades_count = trades_count + 1 WHERE day = ?`).run(
    amountSol,
    today()
  );
}

export function setHaltedToday(halted: boolean): void {
  ensureTodayRow();
  db.prepare(`UPDATE daily_stats SET halted = ? WHERE day = ?`).run(halted ? 1 : 0, today());
}
