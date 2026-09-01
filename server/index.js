// Keräilylista-sovelluksen paikallinen API.
// Ajetaan Win2022VM:llä samassa lähiverkossa kuin SQL Server (stodb), koska
// pilvipalvelin (esim. Vercel, jolla React-sovellus on julkaistu) ei pääse
// käsiksi sisäverkko-osoitteeseen 192.168.2.144. Puhelimet/tabletit, jotka
// ovat samassa varaston WiFi-verkossa, kutsuvat tätä API:a suoraan.
//
// "API" (Application Programming Interface) tarkoittaa tässä käytännössä
// nettiosoitteita (reittejä), joita React-sovellus kutsuu HTTP-pyynnöillä,
// esim. GET /api/tuotteet - ja jokainen reitti alla vastaa siihen tekemällä
// tarvittavat SQL-kyselyt ja palauttamalla tuloksen JSON-muodossa.
import 'dotenv/config';          // lukee server/.env-tiedoston asetukset käyttöön (process.env.X)
import express from 'express';   // web-palvelinkehys: hoitaa HTTP-pyyntöjen vastaanoton ja reitityksen
import cors from 'cors';         // sallii selaimen kutsua tätä API:a eri osoitteesta (CORS-suojaus muuten estäisi)
import { getPool, sql } from './db.js';
import { register, login, requireAuth } from './auth.js';

const app = express(); // luodaan itse web-palvelinsovellus

// Sallitaan vain määritellyt selainosoitteet (esim. Vercel-tuotanto-osoite ja/tai
// paikallinen kehityspalvelin). CORS_ORIGIN voi sisältää pilkulla erotellun listan.
const sallitutOrigin = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());
app.use(cors({ origin: sallitutOrigin })); // "app.use" = ajetaan JOKAISELLE saapuvalle pyynnölle ennen reittejä

// Expressin oletusraja JSON-pyynnölle on vain 100kb - liian pieni, koska keruulista
// voi nyt sisältää yli tuhat tuoteriviä (ProductTypesin kasvettua). Nostetaan rajaa,
// jotta "Merkitse valmiiksi" ei kaadu HTTP 413 -virheeseen ("Payload Too Large").
app.use(express.json({ limit: '5mb' })); // jäsentää saapuvan JSON-rungon automaattisesti req.body-oliaksi

// --- Tunnistautuminen (ei vaadi kirjautumista - näitä pitää päästä kutsumaan ilman tokenia) ---
app.post('/api/auth/register', register); // POST = lähetetään dataa palvelimelle (uusi kerääjä)
app.post('/api/auth/login', login);

// --- Terveystarkistus (kätevä sen tarkistamiseen, että palvelu on käynnissä) ---
app.get('/api/health', (_req, res) => res.json({ ok: true })); // GET = pelkkä tiedon haku, ei vaadi mitään dataa mukaan

// --- Keruulista: max 10 riviä OIKEAA suunniteltua keräilytyötä (PlannedParcels + PlannedProductItems) ---
// Aiemmin "Luo keruulista" arpoi satunnaisen määrän ProductTypes-katalogin tuotteista
// (pelkkä demo, ei oikeaa dataa). Nyt keruulista poimitaan oikeasta, vielä keräämättömästä
// työstä: PlannedParcels = yksi "parcel" (kerättävä pakkaus/tote) joka kuuluu tilaukseen,
// PlannedProductItems = parcelin sisällä olevat tuoterivit OIKEALLA suunnitellulla
// määrällä (QtyPlannedSU). Vain "Planned"-tilaiset parcelit otetaan mukaan - ne eivät
// ole vielä kerättyjä ("Picked"/"Picking"/"Prepicked" jätetään pois).
app.get('/api/keruulista', requireAuth, async (_req, res) => {
  try {
    const pool = await getPool();
    // ORDER BY NEWID() = SQL Serverin tapa arpoa satunnainen järjestys, jotta joka
    // klikkaus "Luo keruulista" -napista antaa vaihtelevan otannan oikeasta työjonosta.
    const tulos = await pool.request()
      .query(`
        SELECT TOP (10) ppi.PlannedParcelId, ppi.SKUId, pt.SKUDescription, ppi.QtyPlannedSU, ppi.BBD, pp.PickListId, pp.PlannedParcelState
        FROM dbo.PlannedProductItems ppi
        JOIN dbo.PlannedParcels pp ON pp.PlannedParcelId = ppi.PlannedParcelId
        LEFT JOIN dbo.ProductTypes pt ON pt.SKUId = ppi.SKUId
        WHERE pp.PlannedParcelState = 'Planned'
        ORDER BY NEWID()`);

    const rivit = tulos.recordset.map((r) => ({
      skuId: r.SKUId,
      nimi: r.SKUDescription,
      maara: r.QtyPlannedSU,   // OIKEA suunniteltu määrä - ei enää arvottu satunnaisluku
      bbd: r.BBD,
      pickListId: r.PickListId,
      parcelId: r.PlannedParcelId,
    }));

    res.json(rivit);
  } catch (err) {
    console.error('Keruulistan haku epäonnistui:', err);
    res.status(500).json({ virhe: 'Keruulistan haku epäonnistui.' });
  }
});

// --- Tuotteet: koko ProductTypes-katalogi, kaikki rivit kerralla ---
// HUOM: taulussa oli alun perin tasan 50 riviä, joten TOP (50) oli silloin "kaikki".
// Data on sittemmin kasvanut (nyt yli 1300 riviä), joten yläraja poistettiin - haetaan
// aina KAIKKI rivit, ei kiinteää kattoa.
// "requireAuth" ennen käsittelijää tarkoittaa: tämä reitti toimii vain jos pyynnön
// mukana tulee kelvollinen Authorization-token (ks. auth.js:n requireAuth-funktio).
app.get('/api/tuotteet', requireAuth, async (_req, res) => {
  try {
    const pool = await getPool();
    const tulos = await pool.request()
      .query('SELECT SKUId, SKUDescription FROM dbo.ProductTypes ORDER BY SKUId');

    // Muunnetaan SQL-sarakkeet (SKUId, SKUDescription) React-puolen odottamiksi
    // kenttänimiksi (skuId, nimi) - pieni "käännös" tietokannan ja käyttöliittymän välillä
    const tuotteet = tulos.recordset.map((r) => ({
      skuId: r.SKUId,
      nimi: r.SKUDescription,
    }));

    res.json(tuotteet); // Express muuttaa JS-taulukon automaattisesti JSON-tekstiksi
  } catch (err) {
    console.error('Tuotteiden haku epäonnistui:', err); // tarkka virhe palvelimen omaan lokiin (ei käyttäjälle asti)
    res.status(500).json({ virhe: 'Tuotteiden haku epäonnistui.' });
  }
});

// --- Keruutulosten tallennus: yksi keräyskerta = monta riviä samalla aikaleimalla ---
app.post('/api/keruutulokset', requireAuth, async (req, res) => {
  const { tuotteet } = req.body || {}; // React lähettää tässä koko keruulistan (jokaisen tuotteen ja kerätyn määrän)

  if (!Array.isArray(tuotteet) || tuotteet.length === 0) {
    return res.status(400).json({ virhe: 'Tuotelista puuttuu.' }); // 400 = "Bad Request", pyyntö oli virheellinen
  }

  const keraaja = req.user.sahkoposti; // kerääjä luetaan JWT-tokenista (requireAuth asetti req.user), ei luoteta clientin lähettämään arvoon
  const aikaleima = new Date();  // sama aikaleima kaikille tämän keräyksen riveille -> voidaan ryhmitellä yhdeksi raportiksi myöhemmin

  try {
    const pool = await getPool();
    // "Transaktio" tarkoittaa: joko KAIKKI rivit tallentuvat onnistuneesti, tai EI YHTÄÄN
    // (jos jokin rivi epäonnistuu kesken, kaikki aiemmatkin peruttaan) - näin kanta ei
    // koskaan jää "puolittain tallennettuun" tilaan.
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const rivi of tuotteet) {                              // käydään jokainen kerätty tuote läpi omana INSERT-rivinä
        const skuId = Number(rivi.skuId);
        const maara = Number(rivi.kerattyMaara ?? rivi.maara ?? 0); // ?? = käytä ensimmäistä arvoa joka ei ole null/undefined

        if (!Number.isFinite(skuId)) {
          throw new Error(`Virheellinen skuId: ${rivi.skuId}`);
        }

        await new sql.Request(transaction)                        // huom: käytetään transaktion Requestia, ei suoraan poolia
          .input('skuId', sql.Int, skuId)
          .input('maara', sql.Decimal(18, 2), maara)
          .input('keraaja', sql.VarChar, keraaja)
          .input('aikaleima', sql.DateTime2, aikaleima)
          .query(`INSERT INTO dbo.MobileKeruuTulokset (SKUId, Maara, Keraaja, Aikaleima)
                  VALUES (@skuId, @maara, @keraaja, @aikaleima)`);
      }

      await transaction.commit(); // kaikki rivit onnistuivat -> vahvistetaan pysyvästi kantaan
    } catch (err) {
      await transaction.rollback(); // jokin meni pieleen kesken -> perutaan kaikki tämän keräyksen rivit
      throw err;                     // heitetään virhe eteenpäin ulompaan catch-lohkoon
    }

    res.status(201).json({ viesti: 'Keruutulokset tallennettu.', rivienMaara: tuotteet.length });
  } catch (err) {
    console.error('Keruutulosten tallennus epäonnistui:', err);
    res.status(500).json({ virhe: 'Tallennus epäonnistui.' });
  }
});

// --- Aiemmin tallennetut keruutulokset (vain kirjautuneen kerääjän omat) ---
app.get('/api/keruutulokset', requireAuth, async (req, res) => {
  try {
    const pool = await getPool();
    const tulos = await pool.request()
      .input('keraaja', sql.VarChar, req.user.sahkoposti)
      .query(`
        SELECT k.SKUId, p.SKUDescription, k.Maara, k.Keraaja, k.Aikaleima
        FROM dbo.MobileKeruuTulokset k
        LEFT JOIN dbo.ProductTypes p ON p.SKUId = k.SKUId
        WHERE k.Keraaja = @keraaja
        ORDER BY k.Aikaleima DESC`);
    // LEFT JOIN ProductTypes: haetaan mukaan tuotteen nimi (SKUDescription), jotta ei tarvitse
    // näyttää käyttäjälle pelkkiä SKU-numeroita. LEFT (eikä tavallinen JOIN) varmistaa, että
    // rivi näkyy silti vaikka tuote olisi sittemmin poistunut ProductTypes-taulusta.

    // MobileKeruuTulokset-taulussa ei ole erillistä "keräyskerta"-tunnusta (tietoisesti
    // yksinkertaistettu rakenne) - siksi rivit ryhmitellään tässä takaisin yhdeksi
    // raportiksi käyttämällä avaimena (Keraaja + Aikaleima) -paria, koska kaikki saman
    // POST /api/keruutulokset -kutsun rivit tallennettiin samalla aikaleimalla.
    const raportit = new Map();
    for (const rivi of tulos.recordset) {
      const avain = `${rivi.Keraaja}|${rivi.Aikaleima.toISOString()}`;
      if (!raportit.has(avain)) {
        raportit.set(avain, { aikaleima: rivi.Aikaleima, keraaja: rivi.Keraaja, tuotteet: [] });
      }
      raportit.get(avain).tuotteet.push({
        skuId: rivi.SKUId,
        nimi: rivi.SKUDescription,
        maara: rivi.Maara,
      });
    }

    res.json([...raportit.values()]); // Map -> tavallinen taulukko, jonka JSON osaa esittää
  } catch (err) {
    console.error('Raporttien haku epäonnistui:', err);
    res.status(500).json({ virhe: 'Raporttien haku epäonnistui.' });
  }
});

// --- Asiakashaku: hae tilauksia PickLists-taulusta nimen/postinumeron/paikkakunnan perusteella ---
// PickLists on OIKEA tuotannon tilaustaulu (sama data jota varaston automaatio käyttää).
// Tämä reitti VAIN LUKEE sitä (SELECT) - ei koskaan muokkaa mitään.
app.get('/api/asiakkaat', requireAuth, async (req, res) => {
  const haku = String(req.query.haku || '').trim();
  if (!haku) {
    return res.status(400).json({ virhe: 'Anna hakusana (asiakkaan nimi tai postinumero/paikkakunta).' });
  }

  try {
    const pool = await getPool();
    // Ei kiinteää kattoa - hakusana (WHERE-ehto) rajaa tuloksen jo kohtuulliseksi,
    // koska tässä haetaan yhden asiakkaan/paikkakunnan tilauksia, ei koko taulua kerralla.
    const tulos = await pool.request()
      .input('haku', sql.VarChar, `%${haku}%`)
      .query(`
        SELECT PickListId, CustomerName, CustomerAddr2, Destination, DeliveryDate, PickListStateFull, Priority
        FROM dbo.PickLists
        WHERE CustomerName LIKE @haku OR CustomerAddr2 LIKE @haku OR Destination LIKE @haku
        ORDER BY DeliveryDate DESC`);

    const tilaukset = tulos.recordset.map((r) => ({
      pickListId: r.PickListId,
      asiakas: r.CustomerName,
      paikkakunta: r.CustomerAddr2,
      toimituspaikka: r.Destination,
      toimituspaiva: r.DeliveryDate,
      tila: r.PickListStateFull,
      prioriteetti: r.Priority,
    }));

    res.json(tilaukset);
  } catch (err) {
    console.error('Asiakashaku epäonnistui:', err);
    res.status(500).json({ virhe: 'Asiakashaku epäonnistui.' });
  }
});

// --- Keruutehtävä: yhden tilauksen keruurivit PlannedParcels + PlannedProductItems -tauluista ---
// Tämä ON se varsinainen "keruutehtävä": mitä SKU:ta, kuinka paljon ja mistä
// keräilyalueelta pitää kerätä annetulle tilaukselle. Myös tämä on pelkkää lukua.
//
// HUOM: käytetään samoja "Planned"-tauluja kuin "Luo keruulista" -demossa
// (ks. /api/keruulista yllä), EI PickListLines-taulua. PickListLines kuvaa mitä
// tilaukseen alun perin TILATTIIN, kun taas PlannedParcels/PlannedProductItems
// kuvaa mitä varastoautomaatio on OIKEASTI SUUNNITELLUT kerättäväksi juuri nyt
// (ajantasaisempi, ja sisältää oikean keräilypaikan). Yhdistetään PickListId:llä.
app.get('/api/keruutehtava/:pickListId', requireAuth, async (req, res) => {
  const { pickListId } = req.params;

  try {
    const pool = await getPool();
    const tulos = await pool.request()
      .input('pickListId', sql.VarChar, pickListId)
      .query(`
        SELECT ppi.ProductItemId, pp.PlannedParcelId, ppi.SKUId, pt.SKUDescription, ppi.QtyPlannedSU, pp.PickingPlace, ppi.BBD, pp.PlannedParcelState
        FROM dbo.PlannedParcels pp
        JOIN dbo.PlannedProductItems ppi ON ppi.PlannedParcelId = pp.PlannedParcelId
        LEFT JOIN dbo.ProductTypes pt ON pt.SKUId = ppi.SKUId
        WHERE pp.PickListId = @pickListId
        ORDER BY pp.PlannedParcelId, ppi.ProductItemId`);

    const rivit = tulos.recordset.map((r) => ({
      rivi: r.ProductItemId,
      skuId: r.SKUId,
      nimi: r.SKUDescription,
      maaraSU: r.QtyPlannedSU,   // oikea suunniteltu määrä, sama periaate kuin /api/keruulista
      alue: r.PickingPlace,
      bbd: r.BBD,
      tila: r.PlannedParcelState,
    }));

    res.json({ pickListId, rivit });
  } catch (err) {
    console.error('Keruutehtävän haku epäonnistui:', err);
    res.status(500).json({ virhe: 'Keruutehtävän haku epäonnistui.' });
  }
});

// --- Kokonaisraportin laskenta (sama logiikka kuin entisessä Vercel-funktiossa) ---
// Huom: tämä reitti EI kosketa tietokantaa lainkaan - se vain laskee lukuja
// suoraan React-sovelluksen lähettämästä keruulistasta (nopea, ei tarvitse SQL-kyselyä).
app.post('/api/yhteenveto', requireAuth, (req, res) => {
  const tuotteet = req.body?.tuotteet;
  if (!Array.isArray(tuotteet) || tuotteet.length === 0) {
    return res.status(400).json({ virhe: 'Tuotelista puuttuu' });
  }

  let tilattuYhteensa = 0;   // kaikkien rivien "tilattu määrä" -sarakkeen summa
  let kerattyYhteensa = 0;   // kaikkien rivien "kerätty määrä" -sarakkeen summa
  let rivitKeratty = 0;      // montako riviä on merkitty täysin kerätyksi

  for (const t of tuotteet) {
    const tilattu = Number(t.määrä) || 0;        // || 0 varmistaa ettei tule NaN jos kenttä puuttuu
    const keratty = Number(t.kerattyMaara) || 0;
    tilattuYhteensa += tilattu;
    kerattyYhteensa += keratty;
    if (t.kerätty || keratty >= tilattu) rivitKeratty += 1;
  }

  const puuttuu = Math.max(0, tilattuYhteensa - kerattyYhteensa); // ei koskaan negatiivinen luku näytölle
  const prosentti = tilattuYhteensa === 0 ? 0 : Math.round((kerattyYhteensa / tilattuYhteensa) * 100);

  res.status(200).json({
    raporttejaYhteensa: 1,
    rivienMaara: tuotteet.length,
    rivitKeratty,
    yhteensaTilattu: tilattuYhteensa,
    yhteensaKeratty: kerattyYhteensa,
    puuttuuYhteensa: puuttuu,
    prosentti,
    viesti: `Kerätty ${kerattyYhteensa}/${tilattuYhteensa} kpl (${prosentti}%)`,
  });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {                                    // käynnistää palvelimen kuuntelemaan saapuvia pyyntöjä
  console.log(`Keräilylista-API kuuntelee portissa ${port}`);
});
