import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractSignals } from "./twitterSignal.js";

describe("extractSignals", () => {
  it("poimii $CASHTAGIT isoilla kirjaimilla ilman $-merkkia", () => {
    const { symbols } = extractSignals("Just bought some $doge and $PEPE, huge day");
    assert.deepEqual(symbols.sort(), ["DOGE", "PEPE"]);
  });

  it("tunnistaa geneerisen kryptomaininnan ilman cashtagia", () => {
    const { symbols, genericCryptoMention } = extractSignals("Crypto is going to be huge this year");
    assert.equal(symbols.length, 0);
    assert.equal(genericCryptoMention, true);
  });

  it("palauttaa tyhjan/false jos ei mitaan kryptoon viittaavaa", () => {
    const { symbols, genericCryptoMention } = extractSignals("Nice weather today, going for a walk");
    assert.equal(symbols.length, 0);
    assert.equal(genericCryptoMention, false);
  });

  it("ei poimi pelkkaa numeroa tai liian pitkaa merkkijonoa cashtagiksi", () => {
    const { symbols } = extractSignals("$1 is a price not a ticker, and $abcdefghijklmnopqrstuvwxyz is way too long to be one");
    assert.deepEqual(symbols, []);
  });

  it("poimii lyhimman sallitun 2-kirjaimisen cashtagin", () => {
    const { symbols } = extractSignals("grab some $ab now");
    assert.deepEqual(symbols, ["AB"]);
  });

  it("ei kaadu tyhjalla tekstilla", () => {
    const { symbols, genericCryptoMention } = extractSignals("");
    assert.equal(symbols.length, 0);
    assert.equal(genericCryptoMention, false);
  });
});
