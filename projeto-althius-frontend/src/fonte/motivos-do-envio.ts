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
  destination_is_sender_account:
    'o número do Contato é o da própria Conta remetente de WhatsApp; troque o telefone do Contato ou a Conta remetente e ative os envios de novo',
  invite_already_sent: 'já existe um convite pendente para este perfil no LinkedIn',
  invite_note_too_long: 'a nota do convite passou do limite do LinkedIn',
  linkedin_profile_invalid: 'o endereço do LinkedIn do Contato não é de um perfil',
  linkedin_profile_not_found: 'o LinkedIn não encontrou o perfil do Contato',
  insufficient_credits: 'os créditos do LinkedIn desta conta acabaram',
  subscription_required: 'esta ação do LinkedIn pede uma assinatura que a conta não tem',
  linkedin_not_connected: 'o Contato ainda não é conexão de primeiro grau no LinkedIn',
  linkedin_inmail_not_supported:
    'o InMail não é enviado pela Althius; troque o passo para Convite ou Mensagem e ative os envios de novo',
  not_connected: 'o Contato não é uma conexão no LinkedIn',
  recipient_not_found: 'o LinkedIn não encontrou o destinatário',
  provider_limit_reached: 'o LinkedIn atingiu o limite de envios desta conta',
  invite_already_pending: 'já existe um convite pendente para este perfil no LinkedIn',
  profile_lookup_failed: 'não foi possível consultar o perfil no LinkedIn',
  profile_lookup_timeout: 'o LinkedIn demorou demais para responder sobre o perfil',
  timeout: 'o provedor não respondeu a tempo',
  network: 'a conexão com o provedor caiu',
  unreadable_response: 'o provedor respondeu sem confirmar o envio',
  // Os anexos do passo (canais-10).
  attachment_not_stored: 'o anexo do passo não está mais guardado; anexe o arquivo de novo e ative os envios',
  attachment_type_not_supported: 'o canal deste passo não aceita o tipo do anexo',
  attachment_too_large: 'o anexo passa do tamanho que o canal deste passo aceita',
  too_many_attachments: 'o passo tem mais anexos do que o canal aceita',
  attachment_not_supported_on_invite: 'o convite do LinkedIn não leva anexo',
  attachment_not_supported: 'este canal não aceita anexos',
  attachment_download_failed: 'não foi possível ler o anexo; o passo será tentado de novo',
  // Descadastro (cadencia/descadastro-e-variaveis).
  contact_suppressed: 'o Contato se descadastrou e não recebe mais e-mails deste Workspace',
  message_changed:
    'os dados da mensagem mudaram depois da autorização; revise a prévia e reconfirme o passo',
}

export function motivoDoEnvio(codigo: string): string {
  // "missing_variable:cargo,empresa": a variável sem valor segura o passo de E-mail até o dado ou o texto mudar.
  if (codigo.startsWith('missing_variable:')) {
    const nomes = codigo.slice('missing_variable:'.length).split(',').filter(Boolean).map((nome) => `{{${nome}}}`)
    return `o passo usa variáveis sem valor para este Contato (${nomes.join(', ')}); preencha o dado ou ajuste o texto e reconfirme`
  }
  return MOTIVOS[codigo] ?? codigo
}
