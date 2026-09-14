# HANDOFF: memecoin-trader

Tila: 14.9.2026. Koodi valmis ja pushattu, paperikauppa todistetusti toiminut
käyttäjän Windows-koneella. Live-kauppa EI ole käytössä (lompakkoasia kesken).

## 1. Mitä tämä on ja kenelle

Automaattinen, itseoppiva kaupankäyntibotti Solana-memecoineille. Skannaa
trendaavia tokeneita (DexScreener), pisteyttää ne online-logistisella
regressiolla joka oppii omasta kauppahistoriasta, ja kauppaa Jupiterin
kautta. **Paperikauppa (simulaatio) on oletus** — live-kauppa vaatii
tietoisen `.env`-muutoksen.

Täysin erillinen projekti samassa GitHub-repossa (`kerailysovellus`) kuin
keräilylistasovellus (`src/`, `server/`) — ei liity siihen mitenkään, ei
jaa koodia eikä dataa. Sijaitsee `memecoin-trader/`-kansiossa, branchilla
`claude/memecoin-auto-trading-0i642w`.

Käyttäjä (Valto) ei ole ammattilaistreidaaja eikä kokenut kehittäjä — on
opetellut matkan varrella terminaalin, gitin ja Phantom-lompakon käyttöä.
Ohjeista jos jatkat tätä, oleta ei-tekninen lähtötaso.

## 2. Miten ajetaan / testataan

```bash
cd memecoin-trader
npm install                # ei natiivikäännöstä, toimii ilman Visual Studiota
cp .env.example .env       # LIVE_TRADING=false oletuksena, älä muuta ilman lupaa
npm run dev                # käynnistää botin + dashboardin
```

Dashboard: `http://localhost:3300` (tai `127.0.0.1:3300`).

```bash
npm test                   # 32 yksikkötestiä (node:test), kaikki vihreana
npm run typecheck          # tsc --noEmit, puhdas
npm run build              # tuotantobuild dist/:iin
npm run generate-wallet    # luo uuden Solana-keypairin ilman Phantomia
```

Vaatii Node.js >= 22.5 (`node:sqlite`-tuki).

## 3. Rakenne ja tärkeät tiedostot

```
src/
  config.ts                 kaikki .env-asetukset, zod-validoitu
  wallet.ts                  lompakon lataus + Solana-yhteys
  index.ts                    kaynnistys, paasilmukan ajastin
  data/
    dexscreener.ts             markkinadata (hinta/volyymi/likviditeetti)
    tokenUniverse.ts            kandidaattitokenien haku
    walletTracker.ts             copy-trade: seurattujen lompakoiden hallussapito
    twitterSignal.ts              X (Twitter) -integraatio, valinnainen
  strategy/
    features.ts                  raakadata -> piirrevektori (9 piirretta)
    learner.ts                    online-logistinen regressio, FEATURE_COUNT=9
  safety/tokenSafety.ts         mint/freeze-authority-tarkistus ennen ostoa
  execution/
    jupiter.ts                    swap-haku ja -toteutus
    riskManager.ts                 position-koko, paivaraja, suodattimet
    tradeEngine.ts                  paasilmukka, yhdistaa kaiken
  persistence/db.ts             node:sqlite - positiot/kaupat/mallin tila
  server/api.ts                 dashboard-API (127.0.0.1:vain)
public/index.html            dashboard (staattinen, ei build-vaihetta)
scripts/generate-wallet.mjs  Solana-keypairin luonti ilman Phantomia
README.md                    taydet kayttoonotto- ja ominaisuusohjeet
```

## 4. Päätökset joita ei saa rikkoa

- **`LIVE_TRADING=false` oletuksena `.env.example`:ssa.** Tietoinen
  turvavalinta. Älä vaihda defaulttia todeksi ilman että käyttäjä
  eksplisiittisesti pyytää sitä juuri sillä hetkellä.
- **`node:sqlite`, ei `better-sqlite3`.** better-sqlite3 vaatii natiivi-
  käännöksen (node-gyp), mikä kaatui käyttäjän Windows-koneella puuttuvien
  Visual Studio Build Toolsien takia. Älä palauta better-sqlite3:a.
- **Dashboard-palvelin sidottu eksplisiittisesti `127.0.0.1`:aan**
  (`server/api.ts`, `app.listen(config.PORT, "127.0.0.1", ...)`) — ei
  `0.0.0.0`/oletus. Korjasi Windowsilla ilmenneen "kuuntelee mutta selain ei
  paase sisaan" -ongelman, ja pitää autentikoimattoman API:n poissa
  verkosta.
- **Root `.gitignore`:n `data/`-sääntö on `/data/` (ankkuroitu), EI
  pelkkä `data/`.** Ankkuroimaton versio osuu vahingossa myös
  `src/data/`-lähdekoodikansioon ja jättää tiedostoja pois gitistä
  huomaamatta (tapahtui kerran, ks. kohta 5/commit `1d3750b`).
- **`FEATURE_COUNT` (`learner.ts`) ja `toModelInput()` (`features.ts`)
  pysyvät aina synkassa.** Piirteen lisäys/poisto vaatii molempien
  päivityksen samassa muutoksessa, muuten `dot()` tuottaa NaN. Vanhentunut
  tallennettu mallin tila (eri pituinen) nollautuu automaattisesti
  (`learner.ts`-konstruktori) — tämä suoja pitää säilyttää.
- **Paperikaupan virtuaalisaldo (`PAPER_STARTING_BALANCE_SOL`,
  `db.getPaperBalanceSol`) on erillinen oikean lompakon saldosta.**
  Mahdollistaa testauksen ilman `WALLET_PRIVATE_KEY`:ta. Älä sido
  paperikaupan position-kokoa oikeaan lompakkoon.
- **Copy-trading ja Twitter-signaali ovat AINA lisäsignaaleja, eivät
  koskaan ohita `riskManager`-suodattimia/rajoja.** Sama periaate pätee
  jos lisäät uusia signaaleja jatkossa.
- **Ei insider-tietoon perustuvia signaaleja.** Käyttäjä pyysi "insider-
  ryhmä-bottia" — kieltäydyttiin (pump-and-dump-osallisuus/markkina-
  manipulaatio). Ei pidä rakentaa myöhemminkään.
- **Yksityistä avainta ei koskaan liitetä keskusteluun.** Tätä rikottiin
  kerran vahingossa (annoin virheellisen neuvon että se olisi turvallista).
  Se lompakko (`CawvSSd7RyKvRX38dw8AA6b37BxXjWbvpADVfq1HwNE9`) on poltettu
  — EI KOSKAAN käytetä sitä oikean rahan kanssa.

## 5. Avoimet asiat ja bugit

- **Live-kauppa ei ole käytössä.** `WALLET_PRIVATE_KEY` on tyhjä. Käyttäjän
  lompakkotilanne on sekava (ks. kohta 6) — seuraava askel on ajaa
  `npm run generate-wallet` uudelleen, jakaa TÄSSÄ KESKUSTELUSSA vain
  julkinen osoite (ei avainta), ja käyttäjä syöttää yksityisen avaimen
  suoraan `.env`-tiedostoon itse.
- **Ei tiedetä onko botti käynnissä juuri nyt.** Viimeisin nähty lokirivi
  oli 29.8., kysytty käyttäjältä 14.9. onko yhä päällä — ei vahvistusta.
  Todennäköisesti pysähtynyt (kone sammunut/ikkuna kiinni välissä).
- **DexScreener-haut epäonnistuivat ajoittain käyttäjän koneella**
  (`ENOTFOUND`/`ConnectTimeout`) — näytti WiFi-flakiudelta, ei koodivirhe
  (haut onnistuivat välillä, kaupat tehtiin onnistuneesti niiden välissä).
  Ei vaadi toimenpiteitä ellei toistu jatkuvasti.
- **Tämä agent-hiekkalaatikko ei pääse ulos DexScreener/Jupiter/Solana
  RPC:hen** (egress-allowlist estää) — kaikki sellainen testaus on tehty
  paikallisesti simuloiden virheenkäsittelyä, tai käyttäjän oman koneen
  kautta. Älä yritä kiertää tätä, se on hiekkalaatikon tarkoituksellinen
  rajoitus.
- **Ei backtest-työkalua** historiadatalla — mainittu README:n
  "Rajoitukset"-osiossa jatkokehitysideana.
- **Top-10-holder-keskittymän tarkistus puuttuu** (rug pull -indikaattori,
  mainittu käyttäjälle mutta ei toteutettu koodiin — vain mint/freeze-
  authority tarkistetaan tällä hetkellä, `safety/tokenSafety.ts`).
- **Twitter-signaali vaatii oman X Developer -tilin + Bearer Tokenin +
  kulukaton** — käyttäjä ei ole vielä (tiettävästi) hankkinut näitä,
  ominaisuus on siis koodissa mutta ei aktiivinen.

## 6. Chatin tärkeät asiat tiivistettynä

**Mitä rakennettiin, järjestyksessä:**
1. Peruskoodi: skannaus, oppiva pisteytysmalli (7 piirrettä), riskienhallinta,
   Jupiter-swapit, SQLite-persistenssi, dashboard. Oletus paperikauppa.
2. Yksikkötestit (`node:test`, ei uutta riippuvuutta).
3. Copy-trading-signaali (`WATCHED_WALLETS`) — 8. piirre.
4. X (Twitter) -signaali (`TWITTER_BEARER_TOKEN`) — 9. piirre. X:n
   hinnoittelu muuttui helmikuussa 2026 "pay-per-use"-malliin, ei enää
   pakollista 200$/kk-tilausta — teki ominaisuuden järkeväksi rakentaa.
5. `generate-wallet`-skripti, koska Phantomin oma "Show Private Key"
   -näkymä jumittui toistuvasti käyttäjän puhelimessa/PC:llä.

**Bugeja jotka löytyivät ja korjattiin matkan varrella:**
- `.gitignore`:n `data/`-sääntö (ei ankkuroitu) osui vahingossa
  `src/data/`-kansioon → kaksi tiedostoa (`dexscreener.ts`,
  `tokenUniverse.ts`) eivät olleet gitissä lainkaan alusta asti, vaikka
  paikalliset `tsc`-ajot näyttivät vihreää (tsc ei välitä git-tilasta).
  Löytyi kun uusi tiedosto (`walletTracker.ts`) ei mennyt mukaan
  `git add -A`:lla. Korjattu, varmistettu puhtaalla clonella.
- `better-sqlite3` ei asentunut Windowsilla (puuttuvat Visual Studio Build
  Tools) → vaihdettu `node:sqlite`:hen kokonaan.
- Dashboard ei auennut selaimessa Windowsilla vaikka palvelin sanoi
  kuuntelevansa → sidottu eksplisiittisesti `127.0.0.1`:aan, korjasi.
- `PAPER_STARTING_BALANCE_SOL` puuttui alun perin → paperikauppa ei tehnyt
  yhtään kauppaa ilman oikeaa lompakkoa. Lisätty virtuaalisaldo.

**Mikä ei toiminut / kesken:**
- Käyttäjän lompakkotilanne meni sekaisin monen laitteen/tilin välillä:
  - `A41HJnAPDzUfkYMFqKRHrHe5G6SdHtb7cGAe8m3idUpa` — osoite johon ostettiin
    $10 USDC:tä (EI SOL:aa!) Phantomin Meld/Banxa-osto-toiminnolla. Ei
    varmistettu mistä Phantom-instanssista/laitteesta tämä on peräisin.
  - `Eqe7...uw8x` — käyttäjän PUHELIMEN Phantomin "Account 1", saldo
    näytti 5.59 (yksikkö epäselvä). Ei sama kuin yllä.
  - Phantomin "Export Private Key" -näkymä jumittui toistuvasti
    (loputon lataus) sekä puhelimessa että aiemmin — ei koskaan saatu
    toimimaan kummallakaan laitteella.
  - Käyttäjä osti myös 5 € "Webcade"-tokenia (webcade.fun, pump.fun-
    peräinen, likviditeetti n. 2,7M$) suoraan Phantomista, EI botin
    kautta — botti ei ole tehnyt yhtään oikeaa kauppaa.
  - `CawvSSd7RyKvRX38dw8AA6b37BxXjWbvpADVfq1HwNE9` — `generate-wallet`:in
    tuottama, mutta yksityinen avain paljastui vahingossa chatissa
    (oma virheeni). **Poltettu, ei käytetä.**
  - Tilanne jäi kesken: piti ajaa `generate-wallet` uudelleen ja jakaa
    vain julkinen osoite, mutta seuraavaksi käyttäjä vaihtoi aihetta.
- Käyttäjä pyysi useaan otteeseen "tee kaikki puolestani" ja yksityisen
  avaimen käsittelyä puolestani — kieltäydytty johdonmukaisesti (ei
  pääsyä käyttäjän koneelle, avainta ei koskaan chattiin).
- Käyttäjä pyysi "insider-ryhmä"-bottia (pump-and-dump-tyyppinen
  yksityinen tieto) — kieltäydytty, selitetty miksi.
- Käyttäjä pyysi suosittelemaan tiettyä ostettavaa memecoinia — kieltäydytty
  johdonmukaisesti, selitetty ettei kukaan voi tietää tätä luotettavasti.
- Annettiin rehellisiä tilastoja riskeista useaan otteeseen (esim. 70-85%
  memecoin-kaupoista tappiolla, ~97% tokeneista kuolee, ks. README:n
  riskivaroitus) — käyttäjä halusi silti jatkaa live-kauppaan, mikä on
  hänen oikeutensa; turvarajat (paperikauppa-default, pienet position-
  koot, päiväraja) pidetty koodissa siitä huolimatta.

**Seuraava konkreettinen askel jos jatkat:** aja `npm run generate-wallet`,
jaa julkinen osoite (ei avainta), lähetä pieni testierä SOL:aa (ei USDC:tä)
siihen, syötä avain suoraan `.env`:iin, aseta `LIVE_TRADING=true`, käynnistä
`npm run dev` ja tarkista dashboard.
