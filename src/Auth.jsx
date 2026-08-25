import { useState } from 'react'
import { api } from './apiClient'

// Kevyt nimi+PIN-kirjautuminen (korvaa aiemman Supabase-sähköposti/salasana-kirjautumisen).
// Sopii sisäiseen lähiverkon työkaluun: nopea käyttää käsipäätteellä, PIN tallennetaan
// palvelimella aina hashattuna, ei koskaan selväkielisenä.
//
// "onLogin" on funktio, jonka App.jsx antaa tälle komponentille parametrina (props) -
// kun kirjautuminen onnistuu, kutsutaan sitä ja App.jsx päivittää oman tilansa niin,
// että kirjautumislomakkeen sijaan näytetään itse sovellus.
export default function Auth({ onLogin }) {
  // useState palauttaa parin [nykyinenArvo, funktioArvonMuuttamiseen] - kun funktiota
  // kutsutaan, React piirtää komponentin uudelleen uudella arvolla.
  const [nimi, setNimi] = useState('')       // lomakkeen "Nimi"-kentän sisältö
  const [pin, setPin] = useState('')          // lomakkeen "PIN-koodi"-kentän sisältö
  const [loading, setLoading] = useState(false) // true kun odotetaan palvelimen vastausta (napit disabloidaan silloin)
  const [message, setMessage] = useState('')    // virhe- tai onnistumisviesti näytettäväksi

  // Kutsutaan kun lomake lähetetään (Enter tai "Kirjaudu sisään" -nappi)
  const handleLogin = async (e) => {
    e.preventDefault() // estää selainta lataamasta sivua uudelleen (lomakkeen oletuskäytös)
    setLoading(true)
    setMessage('')

    try {
      const data = await api.login(nimi.trim(), pin)      // kutsuu POST /api/auth/login
      onLogin({ nimi: data.nimi, token: data.token })      // ilmoitetaan App.jsx:lle että kirjautuminen onnistui
    } catch (err) {
      setMessage(err.message)                              // esim. "Väärä nimi tai PIN."
    } finally {
      setLoading(false) // suoritetaan onnistui tai ei - napit palautuvat aktiivisiksi
    }
  }

  // Kutsutaan "Rekisteröidy uutena keräilijänä" -napista - luo uuden tilin,
  // mutta EI kirjaa automaattisesti sisään (käyttäjä painaa itse "Kirjaudu sisään" sen jälkeen)
  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      await api.register(nimi.trim(), pin) // kutsuu POST /api/auth/register
      setMessage('Käyttäjä luotu! Voit nyt kirjautua sisään samoilla tiedoilla.')
    } catch (err) {
      setMessage(err.message) // esim. "Tämä nimi on jo käytössä, valitse toinen."
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
      color: '#ffffff',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'sans-serif'
    }}>
      <div style={{
        background: 'rgba(15, 23, 42, 0.85)',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        border: '1px solid #3b82f6',
        width: '100%',
        maxWidth: '400px',
        boxSizing: 'border-box'
      }}>
        <h2 style={{ color: '#60a5fa', textAlign: 'center', marginTop: 0, marginBottom: '20px' }}>
          📦 Keräilylista
        </h2>
        <p style={{ textAlign: 'center', color: '#93c5fd', marginTop: 0, marginBottom: '20px', fontSize: '14px' }}>
          Kirjaudu nimelläsi ja PIN-koodillasi
        </p>

        {message && (
          <p style={{ color: '#fca5a5', fontWeight: 'bold', textAlign: 'center', fontSize: '14px', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px' }}>
            {message}
          </p>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input
            type="text"
            placeholder="Nimi"
            autoComplete="username"
            value={nimi}
            onChange={(e) => setNimi(e.target.value)}
            style={{
              padding: '12px',
              backgroundColor: '#1e293b',
              color: '#fff',
              border: '1px solid #475569',
              borderRadius: '6px',
              fontSize: '15px',
              outline: 'none'
            }}
          />
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN-koodi"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            style={{
              padding: '12px',
              backgroundColor: '#1e293b',
              color: '#fff',
              border: '1px solid #475569',
              borderRadius: '6px',
              fontSize: '15px',
              outline: 'none'
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '15px',
              transition: 'background 0.2s'
            }}
          >
            {loading ? 'Ladataan...' : 'Kirjaudu sisään'}
          </button>

          <button
            type="button"
            onClick={handleRegister}
            disabled={loading}
            style={{
              padding: '12px',
              backgroundColor: 'transparent',
              color: '#93c5fd',
              border: '1px solid #3b82f6',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '15px'
            }}
          >
            Rekisteröidy uutena keräilijänä
          </button>
        </form>
      </div>
    </div>
  )
}
