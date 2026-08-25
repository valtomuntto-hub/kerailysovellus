// Kevyt nimi+PIN-tunnistautuminen keräilijöille.
// PIN tallennetaan aina bcrypt-hashattuna (dbo.MobileKerailijat.PinHash) - ei koskaan
// selväkielisenä. Onnistuneesta kirjautumisesta annetaan JWT-istuntotunniste, jonka
// React-sovellus lähettää jatkossa jokaisen pyynnön mukana (Authorization: Bearer ...).
import jwt from 'jsonwebtoken';    // JWT = JSON Web Token, allekirjoitettu "lippu" joka todistaa kuka on kirjautunut
import bcrypt from 'bcryptjs';     // salausalgoritmi PIN-koodin hashaamiseen (yksisuuntainen, ei voi purkaa takaisin)
import { getPool, sql } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET; // salainen avain, jolla tokenit allekirjoitetaan - ilman tätä kukaan ei voi väärentää tokenia
const TOKEN_TTL = '12h'; // istunto vanhenee 12h kuluttua kirjautumisesta (yksi työvuoro riittää usein)

// Uuden kerääjän rekisteröinti: tallentaa nimen ja PIN-koodin (hashattuna) tietokantaan.
// Kutsutaan Auth.jsx:n "Rekisteröidy uutena keräilijänä" -napista.
export async function register(req, res) {
  const { nimi, pin } = req.body || {};   // luetaan pyynnön mukana tulleen JSONin kentät

  // Perusvalidointi ennen kuin edes yritetään koskea tietokantaan
  if (!nimi || typeof nimi !== 'string' || nimi.trim().length < 2) {
    return res.status(400).json({ virhe: 'Anna nimi (vähintään 2 merkkiä).' });
  }
  if (!pin || String(pin).length < 4) {
    return res.status(400).json({ virhe: 'PIN-koodin pitää olla vähintään 4 merkkiä.' });
  }

  try {
    const pool = await getPool(); // haetaan valmis tietokantayhteys (ks. db.js)

    // Tarkistetaan ettei sama nimi ole jo käytössä (Nimi on UNIQUE-sarake taulussa)
    const olemassa = await pool.request()
      .input('nimi', sql.VarChar, nimi.trim())
      .query('SELECT Id FROM dbo.MobileKerailijat WHERE Nimi = @nimi');

    if (olemassa.recordset.length > 0) {
      return res.status(409).json({ virhe: 'Tämä nimi on jo käytössä, valitse toinen.' });
    }

    // bcrypt.hash tekee PIN-koodista pitkän, satunnaisen "sotkun" (hash) - tietokantaan
    // ei koskaan tallenneta itse PIN-koodia, joten sitä ei voi lukea vaikka joku pääsisi kantaan käsiksi
    const pinHash = await bcrypt.hash(String(pin), 10); // 10 = "salt rounds", laskennan raskaus (turvallisuus vs. nopeus)

    await pool.request()
      .input('nimi', sql.VarChar, nimi.trim())
      .input('pinHash', sql.VarChar, pinHash)
      .query('INSERT INTO dbo.MobileKerailijat (Nimi, PinHash) VALUES (@nimi, @pinHash)');

    return res.status(201).json({ viesti: 'Käyttäjä luotu. Voit kirjautua sisään.' }); // 201 = "Created"
  } catch (err) {
    console.error('Rekisteröinti epäonnistui:', err); // tarkka virhe vain palvelimen omaan lokiin
    return res.status(500).json({ virhe: 'Rekisteröinti epäonnistui palvelinvirheen vuoksi.' }); // yleinen viesti käyttäjälle
  }
}

// Kirjautuminen: tarkistaa nimen+PINin ja palauttaa onnistuessaan JWT-tokenin.
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

    const kayttaja = tulos.recordset[0]; // ensimmäinen (ja ainoa, koska Nimi on UNIQUE) löytynyt rivi, tai undefined

    // Sama virheviesti sekä "nimeä ei löydy" että "väärä PIN" -tapauksissa,
    // jotta ei paljasteta ulkopuolisille mitkä nimet ovat rekisteröityjä.
    if (!kayttaja || !kayttaja.AktiivinenTila) {
      return res.status(401).json({ virhe: 'Väärä nimi tai PIN.' });
    }

    // bcrypt.compare hashaa annetun PIN:in samalla tavalla ja vertaa tallennettuun hashiin -
    // tämä on ainoa tapa "tarkistaa" hash, koska sitä ei voi purkaa takaisin selväkieliseksi
    const pinTasmaa = await bcrypt.compare(String(pin), kayttaja.PinHash);
    if (!pinTasmaa) {
      return res.status(401).json({ virhe: 'Väärä nimi tai PIN.' });
    }

    // Kirjautuminen onnistui: luodaan allekirjoitettu token, joka sisältää käyttäjän id:n ja nimen.
    // "sub" (subject) on JWT:n vakiokäytäntö kertomaan kenestä token on kyse.
    const token = jwt.sign(
      { sub: kayttaja.Id, nimi: kayttaja.Nimi },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );

    return res.json({ token, nimi: kayttaja.Nimi }); // selain tallentaa tämän ja lähettää jatkossa mukana
  } catch (err) {
    console.error('Kirjautuminen epäonnistui:', err);
    return res.status(500).json({ virhe: 'Kirjautuminen epäonnistui palvelinvirheen vuoksi.' });
  }
}

// Express-middleware: vaaditaan pätevä JWT-token Authorization-headerissa.
// "Middleware" = funktio joka ajetaan ENNEN varsinaista reittiä (index.js:ssä esim.
// app.get('/api/tuotteet', requireAuth, ...) - requireAuth ajetaan ensin).
// Onnistuessaan lisää req.user = { sub, nimi, iat, exp } ja kutsuu next() päästäkseen eteenpäin.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';                    // esim. "Bearer eyJhbGci..."
  const token = header.startsWith('Bearer ') ? header.slice(7) : null; // poimitaan pelkkä token "Bearer "-etuliitteen jälkeen

  if (!token) {
    return res.status(401).json({ virhe: 'Kirjautuminen puuttuu.' }); // 401 = "Unauthorized"
  }

  try {
    // jwt.verify tarkistaa allekirjoituksen JA vanhenemisajan samalla kertaa.
    // Jos joku on väärentänyt tokenin tai se on vanhentunut, tämä heittää poikkeuksen.
    req.user = jwt.verify(token, JWT_SECRET);
    next(); // token kelpaa -> päästetään pyyntö eteenpäin varsinaiseen reittikäsittelijään
  } catch {
    return res.status(401).json({ virhe: 'Istunto vanhentunut tai virheellinen, kirjaudu uudelleen.' });
  }
}
