# memecoin-trader

Automaattinen, jatkuvasti oppiva kaupankayntibotti Solana-memecoineille.

> ## VAKAVA RISKIVAROITUS - lue tama ennen kuin asetat LIVE_TRADING=true
>
> - Memecoinit ovat **aarimmaisen volatiileja ja usein huijauksia** (rug pull,
>   honeypot-tokenit, keinotekoinen volyymi, "pump and dump" -ryhmat). Suuri
>   osa niista menee arvoltaan nollaan.
> - Tama botti **ei ole sijoitusneuvontaa**, eika kukaan voi taata sille
>   voittoa. "Oppiva malli" tarkoittaa yksinkertaista, lapinakyvaa tilastol-
>   lista mallia (katso alla "Miten 'oppiminen' oikeasti toimii") - ei
>   ihmeita, ei takuita.
> - Kun `LIVE_TRADING=true`, botti kayttaa **oikeaa rahaa lompakostasi ilman
>   erillista vahvistusta jokaiselle kaupalle**. Voit havita sijoittamasi
>   varat kokonaan, myos ohjelmointivirheiden, verkko-ongelmien tai RPC-
>   solmun kaytoksen takia, ei pelkastaan markkinariskin takia.
> - Kayta **erillista "botti-lompakkoa"**, jossa on vain se maara SOL:aa jonka
>   olet valmis havitmaan kokonaan. Ala koskaan laita paalompakon avainta
>   tahan.
> - Tarkista oman maasi verotus- ja saantelyvelvoitteet kryptokaupankayn-
>   nille. Tama on henkilokohtainen tyokalu, ei rahoituspalvelu.
>
> **Aloita aina paperikaupalla (`LIVE_TRADING=false`, oletus) ja seuraa
> botin paatoksia oikeasti muutaman paivan ajan ennen kuin harkitset edes
> pienta live-summaa.**

## Mita tama on

- Skannaa jatkuvasti Solanan trendaavia/uusia memecoineja ([DexScreener](https://dexscreener.com)-datalla).
- Pisteyttaa jokaisen ehdokkaan omalla, jatkuvasti paivittyvalla mallilla ja
  ostaa kun pisteet + riskisuodattimet lapaisyvat rajan.
- Hallinnoi avoimia positioita: take-profit, stop-loss, trailing-stop ja
  aikaraja, plus mallin oma "myy nyt" -signaali.
- Oppii jokaisesta suljetusta kaupasta - paivittaa mallin painot sen mukaan
  meniko kauppa voitolle vai tappiolle - ja tallentaa opitun tilan levylle.
- Kayttaa [Jupiter](https://jup.ag)-swap-aggregaattoria kauppojen toteutukseen.
- Selainpohjainen dashboard (`http://localhost:3300`) nayttaa salkun,
  avoimet/suljetut positiot, kaupparivit ja mallin painot livena.
- **Paperikauppa (simulaatio) oletuksena** - ei kosketa oikeaa rahaa ennenkuin
  itse asetat `LIVE_TRADING=true`.

## Arkkitehtuuri

```
src/
  index.ts              Kaynnistys: lataa asetukset, kaynnistaa silmukan + dashboardin
  config.ts              .env-asetusten luku ja validointi (zod)
  wallet.ts               Solana-lompakko ja RPC-yhteys
  data/
    dexscreener.ts         Markkinadata: hinnat, volyymi, likviditeetti, ika
    tokenUniverse.ts        Trendaavien tokenien kandidaattijoukko
  strategy/
    features.ts             Raakadatasta piirrevektoriksi mallille
    learner.ts               Online-logistinen regressio - "oppiva" osto/myyntimalli
  safety/
    tokenSafety.ts           Mint/freeze-authority -tarkistus (rug pull -suodatin)
  execution/
    jupiter.ts               Jupiter-swapien haku ja toteutus
    riskManager.ts            Position-koko, paivaraja, likviditeetti-/ika-suodattimet
    tradeEngine.ts             Paasilmukka: yhdistaa kaiken ylla olevan
  persistence/
    db.ts                     SQLite: positiot, kaupat, mallin tila, paivatilastot
  server/
    api.ts                    Express-API dashboardille
public/
  index.html               Dashboard (staattinen, ei build-vaihetta)
```

## Kayttoonotto

### 1) Riippuvuudet

```bash
cd memecoin-trader
npm install
cp .env.example .env
```

### 2) Solana-lompakko

Suositus: luo **uusi, erillinen lompakko** pelkastaan botille (esim. Phantomissa
"Lisaa/yhdista lompakko" -> "Luo uusi lompakko"), ja siirra siihen vain se
summa SOL:aa jonka olet valmis havitmaan kokonaan.

Vie lompakon yksityinen avain Phantomista:
`Asetukset -> Turvallisuus ja tietosuoja -> Nayta yksityinen avain` (base58-
muotoinen merkkijono) ja liita se `.env`-tiedoston `WALLET_PRIVATE_KEY`-riville.

**Ala koskaan** jaa tata avainta kenellekaan tai committaa `.env`-tiedostoa
gittiin (juuren `.gitignore` estaa taman jo oletuksena).

### 3) RPC-yhteys

Julkinen `api.mainnet-beta.solana.com` toimii testailuun, mutta rajoittaa
pyyntoja voimakkaasti eika sovi jatkuvaan botin ajoon. Suositus: hae ilmainen
RPC-avain esim. [Helius](https://www.helius.dev):sta ja aseta se
`SOLANA_RPC_URL`:aan.

### 4) Aja paperikaupassa (suositus aloitukseen)

```bash
npm run dev
```

Avaa `http://localhost:3300` - nait botin paatokset, "kaupat" ja mallin
oppimisen reaaliajassa, ilman etta yhtaan oikeaa SOL:a liikkuu. `LIVE_TRADING`
on oletuksena `false` `.env.example`:ssa nimenomaan siksi, etta botti ei voi
vahingossa alkaa kayttaa oikeaa rahaa heti ensimmaisella kaynnistyksella.

### 5) Siirry live-kauppaan

Kun olet seurannut paatoksia ja olet tyytyvainen logiikkaan ja riskirajoihin:

1. Varmista `MAX_POSITION_SOL`, `MAX_CONCURRENT_POSITIONS`, `MAX_DAILY_LOSS_SOL`
   yms. vastaavat omaa riskinsietoasi (oletukset ovat pienia/varovaisia).
2. Siirra botti-lompakkoon vain se maara SOL:aa jonka olet valmis havitmaan.
3. Aseta `.env`:iin `LIVE_TRADING=true`.
4. `npm run dev` (tai `npm run build && npm run start:built` tuotantoajoon).

Botti tulostaa lompakko-osoitteen ja saldon ja odottaa 5 sekuntia ennen
ensimmaista kierrosta, jotta ehdit perua (Ctrl+C) jos LIVE_TRADING paalla
oleminen oli vahinko.

## Miten "oppiminen" oikeasti toimii

Malli on **online-logistinen regressio** (`src/strategy/learner.ts`) - lineaarinen
malli joka antaa 0-1 -pisteet sille kuinka todennakoisesti kauppa olisi
voitollinen, seitsemasta piirteesta:

- hintamomentum 5 min ja 1 h
- volyymi suhteessa likviditeettiin
- osto/myyntipaine (tx-maarat) 5 min ja 1 h
- parin ika

Kun positio suljetaan (voitolla tai tappiolla), botti paivittaa painoja
stokastisella gradienttinousulla sen mukaan mika piirre ennusti lopputulosta
oikein. Painot ja opetettujen esimerkkien maara tallennetaan SQLiteen, joten
oppiminen sailyy uudelleenkaynnistysten yli. Dashboardin "Oppivan mallin
painot" -paneeli nayttaa painot livena.

Talla ei ole mitaan tekemista syvaoppimisen tai "AI ennustaa tulevaisuuden"
-mielikuvan kanssa - se on yksinkertainen, selitettava tilastomalli joka
sopeutuu **omaan** kaupankayntihistoriaasi. Se voi yhta hyvin oppia vaaria
korrelaatioita kuin oikeitakin, varsinkin ennen kuin dataa on kertynyt paljon.

## Turvamekanismit

- **Mint/freeze-authority-tarkistus** ennen jokaista ostoa (`src/safety/tokenSafety.ts`):
  ohittaa tokenit joissa kehittajalla on yha valta painaa lisaa tokeneita tai
  jaadyttaa lompakkoja.
- **Likviditeetti- ja ika-suodattimet**: ohittaa liian pienilikviditeettiset
  ja aivan juuri listatut parit (suurin rugpull-riski).
- **Position-koko** rajattu (`MAX_POSITION_SOL`) per kauppa.
- **Rinnakkaisten positioiden raja** (`MAX_CONCURRENT_POSITIONS`).
- **Paivittainen tappioraja** (`MAX_DAILY_LOSS_SOL`): kun raja tulee tayteen,
  botti lopettaa uusien positioiden avaamisen loppupaivaksi (avoimet positiot
  suljetaan yha normaalisti SL/TP-saantojen mukaan).
- **Stop-loss / take-profit / trailing-stop / max hold time** jokaiselle
  positiolle.
- **Slippage- ja hintavaikutusrajat** Jupiter-swapeille.
- **Paperikauppa oletuksena** - live-kauppa vaatii tietoisen `.env`-muutoksen.

Mikaan taalla ei poista markkinariskia eika takaa etta huijaustokenit
suodattuvat pois kokonaan - kyseessa on kevennetty, ei tayellinen suoja.

## .env-asetukset

Katso `.env.example` - jokainen muuttuja on kommentoitu siina.

## Dashboard

`http://localhost:3300` (portti asetettavissa `PORT`-muuttujalla). Nayttaa:

- LIVE/PAPERIKAUPPA-tilan isolla bannerilla (ei voi jaada huomaamatta)
- Lompakon saldon ja paivan realisoidun tuloksen
- Avoimet positiot reaaliaikaisella tuotolla
- Oppivan mallin painot palkkeina
- Viimeisimmat kaupat ja suljettujen positioiden historia

API on tarkoitettu vain paikalliseen kayttoon (ei autentikointia) - ala aja
sita julkisesti verkkoon avoimena.

## Rajoitukset / jatkokehitysideoita

- Yksi lineaarinen malli koko token-joukolle - ei viela erillisia malleja eri
  token-kategorioille tai kontekstuaalista bandit-algoritmia.
- Ei backtest-tyokalua historiadatalla (voisi lisata `scripts/backtest.ts`).
- DexScreenerin julkinen API on rate-limitoitu; suurella skannausvalilla tai
  isolla kandidaattijoukolla voi tulla 429-vastauksia.
- Ei viela tue useampaa ketjua (vain Solana) tai useampaa lompakkoa.
