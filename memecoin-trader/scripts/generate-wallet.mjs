// Luo uuden Solana-lompakon botille suoraan, ilman Phantomia.
// Kaytto: npm run generate-wallet
//
// Tama on puhtaasti paikallinen, offline-operaatio - mitaan ei lahetela
// verkkoon. Tuloste nayttaa yksityisen avaimen SUORAAN TERMINAALIIN, joten
// varmista ettei kukaan katso olkasi yli, ja ettei terminaalisi historia
// tallennu jaettuun paikkaan.

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const keypair = Keypair.generate();

console.log("");
console.log("=".repeat(70));
console.log("UUSI SOLANA-LOMPAKKO LUOTU");
console.log("=".repeat(70));
console.log("");
console.log("Julkinen osoite (voit jakaa taman - talle lahetat SOL:aa botille):");
console.log("  " + keypair.publicKey.toBase58());
console.log("");
console.log("Yksityinen avain (ALA JAA TATA KENELLEKAAN):");
console.log("  " + bs58.encode(keypair.secretKey));
console.log("");
console.log("=".repeat(70));
console.log("Seuraavat askeleet:");
console.log("1. Kopioi yksityinen avain .env-tiedoston WALLET_PRIVATE_KEY-riville.");
console.log("2. Laheta julkiseen osoitteeseen se maara SOL:aa jonka olet valmis");
console.log("   havitmaan kokonaan (esim. omasta Phantom-lompakostasi, tavallisena");
console.log("   'Send'-toimintona - talle ei tarvita yksityista avainta).");
console.log("3. Tama ikkuna/tuloste EI tallennu minnekaan automaattisesti - jos");
console.log("   suljet terminaalin ennen kuin kopioit avaimen, joudut luomaan");
console.log("   uuden lompakon uudelleen.");
console.log("=".repeat(70));
console.log("");
