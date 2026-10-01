// O porquê de um passo não ter saído, em português, a partir do código que o banco grava em `last_error` (E-mail,
// WhatsApp e LinkedIn). Um código sem tradução aparece como veio, para o motivo nunca sumir da tela.
const MOTIVOS: Record<string, string> = {
  sender_not_ready: 'sua Conta remetente deste canal não está pronta para enviar',
  owner_not_responsible: 'só o Vendedor responsável, com Participação ativa, envia este passo',
  step_missing: 'o passo não existe mais no documento da Sequência',
  channel_not_enabled: 'o envio por este canal ainda não foi liberado na Althius',
  contact_unlinked: 'o Contato saiu da Conta-alvo',
  destination_changed: 'o Destino do Contato mudou depois da confirmação',
  invalid_phone: 'o telefone do Contato não é um número de WhatsApp válido',
  invite_already_sent: 'já existe um convite pendente para este perfil no LinkedIn',
  invite_note_too_long: 'a nota do convite passou do limite do LinkedIn',
  linkedin_profile_invalid: 'o endereço do LinkedIn do Contato não é de um perfil',
  linkedin_profile_not_found: 'o LinkedIn não encontrou o perfil do Contato',
  profile_lookup_failed: 'não foi possível consultar o perfil no LinkedIn',
  profile_lookup_timeout: 'o LinkedIn demorou demais para responder sobre o perfil',
  timeout: 'o provedor não respondeu a tempo',
  network: 'a conexão com o provedor caiu',
  unreadable_response: 'o provedor respondeu sem confirmar o envio',
}

export function motivoDoEnvio(codigo: string): string {
  return MOTIVOS[codigo] ?? codigo
}
