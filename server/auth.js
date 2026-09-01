// Sähköposti+salasana-tunnistautuminen keräilijöille.
// Salasana tallennetaan aina bcrypt-hashattuna (dbo.MobileKerailijat.SalasanaHash) - ei koskaan
// selväkielisenä. Onnistuneesta kirjautumisesta annetaan JWT-istuntotunniste, jonka
// React-sovellus lähettää jatkossa jokaisen pyynnön mukana (Authorization: Bearer ...).
import jwt from 'jsonwebtoken';    // JWT = JSON Web Token, allekirjoitettu "lippu" joka todistaa kuka on kirjautunut
import bcrypt from 'bcryptjs';     // salausalgoritmi salasanan hashaamiseen (yksisuuntainen, ei voi purkaa takaisin)
import { getPool, sql } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET; // salainen avain, jolla tokenit allekirjoitetaan - ilman tätä kukaan ei voi väärentää tokenia
const TOKEN_TTL = '12h'; // istunto vanhenee 12h kuluttua kirjautumisesta (yksi työvuoro riittää usein)

// Yksinkertainen sähköpostin muotovarmistus (ei täydellinen, mutta riittää estämään selvät kirjoitusvirheet)
const SAHKOPOSTI_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Uuden kerääjän rekisteröinti: tallentaa sähköpostin ja salasanan (hashattuna) tietokantaan.
// Kutsutaan Auth.jsx:n "Rekisteröidy uutena keräilijänä" -napista.
export async function register(req, res) {
  const { sahkoposti, salasana } = req.body || {};   // luetaan pyynnön mukana tulleen JSONin kentät

  // Perusvalidointi ennen kuin edes yritetään koskea tietokantaan
  if (!sahkoposti || !SAHKOPOSTI_REGEX.test(String(sahkoposti).trim())) {
    return res.status(400).json({ virhe: 'Anna kelvollinen sähköpostiosoite.' });
  }
  if (!salasana || String(salasana).length < 8) {
    return res.status(400).json({ virhe: 'Salasanan pitää olla vähintään 8 merkkiä.' });
  }

  try {
    const pool = await getPool(); // haetaan valmis tietokantayhteys (ks. db.js)

    // Tarkistetaan ettei sama sähköposti ole jo käytössä (Sahkoposti on UNIQUE-sarake taulussa)
    const olemassa = await pool.request()
      .input('sahkoposti', sql.VarChar, sahkoposti.trim().toLowerCase())
      .query('SELECT Id FROM dbo.MobileKerailijat WHERE Sahkoposti = @sahkoposti');

    if (olemassa.recordset.length > 0) {
      return res.status(409).json({ virhe: 'Tämä sähköposti on jo käytössä.' });
    }

    // bcrypt.hash tekee salasanasta pitkän, satunnaisen "sotkun" (hash) - tietokantaan
    // ei koskaan tallenneta itse salasanaa, joten sitä ei voi lukea vaikka joku pääsisi kantaan käsiksi
    const salasanaHash = await bcrypt.hash(String(salasana), 10); // 10 = "salt rounds", laskennan raskaus (turvallisuus vs. nopeus)

    await pool.request()
      .input('sahkoposti', sql.VarChar, sahkoposti.trim().toLowerCase())
      .input('salasanaHash', sql.VarChar, salasanaHash)
      .query('INSERT INTO dbo.MobileKerailijat (Sahkoposti, SalasanaHash) VALUES (@sahkoposti, @salasanaHash)');

    return res.status(201).json({ viesti: 'Käyttäjä luotu. Voit kirjautua sisään.' }); // 201 = "Created"
  } catch (err) {
    console.error('Rekisteröinti epäonnistui:', err); // tarkka virhe vain palvelimen omaan lokiin
    return res.status(500).json({ virhe: 'Rekisteröinti epäonnistui palvelinvirheen vuoksi.' }); // yleinen viesti käyttäjälle
  }
}

// Kirjautuminen: tarkistaa sähköpostin+salasanan ja palauttaa onnistuessaan JWT-tokenin.
export async function login(req, res) {
  const { sahkoposti, salasana } = req.body || {};

  if (!sahkoposti || !salasana) {
    return res.status(400).json({ virhe: 'Sähköposti ja salasana vaaditaan.' });
  }

  try {
    const pool = await getPool();

    const tulos = await pool.request()
      .input('sahkoposti', sql.VarChar, String(sahkoposti).trim().toLowerCase())
      .query('SELECT Id, Sahkoposti, SalasanaHash, AktiivinenTila FROM dbo.MobileKerailijat WHERE Sahkoposti = @sahkoposti');

    const kayttaja = tulos.recordset[0]; // ensimmäinen (ja ainoa, koska Sahkoposti on UNIQUE) löytynyt rivi, tai undefined

    // Sama virheviesti sekä "sähköpostia ei löydy" että "väärä salasana" -tapauksissa,
    // jotta ei paljasteta ulkopuolisille mitkä sähköpostit ovat rekisteröityjä.
    if (!kayttaja || !kayttaja.AktiivinenTila) {
      return res.status(401).json({ virhe: 'Väärä sähköposti tai salasana.' });
    }

    // bcrypt.compare hashaa annetun salasanan samalla tavalla ja vertaa tallennettuun hashiin -
    // tämä on ainoa tapa "tarkistaa" hash, koska sitä ei voi purkaa takaisin selväkieliseksi
    const salasanaTasmaa = await bcrypt.compare(String(salasana), kayttaja.SalasanaHash);
    if (!salasanaTasmaa) {
      return res.status(401).json({ virhe: 'Väärä sähköposti tai salasana.' });
    }

    // Kirjautuminen onnistui: luodaan allekirjoitettu token, joka sisältää käyttäjän id:n ja sähköpostin.
    // "sub" (subject) on JWT:n vakiokäytäntö kertomaan kenestä token on kyse.
    const token = jwt.sign(
      { sub: kayttaja.Id, sahkoposti: kayttaja.Sahkoposti },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );

    return res.json({ token, sahkoposti: kayttaja.Sahkoposti }); // selain tallentaa tämän ja lähettää jatkossa mukana
  } catch (err) {
    console.error('Kirjautuminen epäonnistui:', err);
    return res.status(500).json({ virhe: 'Kirjautuminen epäonnistui palvelinvirheen vuoksi.' });
  }
}

// Express-middleware: vaaditaan pätevä JWT-token Authorization-headerissa.
// "Middleware" = funktio joka ajetaan ENNEN varsinaista reittiä (index.js:ssä esim.
// app.get('/api/tuotteet', requireAuth, ...) - requireAuth ajetaan ensin).
// Onnistuessaan lisää req.user = { sub, sahkoposti, iat, exp } ja kutsuu next() päästäkseen eteenpäin.
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
