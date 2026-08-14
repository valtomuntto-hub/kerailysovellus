import {useState} from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  // 1. Tilanmuuttujat (State) lomakkeen tiedoille ja tilalle
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // 2. Kirjautumisen käsittely
  const handleLogin = async (e) => {
    e.preventDefault() // Estää sivun uudenlatautumisen
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

  // 3. Rekisteröitymisen käsittely
  const handleSignup = async (e) => {
    e.preventDefault() // Estää sivun uudenlatautumisen
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Rekisteröityminen onnistui! Tarkista sähköpostisi.')
    }
    setLoading(false) // Asetetaan lataus pois päältä
  }
  return (
    <div>
      <h2>Kirjaudu sisään / rekisteröidy</h2>
      {/* näytetään viesti, jos sellainen on */}
      {message && <p>{message}</p>}
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Sähköposti"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Salasana"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {/* kutsutaan kirjautumisen käsittelyfunktiota */}
        <button type="submit" disabled={loading}>
          kirjaudu sisään
        </button>
        <button type="button" onClick={handleSignup} disabled={loading}>
          rekisteröidy
        </button>
      </form>
    </div>
  )
}