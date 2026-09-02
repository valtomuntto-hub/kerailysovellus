import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FEATURE_COUNT, OnlineLearner } from "./learner.js";

describe("OnlineLearner", () => {
  it("kayttaa oletuspainoja kun tallennettua tilaa ei ole", () => {
    const learner = new OnlineLearner();
    assert.equal(learner.weights.length, FEATURE_COUNT);
    assert.equal(learner.trainedExamples, 0);
  });

  it("score() palauttaa aina arvon valilta (0, 1)", () => {
    const learner = new OnlineLearner();
    const score = learner.score(new Array(FEATURE_COUNT).fill(0.3));
    assert.ok(score > 0 && score < 1, `pisteiden pitaisi olla 0-1 valilla, saatiin ${score}`);
  });

  it("oppii nostamaan pisteita kun samasta syotteesta toistuu voitollinen tulos", () => {
    const learner = new OnlineLearner();
    const input = new Array(FEATURE_COUNT).fill(1);
    const before = learner.score(input);
    for (let i = 0; i < 50; i++) learner.update(input, 1);
    const after = learner.score(input);
    assert.ok(after > before, `pisteiden pitaisi nousta opetuksesta (${before} -> ${after})`);
    assert.ok(after > 0.9, "toistuvan voitollisen signaalin pisteiden pitaisi lahestya 1:ta");
  });

  it("oppii laskemaan pisteita kun samasta syotteesta toistuu tappiollinen tulos", () => {
    const learner = new OnlineLearner();
    const input = new Array(FEATURE_COUNT).fill(1);
    for (let i = 0; i < 50; i++) learner.update(input, 0);
    const after = learner.score(input);
    assert.ok(after < 0.1, `toistuvan tappiollisen signaalin pisteiden pitaisi lahestya 0:aa, saatiin ${after}`);
  });

  it("kasvattaa trainedExamples-laskuria jokaisella update()-kutsulla", () => {
    const learner = new OnlineLearner();
    const zeroInput = new Array(FEATURE_COUNT).fill(0);
    learner.update(zeroInput, 1);
    learner.update(zeroInput, 0);
    assert.equal(learner.trainedExamples, 2);
  });

  it("nollaa painot jos tallennetun tilan piirremaara ei tasmaa nykyiseen malliin", () => {
    const staleState = { weights: [0.1, 0.2, 0.3], trainedExamples: 42, updatedAt: Date.now() };
    const learner = new OnlineLearner(staleState);
    assert.equal(learner.weights.length, FEATURE_COUNT);
    assert.equal(learner.trainedExamples, 0, "vanhentunut esimerkkilaskuri ei saa periytya");
  });

  it("lataa tallennetun tilan sellaisenaan kun piirremaara tasmaa", () => {
    const state = { weights: new Array(FEATURE_COUNT).fill(0.42), trainedExamples: 7, updatedAt: Date.now() };
    const learner = new OnlineLearner(state);
    assert.deepEqual(learner.weights, state.weights);
    assert.equal(learner.trainedExamples, 7);
  });

  it("getState() palauttaa kopion, ei viittausta sisaiseen painotaulukkoon", () => {
    const learner = new OnlineLearner();
    const state = learner.getState();
    state.weights[0] = 999;
    assert.notEqual(learner.weights[0], 999);
  });
});
