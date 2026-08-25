// Kevyt HTTP-client paikallista Keräilylista-API:a varten (korvaa aiemman Supabase-clientin).
// API pyörii Win2022VM:llä samassa lähiverkossa kuin SQL Server - puhelin/tabletti
// pitää olla samassa WiFi-verkossa jotta yhteys toimii.
const API_URL = import.meta.env.VITE_API_URL || 'http://192.168.2.144:3001';
const TOKEN_KEY = 'keruu_token';
const NIMI_KEY = 'keruu_nimi';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setSession(token, nimi) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(NIMI_KEY, nimi);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NIMI_KEY);
}

function getSession() {
  const token = getToken();
  const nimi = localStorage.getItem(NIMI_KEY);
  return token && nimi ? { token, nimi } : null;
}

async function apiFetch(polku, options = {}) {
  const token = getToken();

  const vastaus = await fetch(`${API_URL}${polku}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await vastaus.json().catch(() => ({}));

  if (!vastaus.ok) {
    throw new Error(data.virhe || `Pyyntö epäonnistui (HTTP ${vastaus.status})`);
  }

  return data;
}

export const api = {
  async login(nimi, pin) {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ nimi, pin }),
    });
    setSession(data.token, data.nimi);
    return data;
  },

  async register(nimi, pin) {
    return apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ nimi, pin }),
    });
  },

  logout() {
    clearSession();
  },

  haeTuotteet() {
    return apiFetch('/api/tuotteet');
  },

  haeRaportit() {
    return apiFetch('/api/keruutulokset');
  },

  tallennaKeruu(tuotteet) {
    return apiFetch('/api/keruutulokset', {
      method: 'POST',
      body: JSON.stringify({ tuotteet }),
    });
  },

  yhteenveto(tuotteet) {
    return apiFetch('/api/yhteenveto', {
      method: 'POST',
      body: JSON.stringify({ tuotteet }),
    });
  },

  getSession,
};
