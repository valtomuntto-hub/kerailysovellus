// Keräilylista-sovelluksen paikallinen API.
// Ajetaan Win2022VM:llä samassa lähiverkossa kuin SQL Server (stodb), koska
// pilvipalvelin (esim. Vercel, jolla React-sovellus on julkaistu) ei pääse
// käsiksi sisäverkko-osoitteeseen 192.168.2.144. Puhelimet/tabletit, jotka
// ovat samassa varaston WiFi-verkossa, kutsuvat tätä API:a suoraan.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getPool, sql } from './db.js';
import { register, login, requireAuth } from './auth.js';

const app = express();

// Sallitaan vain määritellyt selainosoitteet (esim. Vercel-tuotanto-osoite ja/tai
// paikallinen kehityspalvelin). CORS_ORIGIN voi sisältää pilkulla erotellun listan.
const sallitutOrigin = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());
app.use(cors({ origin: sallitutOrigin }));

app.use(express.json());

// --- Tunnistautuminen (ei vaadi kirjautumista) ---
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

// --- Terveystarkistus (kätevä sen tarkistamiseen, että palvelu on käynnissä) ---
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Tuotteet: koko ProductTypes-katalogi (max 50 riviä, kaikki kerralla) ---
app.get('/api/tuotteet', requireAuth, async (_req, res) => {
  try {
    const pool = await getPool();
    const tulos = await pool.request()
      .query('SELECT TOP (50) SKUId, SKUDescription FROM dbo.ProductTypes ORDER BY SKUId');

    const tuotteet = tulos.recordset.map((r) => ({
      skuId: r.SKUId,
      nimi: r.SKUDescription,
    }));

    res.json(tuotteet);
  } catch (err) {
    console.error('Tuotteiden haku epäonnistui:', err);
    res.status(500).json({ virhe: 'Tuotteiden haku epäonnistui.' });
  }
});

// --- Keruutulosten tallennus: yksi keräyskerta = monta riviä samalla aikaleimalla ---
app.post('/api/keruutulokset', requireAuth, async (req, res) => {
  const { tuotteet } = req.body || {};

  if (!Array.isArray(tuotteet) || tuotteet.length === 0) {
    return res.status(400).json({ virhe: 'Tuotelista puuttuu.' });
  }

  const keraaja = req.user.nimi; // kerääjä luetaan JWT-tokenista, ei luoteta clientin lähettämään arvoon
  const aikaleima = new Date();  // sama aikaleima kaikille tämän keräyksen riveille -> voidaan ryhmitellä yhdeksi raportiksi myöhemmin

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const rivi of tuotteet) {
        const skuId = Number(rivi.skuId);
        const maara = Number(rivi.kerattyMaara ?? rivi.maara ?? 0);

        if (!Number.isFinite(skuId)) {
          throw new Error(`Virheellinen skuId: ${rivi.skuId}`);
        }

        await new sql.Request(transaction)
          .input('skuId', sql.Int, skuId)
          .input('maara', sql.Decimal(18, 2), maara)
          .input('keraaja', sql.VarChar, keraaja)
          .input('aikaleima', sql.DateTime2, aikaleima)
          .query(`INSERT INTO dbo.MobileKeruuTulokset (SKUId, Maara, Keraaja, Aikaleima)
                  VALUES (@skuId, @maara, @keraaja, @aikaleima)`);
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
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
      .input('keraaja', sql.VarChar, req.user.nimi)
      .query(`
        SELECT k.SKUId, p.SKUDescription, k.Maara, k.Keraaja, k.Aikaleima
        FROM dbo.MobileKeruuTulokset k
        LEFT JOIN dbo.ProductTypes p ON p.SKUId = k.SKUId
        WHERE k.Keraaja = @keraaja
        ORDER BY k.Aikaleima DESC`);

    // Ryhmitellään yksittäiset rivit takaisin yhdeksi raportiksi per keräyskerta
    // (sama Keraaja + sama Aikaleima = yksi POST /api/keruutulokset -kutsu).
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

    res.json([...raportit.values()]);
  } catch (err) {
    console.error('Raporttien haku epäonnistui:', err);
    res.status(500).json({ virhe: 'Raporttien haku epäonnistui.' });
  }
});

// --- Kokonaisraportin laskenta (sama logiikka kuin entisessä Vercel-funktiossa) ---
app.post('/api/yhteenveto', requireAuth, (req, res) => {
  const tuotteet = req.body?.tuotteet;
  if (!Array.isArray(tuotteet) || tuotteet.length === 0) {
    return res.status(400).json({ virhe: 'Tuotelista puuttuu' });
  }

  let tilattuYhteensa = 0;
  let kerattyYhteensa = 0;
  let rivitKeratty = 0;

  for (const t of tuotteet) {
    const tilattu = Number(t.määrä) || 0;
    const keratty = Number(t.kerattyMaara) || 0;
    tilattuYhteensa += tilattu;
    kerattyYhteensa += keratty;
    if (t.kerätty || keratty >= tilattu) rivitKeratty += 1;
  }

  const puuttuu = Math.max(0, tilattuYhteensa - kerattyYhteensa);
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
app.listen(port, () => {
  console.log(`Keräilylista-API kuuntelee portissa ${port}`);
});
