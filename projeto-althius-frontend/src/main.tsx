import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RaizDoAplicativo } from '@/raiz'
import { criarServicosDoNavegador } from '@/auth/servicos-do-navegador'
import { clienteSupabase } from '@/supabase/cliente'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RaizDoAplicativo cliente={clienteSupabase} servicos={criarServicosDoNavegador()} />
  </StrictMode>,
)
