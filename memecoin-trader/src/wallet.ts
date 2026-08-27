import { Connection, Keypair, LAMPORTS_PER_SOL, type PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config.js";

export const connection = new Connection(config.SOLANA_RPC_URL, "confirmed");

let cachedKeypair: Keypair | null = null;

/**
 * Lataa lompakon yksityisesta avaimesta (.env: WALLET_PRIVATE_KEY).
 * Avainta ei koskaan lokiteta.
 */
export function getKeypair(): Keypair {
  if (cachedKeypair) return cachedKeypair;
  if (!config.WALLET_PRIVATE_KEY) {
    throw new Error(
      "WALLET_PRIVATE_KEY puuttuu .env-tiedostosta. Vie yksityinen avain Phantomista " +
        "(Asetukset -> Turvallisuus ja tietosuoja -> Nayta yksityinen avain) ja liita se " +
        ".env:iin. ALA jaa sita kenellekaan."
    );
  }
  const secret = bs58.decode(config.WALLET_PRIVATE_KEY.trim());
  cachedKeypair = Keypair.fromSecretKey(secret);
  return cachedKeypair;
}

export async function getSolBalance(pubkey?: PublicKey): Promise<number> {
  const pk = pubkey ?? getKeypair().publicKey;
  const lamports = await connection.getBalance(pk);
  return lamports / LAMPORTS_PER_SOL;
}
