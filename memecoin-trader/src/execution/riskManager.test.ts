import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// config.ts lukee process.env:in tuontihetkella (dotenv ei ylikirjoita jo
// asetettuja muuttujia), joten asetamme testiarvot ENNEN riskManagerin
// (ja sen mukana config.ts:n) dynaamista tuontia - talla varmistetaan etta
// testit ovat deterministisia riippumatta siita onko projektissa .env-tiedostoa.
describe("riskManager", () => {
  let riskManager: typeof import("./riskManager.js");

  before(async () => {
    process.env.MIN_LIQUIDITY_USD = "10000";
    process.env.MIN_PAIR_AGE_MINUTES = "15";
    process.env.MAX_POSITION_SOL = "0.05";
    riskManager = await import("./riskManager.js");
  });

  describe("passesMarketFilters", () => {
    it("hylkaa liian pienen likviditeetin", () => {
      const result = riskManager.passesMarketFilters(5000, 60);
      assert.equal(result.ok, false);
      assert.match(result.reason ?? "", /likviditeet/);
    });

    it("hylkaa liian tuoreen parin", () => {
      const result = riskManager.passesMarketFilters(20_000, 5);
      assert.equal(result.ok, false);
      assert.match(result.reason ?? "", /uusi/);
    });

    it("hyvaksyy parin joka tayttaa molemmat rajat", () => {
      const result = riskManager.passesMarketFilters(20_000, 60);
      assert.equal(result.ok, true);
    });

    it("rajat ovat mukaan lukevia (>= likviditeetti, >= ika)", () => {
      assert.equal(riskManager.passesMarketFilters(10_000, 15).ok, true);
    });
  });

  describe("positionSizeSol", () => {
    it("rajaa position koon MAX_POSITION_SOL-kattoon kun saldoa on runsaasti", () => {
      assert.equal(riskManager.positionSizeSol(10), 0.05);
    });

    it("varaa gas-kuluihin eika koskaan ehdota koko saldoa", () => {
      const size = riskManager.positionSizeSol(0.03);
      assert.ok(size < 0.03);
      assert.ok(size > 0);
    });

    it("palauttaa 0 kun saldo ei riita edes gas-varaukseen", () => {
      assert.equal(riskManager.positionSizeSol(0.01), 0);
    });

    it("ei koskaan palauta negatiivista arvoa nollasaldolla", () => {
      assert.equal(riskManager.positionSizeSol(0), 0);
    });
  });
});
