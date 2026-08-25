import { useState, useEffect } from 'react'
import Auth from './Auth'
import { api } from './apiClient'

// Tämä on sovelluksen juurikomponentti - React renderöi tämän ensimmäisenä.
// Se päättää näytetäänkö kirjautumislomake (Auth) vai itse sovellus (AppContent)
// riippuen siitä, onko selaimessa tallennettu voimassa oleva istunto.
export default function App() {
  // useState(() => ...) -muoto suorittaa funktion vain KERRAN ensimmäisellä renderöinnillä
  // (ei joka kerta uudelleen) - näin istunto luetaan localStoragesta heti käynnistyessä,
  // jotta sivun päivitys (F5) ei kirjaa käyttäjää ulos turhaan.
  const [session, setSession] = useState(() => api.getSession());

  // Auth-komponentti kutsuu tätä kun kirjautuminen onnistuu (ks. Auth.jsx:n onLogin-props)
  const handleLogin = (uusiSessio) => {
    setSession(uusiSessio); // tallennetaan istunto tilaan -> React piirtää AppContentin näkyviin
  };

  const handleLogout = () => {
    api.logout();     // pyyhkii tokenin localStoragesta
    setSession(null);  // -> seuraavalla renderöinnillä palataan takaisin kirjautumislomakkeeseen
  };

  // Jos ei ole kirjautunut istuntoa, näytetään VAIN kirjautumislomake eikä mitään muuta
  if (!session) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
      color: '#f8fafc',
      minHeight: '100vh',
      padding: '30px',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ color: '#60a5fa', margin: 0 }}>Keräilylista App</h1>
            <p style={{ color: '#93c5fd', margin: '5px 0 0 0', fontSize: '14px' }}>kerääjä: {session.nimi}</p>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              backgroundColor: '#334155',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Kirjaudu ulos
          </button>
        </div>

        <AppContent />
      </div>
    </div>
  );
}

function AppContent() {
  const [tuotekatalogi, setTuotekatalogi] = useState([]);   // ProductTypes-tuotteet API:sta
  const [keruulista, setKeruulista] = useState([]);          // aktiivinen, käyttäjän täyttämä keruulista
  const [valmis, setValmis] = useState(false);                // onko nykyinen keruu merkitty valmiiksi
  const [tietokantaRaportit, setTietokantaRaportit] = useState([]); // aiemmin tallennetut keräykset
  const [ladataan, setLadataan] = useState(false);
  const [onPuhelin, setOnPuhelin] = useState(false);          // puhelinkoon UI-säädöille
  const [virheviesti, setVirheviesti] = useState('');

  // Ajetaan kerran komponentin latautuessa: haetaan alkudata ja seurataan ikkunan kokoa
  useEffect(() => {
    haeTuotteetTietokannasta();
    haeRaportitTietokannasta();

    const tarkistaKoko = () => setOnPuhelin(window.innerWidth < 768);
    tarkistaKoko();
    window.addEventListener('resize', tarkistaKoko);
    return () => window.removeEventListener('resize', tarkistaKoko); // siivotaan kuuntelija pois
  }, []);

  // Hakee koko ProductTypes-tuotekatalogin (stodb) paikallisen API:n kautta
  const haeTuotteetTietokannasta = async () => {
    try {
      const data = await api.haeTuotteet();
      setTuotekatalogi(data || []);
    } catch (err) {
      console.error('Virhe haettaessa tuotteita:', err);
      setVirheviesti('Tuotteiden haku epäonnistui: ' + err.message);
    }
  };

  const haeRaportitTietokannasta = async () => {
    setLadataan(true);
    try {
      const data = await api.haeRaportit();
      setTietokantaRaportit(data || []);
    } catch (err) {
      console.error('Virhe haettaessa raportteja:', err);
      setVirheviesti('Raporttien haku epäonnistui: ' + err.message);
    } finally {
      setLadataan(false);
    }
  };

  // Keruulista = KAIKKI tuotekatalogin tuotteet kerralla (max 50 kpl, ProductTypesin koko sisältö).
  // Jokaiselle riville arvotaan "tilattu määrä" samalla tavalla kuin aiemmassa demo-versiossa.
  const luokeruulista = () => {
    if (tuotekatalogi.length === 0) {
      alert('Tuoteluettelo on tyhjä tai sitä ei saatu ladattua tietokannasta!');
      return;
    }

    const uusiLista = tuotekatalogi.map((tuote) => {
      const maara = Math.floor(Math.random() * 8) + 1;
      return {
        ...tuote,
        määrä: maara,
        kerattyMaara: maara,
        kerätty: false
      };
    });

    setKeruulista(uusiLista);
    setValmis(false);
  };

  const vaihdakerätty = (index) => {
    setKeruulista(keruulista.map((item, i) =>
      i === index ? { ...item, kerätty: !item.kerätty } : item
    ));
  };

  const muutaKerattyMaaraa = (index, uusiMaara) => {
    setKeruulista(keruulista.map((item, i) =>
      i === index ? { ...item, kerattyMaara: Math.max(0, Number(uusiMaara)) } : item
    ));
  };

  const merkitseValmiiksi = async () => {
    setValmis(true);
    try {
      await api.tallennaKeruu(keruulista);
      haeRaportitTietokannasta();
    } catch (err) {
      console.error('Virhe tallennettaessa tietokantaan:', err);
      alert('Tietokantaan tallennus epäonnistui: ' + err.message);
    }
  };

  return (
    <div>
      {virheviesti && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
          ⚠️ {virheviesti}
        </div>
      )}

      <div style={{
        background: 'rgba(15, 23, 42, 0.85)',
        padding: '25px',
        borderRadius: '12px',
        border: '1px solid #3b82f6',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        marginBottom: '30px'
      }}>
        <h2 style={{ color: '#60a5fa', marginTop: 0 }}>📦 Keräilylista</h2>

        <button
          onClick={luokeruulista}
          style={{
            padding: '10px 18px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '15px'
          }}
        >
          🎲 Luo keruulista ({tuotekatalogi.length} tuotetta)
        </button>

        {keruulista.length > 0 && !valmis && (
          <div style={{ marginTop: '20px' }}>
            <h3 style={{ color: '#93c5fd' }}>Aktiivinen keruu:</h3>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              {keruulista.map((item, index) => (
                <li key={item.skuId ?? index} style={{ marginBottom: '15px', backgroundColor: '#1e293b', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <button
                        onClick={() => vaihdakerätty(index)}
                        style={{
                          padding: onPuhelin ? '16px 24px' : '6px 12px',
                          fontSize: onPuhelin ? '18px' : '13px',
                          backgroundColor: item.kerätty ? '#166534' : '#991b1b',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          width: onPuhelin ? '100%' : 'auto'
                        }}
                      >
                        {item.kerätty ? '✔️ Kerätty' : '❌ Ei kerätty'}
                      </button>

                      <span style={{ textDecoration: item.kerätty ? 'line-through' : 'none', color: item.kerätty ? '#94a3b8' : '#fff' }}>
                        <strong>{item.nimi}</strong> (SKU {item.skuId}) — Tilattu: <strong>{item.määrä} kpl</strong>
                      </span>
                    </div>

                    <div>
                      <label style={{ fontSize: '14px', color: '#cbd5e1' }}>
                        Kerätty määrä:{' '}
                        <input
                          type="number"
                          min="0"
                          max={item.määrä}
                          value={item.kerattyMaara}
                          onChange={(e) => muutaKerattyMaaraa(index, e.target.value)}
                          style={{ width: '50px', padding: '4px', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', borderRadius: '4px' }}
                        />{' '}
                        kpl
                      </label>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <button
              onClick={merkitseValmiiksi}
              style={{
                padding: '10px 18px',
                backgroundColor: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                marginTop: '10px',
                fontSize: '15px'
              }}
            >
              ✅ Merkitse valmiiksi
            </button>
          </div>
        )}

        {valmis && (
          <div style={{ marginTop: '20px', backgroundColor: '#1e293b', padding: '15px', borderRadius: '8px', border: '1px solid #334155' }}>
            <h3 style={{ color: '#60a5fa' }}>📋 Keräysraportti</h3>
            <ul style={{ paddingLeft: '20px' }}>
              {keruulista.map((item, index) => {
                const puuttuu = item.määrä - item.kerattyMaara;
                return (
                  <li key={item.skuId ?? index} style={{ marginBottom: '6px' }}>
                    <strong>{item.nimi}</strong>: Kerätty {item.kerattyMaara} / {item.määrä} kpl{' '}
                    {puuttuu > 0 ? (
                      <span style={{ color: '#fca5a5' }}>(Puuttuu {puuttuu} kpl)</span>
                    ) : (
                      <span style={{ color: '#86efac' }}>(Täysin kerätty)</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div style={{ marginBottom: '30px' }}>
        <Yhteenveto keruulista={keruulista} />
      </div>

      <div style={{
        background: 'rgba(15, 23, 42, 0.85)',
        padding: '25px',
        borderRadius: '12px',
        border: '1px solid #3b82f6',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
      }}>
        <h3 style={{ color: '#60a5fa', marginTop: 0 }}>🗄️ Tietokantaan tallennetut keräykset</h3>
        {ladataan ? (
          <p style={{ color: '#93c5fd' }}>Ladataan raportteja tietokannasta...</p>
        ) : tietokantaRaportit.length === 0 ? (
          <p style={{ color: '#93c5fd' }}>Ei tallennettuja keräyksiä tietokannassa.</p>
        ) : (
          tietokantaRaportit.map((raportti, i) => (
            <div key={i} style={{ backgroundColor: '#1e293b', border: '1px solid #334155', padding: '15px', marginBottom: '12px', borderRadius: '8px' }}>
              <small style={{ color: '#93c5fd' }}>Tallennusaika: {new Date(raportti.aikaleima).toLocaleString('fi-FI')} | Kerääjä: {raportti.keraaja}</small>
              <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px', color: '#e2e8f0' }}>
                {raportti.tuotteet.map((tuote, idx) => (
                  <li key={idx}>
                    {tuote.nimi} (SKU {tuote.skuId}): {tuote.maara} kpl
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Yhteenveto({ keruulista }) {
  const [tilastot, setTilastot] = useState(null);
  const [ladataan, setLadataan] = useState(false);
  const [virhe, setVirhe] = useState("");

  const haeTilastot = async () => {
    if (!keruulista || keruulista.length === 0) {
      setVirhe("Luo ensin keräilylista!");
      return;
    }

    setLadataan(true);
    setVirhe("");

    try {
      const tulos = await api.yhteenveto(keruulista);
      setTilastot(tulos);
    } catch (err) {
      console.error(err);
      setVirhe("Palvelinkutsu epäonnistui: " + err.message);
    } finally {
      setLadataan(false);
    }
  };

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.85)',
      border: '1px solid #3b82f6',
      borderRadius: '12px',
      padding: '25px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
    }}>
      <h3 style={{ color: '#60a5fa', marginTop: 0 }}>📊 Kokonaisraportti</h3>

      <button
        onClick={haeTilastot}
        disabled={ladataan}
        style={{
          padding: '10px 18px',
          backgroundColor: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        {ladataan ? 'Ladataan...' : '🔄 Laske yhteenveto'}
      </button>

      {virhe && <p style={{ color: '#fca5a5', marginTop: '10px' }}>{virhe}</p>}

      {tilastot && (
        <div style={{ marginTop: '15px', lineHeight: '1.6', color: '#e2e8f0' }}>
          <p style={{ color: '#60a5fa' }}>📋 <strong>{tilastot.viesti}</strong></p>
          <p>🛒 Tilattu yhteensä: <strong>{tilastot.yhteensaTilattu} kpl</strong></p>
          <p>✅ Kerätty yhteensä: <strong>{tilastot.yhteensaKeratty} kpl</strong></p>
          <p>⚠️ Puuttuu yhteensä: <strong style={{ color: '#fca5a5' }}>{tilastot.puuttuuYhteensa} kpl</strong></p>
          <p>📈 Valmiina: <strong>{tilastot.prosentti}%</strong></p>
        </div>
      )}
    </div>
  );
}
