# Keräilylista App

Varaston keräilylistasovellus. React-käyttöliittymä (puhelin/tabletti-yhteensopiva)
+ paikallinen API, joka lukee tuotteet ja tallentaa keruutulokset suoraan
**stodb**-tietokantaan (SQL Server, Win2022VM, `192.168.2.144`).

> Aiempi versio käytti Supabasea kirjautumiseen ja tallennukseen. Se on
> poistettu kokonaan — kaikki data on nyt stodb:ssa, ja kirjautuminen on oma
> kevyt nimi+PIN-järjestelmä.

## Arkkitehtuuri

```
Puhelin/tabletti (WiFi)          Win2022VM (192.168.2.144, lähiverkko)
┌─────────────────┐   HTTP      ┌──────────────────┐   SQL   ┌─────────┐
│ React-sovellus   │ ─────────▶ │ server/ (Node API)│ ──────▶ │  stodb  │
│ (src/, Vite)     │ (JSON/JWT) │ Express + mssql    │         │ SQL Srv │
└─────────────────┘             └──────────────────┘         └─────────┘
```

- **`src/`** — React-käyttöliittymä. Voi olla julkaistuna esim. Vercelissä
  (pilvi) TAI ajettuna paikallisesti (`npm run dev`). Kutsuu API:a
  `VITE_API_URL`-osoitteessa.
- **`server/`** — Erillinen Node.js/Express-API. **Pitää ajaa lähiverkossa**
  (suositus: Win2022VM itsellään, samalla koneella kuin SQL Server), koska
  se ottaa suoran SQL-yhteyden `192.168.2.144`:ään eikä pilvipalvelin pääse
  siihen käsiksi.
- **Puhelimen/tabletin pitää olla samassa WiFi-verkossa** kuin Win2022VM,
  jotta se pääsee kutsumaan API:a (esim. `http://192.168.2.144:3001`).

## Tietokanta (stodb)

Sovellus käyttää kolmea taulua:

| Taulu | Tarkoitus |
|---|---|
| `dbo.ProductTypes` | **Olemassa oleva** tuotannon taulu, luetaan vain (SELECT). Tuotekatalogi (SKUId, SKUDescription). |
| `dbo.MobileKerailijat` | **Uusi.** Kerääjien nimi + PIN-hash (kirjautuminen). |
| `dbo.MobileKeruuTulokset` | **Uusi.** Yksi rivi per kerätty tuote (SKUId, Maara, Keraaja, Aikaleima). |

⚠️ Sovellus **ei kosketa** stodb:n tuotanto-WMS-tauluihin (`PickLists`,
`PickListLines`, `PickingHistory` ym.) — ne kuuluvat oikealle
varastonohjausjärjestelmälle, eikä tätä demo/sisäistä työkalua ole tarkoitus
sekoittaa niihin.

SQL-yhteyttä varten on luotu erillinen, oikeuksiltaan minimoitu SQL-login
`mobileapi_user` (SELECT ProductTypes; SELECT/INSERT MobileKeruuTulokset;
SELECT/INSERT/UPDATE MobileKerailijat). Salasana on jaettu erikseen — laita
se `server/.env`-tiedostoon, älä koodiin.

## Käyttöönotto

### 1) API (`server/`) — ajetaan Win2022VM:llä

```bash
cd server
npm install
cp .env.example .env
# Muokkaa .env: täytä DB_PASSWORD (mobileapi_user-salasana) ja JWT_SECRET
npm start
```

Avaa palomuurista portti (oletus `3001`) sisäverkkoon, jotta puhelimet
pääsevät siihen käsiksi:

```powershell
netsh advfirewall firewall add rule name="Keraily API" dir=in action=allow protocol=TCP localport=3001
```

Pysyväiskäyttöön kannattaa ajaa palvelu esim. Windowsin tehtävänajastimella
käynnistyksen yhteydessä, tai työkalulla kuten [PM2](https://pm2.keymetrics.io/)
tai [NSSM](https://nssm.cc/) (asentaa Node-prosessin Windows-palveluksi).

### 2) React-sovellus (`src/`)

```bash
npm install
cp .env.example .env
# Muokkaa .env: VITE_API_URL osoittamaan Win2022VM:n API:in
npm run dev      # kehitys
npm run build    # tuotantobuild (esim. Verceliin)
```

## Kirjautuminen

Kerääjä rekisteröityy sovelluksessa nimellä + vähintään 4-numeroisella
PIN-koodilla ensimmäisellä kerralla ("Rekisteröidy uutena keräilijänä"),
ja kirjautuu sen jälkeen samoilla tiedoilla. PIN tallennetaan aina
bcrypt-hashattuna — ei koskaan selväkielisenä.

## Keruulistan logiikka

"Luo keruulista" hakee koko `ProductTypes`-katalogin (max 50 tuotetta) ja
arpoo jokaiselle tuotteelle demo-"tilausmäärän". Kerääjä merkitsee kunkin
tuotteen kerätyksi ja kirjaa todellisen kerätyn määrän, ja "Merkitse
valmiiksi" tallentaa tulokset `MobileKeruuTulokset`-tauluun (yksi rivi per
tuote, sama aikaleima koko keräyskerralle).

---

_Alkuperäinen pohja: React + Vite -template._
