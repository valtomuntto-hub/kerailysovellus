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
    <div>
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
          🎲 Luo keruulista
        </button>

        {keruulista.length > 0 && !valmis && (
          <div style={{ marginTop: '20px' }}>
            <h3 style={{ color: '#93c5fd' }}>Aktiivinen keruu:</h3>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              {keruulista.map((item, index) => (
                <li key={index} style={{ marginBottom: '15px', backgroundColor: '#1e293b', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      
                      <span style={{ textDecoration: item.kerätty ? 'line-through' : 'none', color: item.kerätty ? '#94a3b8' : '#fff' }}>
                        <strong>{item.nimi}</strong> ({item.grammat}) — Tilattu: <strong>{item.määrä} kpl</strong>
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
  onClick={() => vaihdakerätty(index)}
  className="mobiili-nappi"
  style={{ 
    marginRight: '10px', 
    backgroundColor: item.kerätty ? '#166534' : '#991b1b', 
    color: '#fff', 
    border: 'none', 
    borderRadius: '6px', 
    cursor: 'pointer',
    fontWeight: 'bold'
  }}
>
  {item.kerätty ? '✔️ Kerätty' : '❌ Ei kerätty'}
</button>
          </div>
        )}

        {valmis && (
          <div style={{ marginTop: '20px', backgroundColor: '#1e293b', padding: '15px', borderRadius: '8px', border: '1px solid #334155' }}>
            <h3 style={{ color: '#60a5fa' }}>📋 Keräysraportti Saarioinen</h3>
            <ul style={{ paddingLeft: '20px' }}>
              {keruulista.map((item, index) => {
                const puuttuu = item.määrä - item.kerattyMaara;
                return (
                  <li key={index} style={{ marginBottom: '6px' }}>
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
          tietokantaRaportit.map((raportti) => (
            <div key={raportti.id} style={{ backgroundColor: '#1e293b', border: '1px solid #334155', padding: '15px', marginBottom: '12px', borderRadius: '8px' }}>
              <small style={{ color: '#93c5fd' }}>Tallennusaika: {new Date(raportti.created_at).toLocaleString('fi-FI')} | Käyttäjä: {raportti.user_email}</small>
              <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px', color: '#e2e8f0' }}>
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
        </div>
      )}
    </div>
  );
}