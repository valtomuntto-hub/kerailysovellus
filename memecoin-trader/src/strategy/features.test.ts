import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TokenPair } from "../types.js";
import { computeFeatures, MODEL_INPUT_LABELS, toModelInput } from "./features.js";

function makePair(overrides: Partial<TokenPair> = {}): TokenPair {
  return {
    pairAddress: "pair1",
    baseToken: { address: "mint1", name: "Test", symbol: "TST" },
    priceUsd: 0.001,
    priceChange: { m5: 0, h1: 0, h6: 0, h24: 0 },
    volume: { m5: 0, h1: 0, h6: 0, h24: 0 },
    liquidity: { usd: 20_000 },
    txns: { m5: { buys: 0, sells: 0 }, h1: { buys: 0, sells: 0 } },
    pairCreatedAt: Date.now() - 60 * 60_000, // 1h vanha
    ...overrides,
  };
}

describe("computeFeatures", () => {
  it("saannostelee momentumin valille [-1, 3]", () => {
    const f = computeFeatures(makePair({ priceChange: { m5: 500, h1: 50, h6: 0, h24: 0 } }));
    assert.equal(f.momentum5m, 3); // 500 % -> clampataan 3:een
    assert.equal(f.momentum1h, 0.5);
  });

  it("laskee osto/myyntipaineen valille [-1, 1]", () => {
    const f = computeFeatures(makePair({ txns: { m5: { buys: 9, sells: 1 }, h1: { buys: 5, sells: 5 } } }));
    assert.equal(f.buySellRatio5m, 0.8);
    assert.equal(f.buySellRatio1h, 0);
  });

  it("copyTradeSignal on 0 kun copy-trade-tietoa ei anneta", () => {
    const f = computeFeatures(makePair());
    assert.equal(f.copyTradeSignal, 0);
  });

  it("copyTradeSignal on 0 myos kun watchedByCount on 0", () => {
    const f = computeFeatures(makePair(), { watchedByCount: 0, minFirstSeenMinutesAgo: 0 });
    assert.equal(f.copyTradeSignal, 0);
  });

  it("copyTradeSignal on suurempi juuri havaitulle kuin vanhalle havainnolle", () => {
    const fresh = computeFeatures(makePair(), { watchedByCount: 1, minFirstSeenMinutesAgo: 0 });
    const old = computeFeatures(makePair(), { watchedByCount: 1, minFirstSeenMinutesAgo: 200 });
    assert.ok(fresh.copyTradeSignal > old.copyTradeSignal);
  });

  it("copyTradeSignal kasvaa kun useampi seurattu lompakko pitaa samaa tokenia", () => {
    const one = computeFeatures(makePair(), { watchedByCount: 1, minFirstSeenMinutesAgo: 60 });
    const many = computeFeatures(makePair(), { watchedByCount: 3, minFirstSeenMinutesAgo: 60 });
    assert.ok(many.copyTradeSignal > one.copyTradeSignal);
  });

  it("twitterSignal on 0 kun twitter-tietoa ei anneta", () => {
    const f = computeFeatures(makePair());
    assert.equal(f.twitterSignal, 0);
  });

  it("twitterSignal on suurempi juuri twiitatulle kuin vanhalle maininnalle", () => {
    const fresh = computeFeatures(makePair(), undefined, { minMinutesAgo: 0, handle: "someone" });
    const old = computeFeatures(makePair(), undefined, { minMinutesAgo: 55, handle: "someone" });
    assert.ok(fresh.twitterSignal > old.twitterSignal);
  });

  it("twitterSignal haihtuu nollaan tunnin jalkeen", () => {
    const f = computeFeatures(makePair(), undefined, { minMinutesAgo: 120, handle: "someone" });
    assert.equal(f.twitterSignal, 0);
  });
});

describe("toModelInput", () => {
  it("palauttaa vektorin jonka pituus tasmaa MODEL_INPUT_LABELS:iin ja bias on 1", () => {
    const input = toModelInput(computeFeatures(makePair()));
    assert.equal(input.length, MODEL_INPUT_LABELS.length);
    assert.equal(input[0], 1);
  });
});
