// Tietokantayhteyden asetukset ja yhteyspooli stodb SQL Server -kantaan.
// Käyttää Windows-tunnistautumista (NTLM) paikallisella VM-tilillä
// WIN2022VM\mobileapi_svc — EI SQL-loginia/Mixed Modea, koska palvelin
// sallii vain Windows-tunnistautumisen eikä sitä haluttu muuttaa
// (olisi vaatinut SQL Server -palvelun uudelleenkäynnistyksen tuotannossa).
import sql from 'mssql';
import 'dotenv/config';

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  authentication: {
    type: 'ntlm',
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
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let poolPromise;

// Palauttaa jaetun yhteyspoolin (luodaan vain kerran, uudelleenkäytetään kaikissa pyynnöissä)
export function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config).catch((err) => {
      poolPromise = undefined; // annetaan seuraavan kutsun yrittää uudelleen, jos yhteys epäonnistui
      throw err;
    });
  }
  return poolPromise;
}

export { sql };
