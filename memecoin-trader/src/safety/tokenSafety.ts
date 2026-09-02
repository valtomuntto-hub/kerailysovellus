import { PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { connection } from "../wallet.js";

export interface SafetyCheckResult {
  passed: boolean;
  reasons: string[];
}

/**
 * Kevyt "rug pull" -suodatin ennen ostoa: tarkistaa onko tokenin mint- ja
 * freeze-authority luovutettu pois. Jos kumpi tahansa on yha kehittajalla,
 * he voivat teoriassa painaa lisaa tokeneita loputtomiin tai jaadyttaa
 * ostajien lompakot - klassisia huijausmekanismeja memecoineissa.
 *
 * Tama EI takaa etta token on turvallinen (huijauksia tehdaan monella
 * muullakin tavalla), mutta karsii pois suorimmat teknisen tason riskit.
 */
export async function checkTokenSafety(mintAddress: string): Promise<SafetyCheckResult> {
  const reasons: string[] = [];
  const pubkey = new PublicKey(mintAddress);

  let mintInfo;
  try {
    mintInfo = await getMint(connection, pubkey, undefined, TOKEN_PROGRAM_ID);
  } catch {
    try {
      mintInfo = await getMint(connection, pubkey, undefined, TOKEN_2022_PROGRAM_ID);
    } catch {
      return { passed: false, reasons: ["Mint-tietojen haku epaonnistui - ohitetaan varmuuden vuoksi."] };
    }
  }

  if (mintInfo.mintAuthority !== null) {
    reasons.push("Mint authority ei ole luovutettu - kehittaja voi painaa lisaa tokeneita.");
  }
  if (mintInfo.freezeAuthority !== null) {
    reasons.push("Freeze authority on olemassa - kehittaja voi jaadyttaa lompakkosi tokenit.");
  }

  return { passed: reasons.length === 0, reasons };
}
