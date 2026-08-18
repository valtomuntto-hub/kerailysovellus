import { useState, useEffect } from 'react'
import Auth from './Auth'
import { supabase } from './supabaseClient'

export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (!session) {
    return <Auth />;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Keräilylista App</h1>
      <p>käyttäjä: {session.user.email}</p>
      <button onClick={() => supabase.auth.signOut()}>Kirjaudu ulos</button>
      <AppContent session={session} />
    </div>
  );
}

function AppContent({ session }) {
  const TUOTEKATALOGI = [
    { nimi: "KAalan Maa-artis-bataakeit", grammat: "310g" },
    { nimi: "Balan Kesäkur-juureskeitt", grammat: "310g" },
    { nimi: "Maksalaatikko", grammat: "400g" },
    { nimi: "Maksalaat lakt rusinoilla", grammat: "400g" },
    { nimi: "Maksalaatikko lakt", grammat: "400g" },
    { nimi: "Maksalaatikko", grammat: "700g" },
    { nimi: "Pirkka Maksalaatikko", grammat: "400g" },
    { nimi: "Bataattivuoka", grammat: "350g" },
    { nimi: "Punakaalivuoka", grammat: "350g" },
    { nimi: "Kurpitsavuoka", grammat: "350g" },
    { nimi: "Maksalaat puolukkahillolla", grammat: "230g" },
    { nimi: "Lihamakaronilaat ketsupill", grammat: "220g" },
    { nimi: "Pekonimakaronilaatikko", grammat: "350g" },
    { nimi: "Musaka", grammat: "350g" },
    { nimi: "Lihakaalil.", grammat: "380g" },
    { nimi: "Pirkka Kinkku-paprikakius", grammat: "650g" },
    { nimi: "Pirkka Savulohikiusaus", grammat: "650g" },
    { nimi: "Pirkka Savulohipasta", grammat: "650g" },
    { nimi: "Pirkka Parmesan-broilerip", grammat: "650g" },
    { nimi: "Savulohilaatikko", grammat: "350g" },
    { nimi: "Porkkanaltk", grammat: "400g" }
  ];

  const [keruulista, setKeruulista] = useState([]);
  const [valmis, setValmis] = useState(false);
  const [tietokantaRaportit, setTietokantaRaportit] = useState([]);
  const [ladataan, setLadataan] = useState(false);

  useEffect(() => {
    haeRaportitTietokannasta();
  }, []);

  const haeyhteenveto = async () => {
    console.log('Keräys merkitty valmiiksi paikallisesti.');
  };

  const haeRaportitTietokannasta = async () => {
    setLadataan(true);
    const { data, error } = await supabase
      .from('kerailyraportit')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Virhe haettaessa raportteja:', error);
    } else {
      setTietokantaRaportit(data || []);
    }
    setLadataan(false);
  };

  const luokeruulista = () => {
    const tuotteidenMaara = Math.floor(Math.random() * 5) + 3;
    const randomitems = [...TUOTEKATALOGI].sort(() => 0.5 - Math.random());

    const uusiLista = randomitems.slice(0, tuotteidenMaara).map((tuote) => {
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
    await haeyhteenveto();
    const { error } = await supabase
      .from('kerailyraportit')
      .insert([{ tuotteet: keruulista, user_email: session.user.email }]);

    if (error) {
      console.error('Virhe tallennettaessa tietokantaan virhe:', error);
      alert('Tietokantaan tallennus epäonnistui.');
    } else {
      haeRaportitTietokannasta();
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>📦 Keräilylista</h2>

      <button onClick={luokeruulista}>🎲 Luo keruulista</button>

      {keruulista.length > 0 && !valmis && (
        <div style={{ marginTop: '20px' }}>
          <h3>Aktiivinen keruu:</h3>
          <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
            {keruulista.map((item, index) => (
              <li key={index} style={{ marginBottom: '15px' }}>
                <div>
                  <button 
                    onClick={() => vaihdakerätty(index)}
                    style={{ marginRight: '10px' }}
                  >
                    {item.kerätty ? '✔️ Kerätty' : '❌ Ei kerätty'}
                  </button>

                  <span style={{ textDecoration: item.kerätty ? 'line-through' : 'none' }}>
                    <strong>{item.nimi}</strong> ({item.grammat}) — Tilattu: <strong>{item.määrä} kpl</strong>
                  </span>
                </div>

                <div style={{ marginTop: '5px' }}>
                  <label>
                    Kerätty määrä:{' '}
                    <input
                      type="number"
                      min="0"
                      max={item.määrä}
                      value={item.kerattyMaara}
                      onChange={(e) => muutaKerattyMaaraa(index, e.target.value)}
                      style={{ width: '50px' }}
                    />{' '}
                    kpl
                  </label>
                </div>
              </li>
            ))}
          </ul>

          <button 
            onClick={merkitseValmiiksi}
            style={{
              padding: '10px 16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ✅ Keräys valmis
          </button>
        </div>
      )}

      {valmis && (
        <div style={{ marginTop: '20px' }}>
          <h3>📋 Keräysraportti Saarioinen</h3>
          <ul>
            {keruulista.map((item, index) => {
              const puuttuu = item.määrä - item.kerattyMaara;
              return (
                <li key={index}>
                  <strong>{item.nimi}</strong>: Kerätty {item.kerattyMaara} / {item.määrä} kpl{' '}
                  {puuttuu > 0 ? (
                    <span style={{ color: 'red' }}>(Puuttuu {puuttuu} kpl)</span>
                  ) : (
                    <span style={{ color: 'green' }}>(Täysin kerätty)</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <hr style={{ margin: '40px 0' }} />
      <Yhteenveto keruulista={keruulista} />

      <hr style={{ margin: '40px 0' }} />
      <h3>🗄️ Tietokantaan tallennetut keräykset</h3>
      {ladataan ? (
        <p>Ladataan raportteja tietokannasta...</p>
      ) : tietokantaRaportit.length === 0 ? (
        <p>Ei tallennettuja keräyksiä tietokannassa.</p>
      ) : (
        tietokantaRaportit.map((raportti) => (
          <div key={raportti.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px', borderRadius: '5px' }}>
            <small>Tallennusaika: {new Date(raportti.created_at).toLocaleString('fi-FI')} | Käyttäjä: {raportti.user_email}</small>
            <ul>
              {raportti.tuotteet.map((tuote, idx) => (
                <li key={idx}>
                  {tuote.nimi}: {tuote.kerattyMaara} / {tuote.määrä} kpl
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
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

    setTimeout(() => {
      const yhteensaTilattu = keruulista.reduce((sum, item) => sum + Number(item.määrä || 0), 0);
      const yhteensaKeratty = keruulista.reduce((sum, item) => sum + Number(item.kerattyMaara || 0), 0);
      const puuttuuYhteensa = yhteensaTilattu - yhteensaKeratty;

      setTilastot({
        viesti: "Kokonaisraportti laskettu",
        yhteensaTilattu,
        yhteensaKeratty,
        puuttuuYhteensa
      });
      setLadataan(false);
    }, 300);
  };

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
            <p style={{ color: '#93c5fd', margin: '5px 0 0 0', fontSize: '14px' }}>käyttäjä: {session.user.email}</p>
          </div>
          <button 
            onClick={() => supabase.auth.signOut()}
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

        <AppContent session={session} />
      </div>
    </div>
  );
}