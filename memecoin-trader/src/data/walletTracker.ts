import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { connection } from "../wallet.js";

/**
 * Copy-trade-tuki: seurataan kayttajan itse antamia Solana-lompakko-osoit-
 * teita ja katsotaan mita tokeneita ne TALLA HETKELLA pitavat hallussaan.
 *
 * Tama on tietoisesti yksinkertainen, POLLAAVA toteutus (ei reaaliaikaista
 * transaktioiden kuuntelua) - se sopii yhteen botin muun 45s-kierron kanssa,
 * mutta tarkoittaa etta havaitseminen on aina jonkin verran jaljessa siita
 * hetkesta kun seurattu lompakko oikeasti osti. Tama on olennainen rajoitus:
 * "copy-trading" viiveella on eri asia kuin tosiaikainen kopiointi, ja sen
 * viiveen takia botti voi paatya ostamaan vasta kun hinta on jo noussut.
 */

export function parseWatchedWallets(): PublicKey[] {
  const raw = config.WATCHED_WALLETS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out: PublicKey[] = [];
  for (const addr of raw) {
    try {
      out.push(new PublicKey(addr));
    } catch {
      logger.warn(`WATCHED_WALLETS: virheellinen lompakko-osoite ohitettu: ${addr}`);
    }
  }
  return out;
}

async function getWalletTokenMints(owner: PublicKey): Promise<string[]> {
  const mints = new Set<string>();
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const resp = await connection.getParsedTokenAccountsByOwner(owner, { programId });
      for (const { account } of resp.value) {
        const info: any = account.data.parsed?.info;
        const amount = Number(info?.tokenAmount?.uiAmount ?? 0);
        if (amount > 0 && info?.mint) mints.add(info.mint as string);
      }
    } catch (err) {
      logger.warn(`Lompakon ${owner.toBase58()} tokenisaldojen haku epaonnistui`, err);
    }
  }
  return Array.from(mints);
}

/** wallet-osoite (base58) -> mint-osoitteet joita se TALLA HETKELLA pitaa hallussaan. */
export async function fetchWatchedWalletHoldings(): Promise<Map<string, string[]>> {
  const wallets = parseWatchedWallets();
  const result = new Map<string, string[]>();
  for (const wallet of wallets) {
    result.set(wallet.toBase58(), await getWalletTokenMints(wallet));
  }
  return result;
}
