import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://mklwphkaweczmhhrizth.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_h1rDpkN8n1vFZ-3GMhJEbA_pN1KfBjr'

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase-asetukset puuttuvat. Lisää VITE_SUPABASE_URL ja VITE_SUPABASE_ANON_KEY Vercelin Environment Variables -kohtaan ja tee uusi deploy.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
