import { logger } from "../logger.js";

export const FEATURE_COUNT = 9;
const LEARNING_RATE = 0.05;
const L2_REG = 0.001;

export interface LearnerState {
  weights: number[];
  trainedExamples: number;
  updatedAt: number;
}

/**
 * Hyvin yksinkertainen, mutta AIDOSTI oppiva malli: online-logistinen
 * regressio. `score()` antaa 0-1 -todennakoisyyden sille etta kauppa on
 * kannattava; `update()` paivittaa painot stokastisella gradienttinousulla
 * heti kun positio suljetaan, kayttaen toteutunutta tulosta (voitto/tappio)
 * opetusesimerkkina.
 *
 * Talla ei ole illuusioita "tekoalyn taikuudesta" - se on lineaarinen malli
 * joka soittaa alkupainoista lahtien kohti sita, mika omassa kaupankaynti-
 * historiassa on nayttanyt ennustavan voittoa. Alussa, ennen kuin dataa on
 * kertynyt, se nojaa jarkeviin lahtoarvauksiin (momentum + osto/myyntipaine).
 */
export class OnlineLearner {
  weights: number[];
  trainedExamples: number;

  constructor(initial?: LearnerState) {
    if (initial && initial.weights.length === FEATURE_COUNT) {
      this.weights = [...initial.weights];
      this.trainedExamples = initial.trainedExamples;
    } else {
      if (initial) {
        logger.warn(
          `Tallennettu mallin tila (${initial.weights.length} painoa) ei vastaa nykyista piirremaaraa ` +
            `(${FEATURE_COUNT}) - esim. uusi ominaisuus lisatty. Nollataan mallin painot lahtoarvoihin.`
        );
      }
      this.weights = defaultWeights();
      this.trainedExamples = 0;
    }
  }

  score(input: number[]): number {
    return sigmoid(dot(this.weights, input));
  }

  /** label: 1 = kauppa oli voitollinen, 0 = ei ollut. */
  update(input: number[], label: 0 | 1): void {
    const pred = this.score(input);
    const error = label - pred;
    for (let i = 0; i < this.weights.length; i++) {
      const grad = error * input[i] - L2_REG * this.weights[i];
      this.weights[i] += LEARNING_RATE * grad;
    }
    this.trainedExamples += 1;
    logger.info(`Oppiva malli paivitetty (esimerkki #${this.trainedExamples}), ennustusvirhe=${error.toFixed(3)}`);
  }

  getState(): LearnerState {
    return { weights: [...this.weights], trainedExamples: this.trainedExamples, updatedAt: Date.now() };
  }
}

function defaultWeights(): number[] {
  // [bias, momentum_5m, momentum_1h, vol/likviditeetti, osto/myynti_5m, osto/myynti_1h, ika, copy-trade, twitter/X]
  // Lievasti momentum-, ostopaine-, copy-trade- ja twitter-painotteinen
  // lahtoarvaus ennen kuin oma kaupankayntihistoria opettaa painot uusiksi.
  return [-0.5, 0.8, 0.6, 0.4, 0.5, 0.3, 0.1, 0.5, 0.5];
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}
