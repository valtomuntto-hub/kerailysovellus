import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://mklwphkaweczmhhrizth.supabase.co'

const jwtAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbHdwaGthd2Vjem1oaHJpenRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjU2ODksImV4cCI6MjEwMTk0MTY4OX0.zTes5nAqLTaWKI5aRgcXbow9RCWrXkDXlxMpMkV65Cw'

const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseAnonKey = envKey?.startsWith('eyJ') ? envKey : jwtAnonKey

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase-asetukset puuttuvat. Lisää VITE_SUPABASE_URL ja VITE_SUPABASE_ANON_KEY Vercelin Environment Variables -kohtaan ja tee uusi deploy.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
