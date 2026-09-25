import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chavePublica = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigurado = Boolean(url && chavePublica)

export const clienteSupabase = supabaseConfigurado
  ? createClient(url!, chavePublica!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // O link de entrada por e-mail só vale no navegador que o pediu.
        flowType: 'pkce',
        persistSession: true,
      },
    })
  : null
