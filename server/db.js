// Tietokantayhteyden asetukset ja yhteyspooli stodb SQL Server -kantaan.
// Käyttää mobileapi_user-SQL-kirjautumista (ei Windows-tunnistautumista, koska
// tämä prosessi ajetaan taustapalveluna eikä kirjautuneen käyttäjän kontekstissa).
import sql from 'mssql';
import 'dotenv/config';

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
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
