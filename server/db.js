// Tietokantayhteyden asetukset ja yhteyspooli stodb SQL Server -kantaan.
// Käyttää Windows-tunnistautumista (NTLM) paikallisella VM-tilillä
// WIN2022VM\mobileapi_svc — EI SQL-loginia/Mixed Modea, koska palvelin
// sallii vain Windows-tunnistautumisen eikä sitä haluttu muuttaa
// (olisi vaatinut SQL Server -palvelun uudelleenkäynnistyksen tuotannossa).
import sql from 'mssql';       // mssql-kirjasto osaa puhua SQL Serverin kanssa Node.js:stä
import 'dotenv/config';        // lukee .env-tiedoston ja laittaa sen arvot process.env-muuttujiin

// Yhteysasetukset. Kaikki oikeat arvot (palvelin, tunnukset) tulevat .env-tiedostosta
// - ei koskaan kovakoodattuna tähän, jotta salasana ei päädy Git-historiaan.
const config = {
  server: process.env.DB_SERVER,       // esim. 192.168.2.144
  database: process.env.DB_DATABASE,   // esim. stodb
  authentication: {
    type: 'ntlm',                       // Windows-tunnistautuminen (ei käyttäjätunnus+salasana-SQL-login)
    options: {
      domain: process.env.DB_DOMAIN,   // VM:n NetBIOS-nimi, esim. WIN2022VM (ei Active Directory -toimialue)
      userName: process.env.DB_USER,   // paikallinen Windows-tili, esim. mobileapi_svc
      password: process.env.DB_PASSWORD,
    },
  },
  options: {
    encrypt: true,               // salattu yhteys
    trustServerCertificate: true, // sisäverkon SQL Serverillä ei ole julkisen CA:n varmennetta
  },
  pool: {
    max: 10,              // enintään 10 samanaikaista yhteyttä poolissa
    min: 0,                // ei pidetä turhia yhteyksiä auki kun ei ole kuormaa
    idleTimeoutMillis: 30000, // suljetaan käyttämätön yhteys 30s jouten olon jälkeen
  },
};

// "Pool" tarkoittaa valmiiksi avattujen tietokantayhteyksien varastoa: sen sijaan että
// jokainen API-pyyntö avaisi ja sulkisi oman SQL-yhteyden (hidasta), yhteyksiä
// lainataan poolista ja palautetaan sinne käytön jälkeen.
let poolPromise; // säilyttää saman poolin muistissa koko palvelimen elinkaaren ajan

// Palauttaa jaetun yhteyspoolin (luodaan vain kerran, uudelleenkäytetään kaikissa pyynnöissä).
// Jokainen index.js:n reitti kutsuu tätä funktiota saadakseen käsiinsä tietokantayhteyden.
export function getPool() {
  if (!poolPromise) {
    // Ensimmäinen kutsu: aloitetaan yhteyden muodostus ja muistetaan tämä "lupaus" (Promise)
    poolPromise = sql.connect(config).catch((err) => {
      poolPromise = undefined; // jos yhteys epäonnistui, nollataan muuttuja niin seuraava kutsu yrittää uudelleen
      throw err;                // heitetään virhe eteenpäin kutsujalle (index.js:n try/catch nappaa sen)
    });
  }
  return poolPromise; // myöhemmillä kutsuilla palautetaan sama, jo valmis (tai valmistumassa oleva) pooli
}

export { sql }; // viedään myös sql-moduuli ulos, jotta muut tiedostot voivat käyttää esim. sql.Int, sql.VarChar -tyyppejä
