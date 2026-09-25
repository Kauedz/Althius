import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RaizDoAplicativo } from '@/raiz'
import { clienteSupabase } from '@/supabase/cliente'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RaizDoAplicativo cliente={clienteSupabase} />
  </StrictMode>,
)
