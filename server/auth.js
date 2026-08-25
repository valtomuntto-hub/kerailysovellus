// Kevyt nimi+PIN-tunnistautuminen keräilijöille.
// PIN tallennetaan aina bcrypt-hashattuna (dbo.MobileKerailijat.PinHash) - ei koskaan
// selväkielisenä. Onnistuneesta kirjautumisesta annetaan JWT-istuntotunniste, jonka
// React-sovellus lähettää jatkossa jokaisen pyynnön mukana (Authorization: Bearer ...).
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getPool, sql } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '12h'; // istunto vanhenee 12h kuluttua kirjautumisesta (yksi työvuoro riittää usein)

export async function register(req, res) {
  const { nimi, pin } = req.body || {};

  if (!nimi || typeof nimi !== 'string' || nimi.trim().length < 2) {
    return res.status(400).json({ virhe: 'Anna nimi (vähintään 2 merkkiä).' });
  }
  if (!pin || String(pin).length < 4) {
    return res.status(400).json({ virhe: 'PIN-koodin pitää olla vähintään 4 merkkiä.' });
  }

  try {
    const pool = await getPool();

    const olemassa = await pool.request()
      .input('nimi', sql.VarChar, nimi.trim())
      .query('SELECT Id FROM dbo.MobileKerailijat WHERE Nimi = @nimi');

    if (olemassa.recordset.length > 0) {
      return res.status(409).json({ virhe: 'Tämä nimi on jo käytössä, valitse toinen.' });
    }

    const pinHash = await bcrypt.hash(String(pin), 10);

    await pool.request()
      .input('nimi', sql.VarChar, nimi.trim())
      .input('pinHash', sql.VarChar, pinHash)
      .query('INSERT INTO dbo.MobileKerailijat (Nimi, PinHash) VALUES (@nimi, @pinHash)');

    return res.status(201).json({ viesti: 'Käyttäjä luotu. Voit kirjautua sisään.' });
  } catch (err) {
    console.error('Rekisteröinti epäonnistui:', err);
    return res.status(500).json({ virhe: 'Rekisteröinti epäonnistui palvelinvirheen vuoksi.' });
  }
}

export async function login(req, res) {
  const { nimi, pin } = req.body || {};

  if (!nimi || !pin) {
    return res.status(400).json({ virhe: 'Nimi ja PIN vaaditaan.' });
  }

  try {
    const pool = await getPool();

    const tulos = await pool.request()
      .input('nimi', sql.VarChar, String(nimi).trim())
      .query('SELECT Id, Nimi, PinHash, AktiivinenTila FROM dbo.MobileKerailijat WHERE Nimi = @nimi');

    const kayttaja = tulos.recordset[0];

    // Sama virheviesti sekä "nimeä ei löydy" että "väärä PIN" -tapauksissa,
    // jotta ei paljasteta ulkopuolisille mitkä nimet ovat rekisteröityjä.
    if (!kayttaja || !kayttaja.AktiivinenTila) {
      return res.status(401).json({ virhe: 'Väärä nimi tai PIN.' });
    }

    const pinTasmaa = await bcrypt.compare(String(pin), kayttaja.PinHash);
    if (!pinTasmaa) {
      return res.status(401).json({ virhe: 'Väärä nimi tai PIN.' });
    }

    const token = jwt.sign(
      { sub: kayttaja.Id, nimi: kayttaja.Nimi },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );

    return res.json({ token, nimi: kayttaja.Nimi });
  } catch (err) {
    console.error('Kirjautuminen epäonnistui:', err);
    return res.status(500).json({ virhe: 'Kirjautuminen epäonnistui palvelinvirheen vuoksi.' });
  }
}

// Express-middleware: vaaditaan pätevä JWT-token Authorization-headerissa.
// Onnistuessaan lisää req.user = { sub, nimi, iat, exp }.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ virhe: 'Kirjautuminen puuttuu.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ virhe: 'Istunto vanhentunut tai virheellinen, kirjaudu uudelleen.' });
  }
}
