// Kevyt HTTP-client paikallista Keräilylista-API:a varten (korvaa aiemman Supabase-clientin).
// API pyörii Win2022VM:llä samassa lähiverkossa kuin SQL Server - puhelin/tabletti
// pitää olla samassa WiFi-verkossa jotta yhteys toimii.
const API_URL = import.meta.env.VITE_API_URL || 'http://192.168.2.144:3001'; // API:n osoite: .env-tiedostosta, tai oletuksena suoraan VM:n IP
const TOKEN_KEY = 'keruu_token';        // avain, jolla JWT-kirjautumislippu tallennetaan selaimen localStorageen
const SAHKOPOSTI_KEY = 'keruu_sahkoposti'; // avain, jolla kirjautuneen kerääjän sähköposti tallennetaan selaimen localStorageen

// localStorage säilyy selaimessa vaikka sivu päivitetään tai suljetaan ja avataan uudelleen -
// näin kerääjän ei tarvitse kirjautua joka kerta uudelleen.
function getToken() {
  return localStorage.getItem(TOKEN_KEY);   // palauttaa tallennetun tokenin, tai null jos ei kirjautunut
}

// Kutsutaan onnistuneen kirjautumisen jälkeen: tallennetaan lippu ja sähköposti selaimen muistiin
function setSession(token, sahkoposti) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(SAHKOPOSTI_KEY, sahkoposti);
}

// Kutsutaan uloskirjautuessa: pyyhitään tallennettu istunto pois
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SAHKOPOSTI_KEY);
}

// Palauttaa nykyisen istunnon (jos kirjautunut) tai null (jos ei) - tätä kutsutaan
// sovelluksen käynnistyessä, jotta tiedetään näytetäänkö kirjautumislomake vai sovellus
function getSession() {
  const token = getToken();
  const sahkoposti = localStorage.getItem(SAHKOPOSTI_KEY);
  return token && sahkoposti ? { token, sahkoposti } : null;  // molemmat pitää löytyä, muuten ei kelvollinen istunto
}

// Yhteinen apufunktio kaikille API-kutsuille: lisää automaattisesti JSON-headerit
// ja Authorization-tokenin (jos kirjautunut), ja muuttaa virhevastaukset JS-poikkeuksiksi
// jotta jokaisessa kutsupaikassa ei tarvitse toistaa samaa virheenkäsittelyä.
async function apiFetch(polku, options = {}) {
  const token = getToken();

  const vastaus = await fetch(`${API_URL}${polku}`, {
    ...options,                                            // esim. method: 'POST', body: '...'
    headers: {
      'Content-Type': 'application/json',                   // kerrotaan palvelimelle että lähetämme JSONia
      ...(token ? { Authorization: `Bearer ${token}` } : {}), // liitetään kirjautumislippu mukaan, jos sellainen on
      ...options.headers,
    },
  });

  const data = await vastaus.json().catch(() => ({}));       // luetaan vastauksen JSON-sisältö (tyhjä objekti jos ei onnistu)

  if (!vastaus.ok) {
    // HTTP-status 400/401/500 jne. -> heitetään poikkeus, jonka kutsuja voi napata try/catchilla
    throw new Error(data.virhe || `Pyyntö epäonnistui (HTTP ${vastaus.status})`);
  }

  return data;
}

// Tämä objekti on se, mitä React-komponentit oikeasti kutsuvat (esim. api.login(...)).
// Jokainen metodi vastaa yhtä API:n reittiä server/index.js:ssä.
export const api = {
  // Kirjautuminen: lähettää sähköpostin+salasanan, tallentaa saadun tokenin automaattisesti
  async login(sahkoposti, salasana) {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ sahkoposti, salasana }),
    });
    setSession(data.token, data.sahkoposti);   // heti onnistuneen kirjautumisen jälkeen tallennetaan istunto
    return data;
  },

  // Uuden kerääjän rekisteröinti (ei kirjaa automaattisesti sisään, pitää kirjautua erikseen)
  async register(sahkoposti, salasana) {
    return apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ sahkoposti, salasana }),
    });
  },

  // Uloskirjautuminen tapahtuu täysin selaimen puolella - ei tarvitse ilmoittaa palvelimelle,
  // koska palvelin ei säilytä tilaa (token on itsessään voimassa kunnes se vanhenee)
  logout() {
    clearSession();
  },

  // Hakee koko tuotekatalogin (ProductTypes-taulu) - vaatii kirjautumisen
  haeTuotteet() {
    return apiFetch('/api/tuotteet');
  },

  // Hakee valmiin keruulistan (max 10 riviä oikeaa suunniteltua työtä
  // PlannedParcels+PlannedProductItems-tauluista, satunnainen otanta joka kerta)
  haeKeruulista() {
    return apiFetch('/api/keruulista');
  },

  // Hakee kirjautuneen kerääjän aiemmin tallentamat keruuraportit
  haeRaportit() {
    return apiFetch('/api/keruutulokset');
  },

  // Tallentaa yhden keräyskerran tulokset (taulukko tuotteita kerättyine määrineen)
  tallennaKeruu(tuotteet) {
    return apiFetch('/api/keruutulokset', {
      method: 'POST',
      body: JSON.stringify({ tuotteet }),
    });
  },

  // Laskee yhteenvedon (tilattu/kerätty/puuttuu/prosentti) annetulle keruulistalle
  yhteenveto(tuotteet) {
    return apiFetch('/api/yhteenveto', {
      method: 'POST',
      body: JSON.stringify({ tuotteet }),
    });
  },

  // Hakee asiakkaan tilaukset PickLists-taulusta nimen/postinumeron/paikkakunnan perusteella.
  // encodeURIComponent estää hakusanan erikoismerkkejä (esim. välilyönnit) rikkomasta URL:ia.
  haeAsiakkaat(haku) {
    return apiFetch(`/api/asiakkaat?haku=${encodeURIComponent(haku)}`);
  },

  // Hakee yhden tilauksen keruutehtävän (mitä pitää kerätä) sen PickListId:n perusteella
  haeKeruutehtava(pickListId) {
    return apiFetch(`/api/keruutehtava/${encodeURIComponent(pickListId)}`);
  },

  getSession,   // viedään myös tämä ulos, jotta App.jsx voi lukea istunnon käynnistyessä
};
