import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "trader.db"));
db.pragma("journal_mode = WAL");

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
