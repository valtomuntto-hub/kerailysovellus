import { VersionedTransaction } from "@solana/web3.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { connection, getKeypair } from "../wallet.js";

const QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const SWAP_API = "https://quote-api.jup.ag/v6/swap";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface JupiterQuote {
  raw: any;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
}

/**
 * Pyytaa Jupiterilta hintatarjouksen. `amountRaw` on syotto-mintin pienin
 * yksikko: SOL-ostoissa lamportit, tokenin myynnissa tokenin omat "base
 * units" (Jupiterin quote-vastauksesta saatu raaka maara).
 */
export async function getQuote(inputMint: string, outputMint: string, amountRaw: number): Promise<JupiterQuote | null> {
  const url = `${QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${config.MAX_SLIPPAGE_BPS}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn(`Jupiter quote vastasi ${res.status}`);
      return null;
    }
    const data = (await res.json()) as any;
    if (!data?.outAmount) return null;
    return { raw: data, inAmount: data.inAmount, outAmount: data.outAmount, priceImpactPct: Number(data.priceImpactPct ?? 0) };
  } catch (err) {
    logger.warn("Jupiter quote epaonnistui", err);
    return null;
  }
}

/** Rakentaa, allekirjoittaa ja lahettaa swap-transaktion. Palauttaa tx-signature tai null. */
export async function executeSwap(quote: JupiterQuote): Promise<string | null> {
  const keypair = getKeypair();
  try {
    const res = await fetch(SWAP_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote.raw,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    });
    if (!res.ok) {
      logger.error(`Jupiter swap vastasi ${res.status}`);
      return null;
    }
    const { swapTransaction } = (await res.json()) as { swapTransaction: string };
    const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
    tx.sign([keypair]);

    const signature = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");

    logger.trade(`Swap vahvistettu: ${signature}`);
    return signature;
  } catch (err) {
    logger.error("Swapin toteutus epaonnistui", err);
    return null;
  }
}
