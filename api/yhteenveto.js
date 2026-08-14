// Tiedosto: api/yhteenveto.js
export default function handler(req, res) {
  // Salli vain POST
  if (req.method !== 'POST') {
    return res.status(405).json({ virhe: 'Käytä POST-metodia' });
  }

  const tuotteet = req.body?.tuotteet;
  if (!Array.isArray(tuotteet) || tuotteet.length === 0) {
    return res.status(400).json({ virhe: 'Tuotelista puuttuu' });
  }

  let tilattuYhteensa = 0;
  let kerattyYhteensa = 0;
  let rivitKeratty = 0;

  for (const t of tuotteet) {
    const tilattu = Number(t.määrä) || 0;
    const keratty = Number(t.kerattyMaara) || 0;
    tilattuYhteensa += tilattu;
    kerattyYhteensa += keratty;
    if (t.kerätty || keratty >= tilattu) rivitKeratty += 1;
  } // <-- Tähän päättyy VAIN for-silmukka!

  const puuttuu = Math.max(0, tilattuYhteensa - kerattyYhteensa);
  const prosentti =
    tilattuYhteensa === 0
      ? 0
      : Math.round((kerattyYhteensa / tilattuYhteensa) * 100);

  // Palautetaan tiedot (kenttien nimet sovitettu Reactia varten)
  return res.status(200).json({
    raporttejaYhteensa: 1,
    rivienMaara: tuotteet.length,
    rivitKeratty,
    yhteensaTilattu: tilattuYhteensa,
    yhteensaKeratty: kerattyYhteensa,
    puuttuuYhteensa: puuttuu,
    prosentti,
    viesti: `Kerätty ${kerattyYhteensa}/${tilattuYhteensa} kpl (${prosentti}%)`
  });
}