import type { CanalId, Frequencia, Gatilho, Permissao, Rotina } from '@/fonte/tipos'

export const ROTULO_DO_GATILHO: Record<Gatilho, string> = {
  conversa: 'Conversa',
  mencao: 'Menção',
  coordenacao: 'Coordenação',
  rotina: 'Rotina',
  canal: 'Canal',
}

export const ROTULO_DA_FREQUENCIA: Record<Frequencia, string> = {
  diaria: 'Todo dia',
  semanal: 'Toda semana',
  mensal: 'Todo mês',
}

export const ROTULO_DO_CANAL: Record<CanalId, string> = {
  slack: 'Slack',
  whatsapp: 'WhatsApp',
  teams: 'Microsoft Teams',
  email: 'E-mail',
}

export const ROTULO_DA_PERMISSAO: Record<Permissao, string> = {
  ler: 'Ler',
  propor: 'Propor',
  executar: 'Executar',
}

export const DIAS_DA_SEMANA = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']

export function descreverFrequencia(rotina: Pick<Rotina, 'frequencia' | 'diaDaSemana' | 'horario'>): string {
  const quando =
    rotina.frequencia === 'semanal' && rotina.diaDaSemana
      ? `${['sábado', 'domingo'].includes(rotina.diaDaSemana) ? 'Todo' : 'Toda'} ${rotina.diaDaSemana}`
      : ROTULO_DA_FREQUENCIA[rotina.frequencia]
  return `${quando} às ${rotina.horario}`
}
