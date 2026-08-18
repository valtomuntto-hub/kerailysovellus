import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
    }
    setLoading(false)
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Rekisteröityminen onnistui! Tarkista sähköpostisi.')
    }
    setLoading(false)
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
          Kirjaudu sisään tai rekisteröidy jatkaaksesi
        </p>
        
        {message && (
          <p style={{ color: '#fca5a5', fontWeight: 'bold', textAlign: 'center', fontSize: '14px', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px' }}>
            {message}
          </p>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input
            type="email"
            placeholder="Sähköposti"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            placeholder="Salasana"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            onClick={handleSignup} 
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
            Rekisteröidy uutena käyttäjänä
          </button>
        </form>
      </div>
    </div>
  )
}