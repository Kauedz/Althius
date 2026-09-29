// A importação de Contas e Contatos por CSV no Workspace operacional (CRM-07). O arquivo vai pela Edge Function
// `csv-import`, que o guarda no bucket privado e o lê; o mapeamento, a prévia, as decisões, a confirmação e o
// processamento em blocos são funções do banco, que conferem Participação e papel por `auth.uid()`. O navegador nunca
// grava Conta, Contato ou Vínculo: só pede, e mostra o que o banco devolve.

import type { SupabaseClient } from '@supabase/supabase-js'
import { corpoDoErroDaFuncao, motivoDaFalhaDaFuncao } from './falha-da-edge-function'
import type {
  CampoDoCsv,
  ContagensDoLote,
  ContaDistribuivel,
  DecisaoDoContato,
  EstadoDoLote,
  FonteDeImportacaoDeContas,
  LinhaDaImportacao,
  LoteDeImportacao,
  Mapeamento,
  PreviaDaLinha,
  ResumoDaPrevia,
  ResumoDeLote,
  SituacaoDaLinha,
} from './importacao-tipos'

/** Os campos do banco (private.import_fields) de cada campo da tela. */
const CAMPO_NO_BANCO: Record<CampoDoCsv, string> = {
  nomeDaEmpresa: 'company_name',
  urlDaEmpresa: 'company_url',
  identificadorLegal: 'company_legal_identifier',
  linkedinDaEmpresa: 'company_linkedin',
  segmento: 'company_segment',
  nomeDoContato: 'contact_name',
  cargo: 'contact_role',
  email: 'contact_email',
  telefone: 'contact_phone',
  linkedinDoContato: 'contact_linkedin',
}

const ESTADO: Record<string, EstadoDoLote> = {
  uploading: 'enviando',
  mapping: 'mapeando',
  preview: 'previa',
  processing: 'processando',
  completed: 'concluido',
  failed: 'falhou',
  cancelled: 'cancelado',
}

const SITUACAO: Record<string, SituacaoDaLinha> = {
  pending: 'pendente',
  invalid: 'invalida',
  created: 'criada',
  updated: 'atualizada',
  linked: 'vinculada',
  skipped: 'ignorada',
  failed: 'falhou',
}

const DECISAO_NO_BANCO: Record<DecisaoDoContato, string> = {
  atualizar: 'update',
  vincular: 'link',
  transferir: 'transfer',
  ignorar: 'skip',
}
const DECISAO: Record<string, DecisaoDoContato> = Object.fromEntries(
  Object.entries(DECISAO_NO_BANCO).map(([decisao, banco]) => [banco, decisao as DecisaoDoContato]),
)

const FILTRO_NO_BANCO = {
  todas: 'all',
  invalidas: 'invalid',
  decisoes: 'decisions',
  conflitos: 'conflicts',
  problemas: 'problems',
} as const

/** Por que a leitura do arquivo falhou, como a Edge Function grava no lote. */
const MOTIVO_DA_FALHA: Record<string, string> = {
  empty_file: 'O arquivo está vazio ou não tem nenhuma linha de dados.',
  malformed_csv: 'O arquivo tem um campo entre aspas que não fecha. Confira as aspas e envie de novo.',
  too_many_rows: 'O arquivo tem mais de 5.000 linhas de dados. Divida-o em arquivos menores.',
  too_many_columns: 'O arquivo tem mais de 100 colunas.',
  invalid_encoding: 'Não foi possível ler os caracteres do arquivo. Salve-o como CSV em UTF-8 e envie de novo.',
  storage_failed: 'Não foi possível guardar o arquivo. Envie de novo.',
  internal_error: 'Não foi possível ler o arquivo. Envie de novo.',
}

/** Os motivos de uma linha, do banco para quem importa. */
const MOTIVO_DA_LINHA: Record<string, string> = {
  company_name_required: 'Falta o nome da empresa.',
  company_url_required: 'Falta a URL da empresa.',
  company_url_invalid: 'A URL da empresa não é válida.',
  contact_name_required: 'Falta o nome do Contato, obrigatório quando a linha traz dados de Contato.',
  contact_email_invalid: 'O e-mail do Contato não é válido.',
  contact_phone_invalid: 'O telefone do Contato não é válido: informe o DDD ou o código do país.',
  value_too_long: 'Um dos valores passa de 500 caracteres.',
  contact_identity_conflict: 'O e-mail, o telefone e o LinkedIn desta linha pertencem a Contatos diferentes.',
  account_not_responsible: 'A Conta já existe e é de outro Vendedor responsável: ela não foi alterada.',
  contact_not_permitted: 'Você não pode gerenciar os Contatos desta Conta: o Contato não foi alterado.',
  decision_required: 'O Contato já existia e faltou decidir o que fazer com ele.',
  contact_skipped_by_user: 'O Contato desta linha foi ignorado, como você decidiu.',
  no_changes: 'Nada mudou: os dados já estavam no Workspace.',
  duplicate_identity: 'Outro Contato com o mesmo e-mail, telefone ou LinkedIn foi criado ao mesmo tempo.',
  not_permitted: 'Você não tem permissão para gravar esta linha.',
  unexpected_error: 'Não foi possível gravar esta linha.',
}

const CAMPO_DA_CONTA: Record<string, string> = {
  name: 'nome',
  legal_identifier: 'identificador legal',
  linkedin_url: 'LinkedIn da empresa',
  segment: 'segmento',
}
const CAMPO_DO_CONTATO: Record<string, string> = {
  name: 'nome',
  role: 'cargo',
  email: 'e-mail',
  phone: 'telefone',
  linkedin: 'LinkedIn',
}

interface ResumoDoBanco {
  id: string
  file_name: string
  status: string
  delimiter: string | null
  has_header: boolean
  headers: string[]
  row_count: number
  mapping: Record<string, number>
  replace_manual: boolean
  error_code: string | null
  is_mine: boolean
  created_at: string
  finished_at: string | null
  counts: Record<string, number>
  preview: Record<string, number>
}

interface RegistroDeLote {
  batch_id: string
  file_name: string
  status: string
  row_count: number
  is_mine: boolean
  created_at: string
}

interface RegistroDeLinha {
  line_number: number
  status: string
  cells: string[]
  parsed: Record<string, string>
  preview: Record<string, unknown>
  decision: string | null
  error_codes: string[]
  outcome: { account?: string; contact?: string; changed?: string[]; preserved?: string[] }
}

interface RegistroDeContaDistribuivel {
  target_account_id: string
  account_name: string
  owner_user_id: string
  distributable_until: string
}

const texto = (valor: unknown): string[] => (Array.isArray(valor) ? valor.map(String) : [])
const rotulos = (campos: unknown, nomes: Record<string, string>) => texto(campos).map((campo) => nomes[campo] ?? campo)

/** Uma recusa do banco, na linguagem de quem importa; o que não é recusa vira a falha genérica. */
function converterErro(error: { message: string; code?: string }): Error {
  const recusas: [string, string][] = [
    ['decisions are pending', 'Decida o que fazer com os Contatos que já existem antes de confirmar.'],
    ['no valid rows to import', 'Nenhuma linha válida para importar. Corrija o mapeamento ou o arquivo.'],
    ['company name and company url columns are required', 'Indique as colunas do nome e da URL da empresa.'],
    ['a column can be mapped to one field only', 'Cada coluna do arquivo alimenta um campo só.'],
    ['mapped column does not exist', 'A coluna escolhida não existe no arquivo.'],
    ['import batch not found', 'Importação não encontrada.'],
    ['import batch can no longer be mapped', 'Esta importação já foi confirmada e não aceita outro mapeamento.'],
    ['import batch is not in preview', 'Esta importação não está mais na prévia.'],
    ['import batch is not processing', 'Esta importação não está em processamento.'],
    ['import batch can no longer be cancelled', 'Esta importação já foi confirmada e não pode ser descartada.'],
    ['active workspace membership required', 'Só quem participa do Workspace importa arquivos nele.'],
    ['only administrators can distribute imported target accounts', 'Só um Administrador distribui as Contas de uma importação.'],
    ['the new responsible seller must be an active participant', 'O novo responsável precisa ser um participante ativo do Workspace.'],
    ['the distribution window of this import has closed', 'A distribuição desta importação só vale até 24 horas depois dela.'],
    ['imported target account was already distributed', 'Uma dessas Contas já foi distribuída.'],
    ['target account already has a sequence', 'Uma dessas Contas já tem Sequência e não pode mudar de responsável.'],
    ['target account is not in this import batch', 'Uma dessas Contas não pertence a esta importação.'],
  ]
  const recusa = recusas.find(([trecho]) => error.message.includes(trecho))
  return new Error(recusa ? recusa[1] : 'Não foi possível concluir a operação. Tente de novo.')
}

function mapearMapeamento(mapeamento: Record<string, number>): Mapeamento {
  const resultado: Mapeamento = {}
  for (const [campo, chave] of Object.entries(CAMPO_NO_BANCO) as [CampoDoCsv, string][]) {
    if (typeof mapeamento[chave] === 'number') resultado[campo] = mapeamento[chave]
  }
  return resultado
}

function mapearLote(resumo: ResumoDoBanco): LoteDeImportacao {
  const contagem = (chave: string) => resumo.counts?.[chave] ?? 0
  const previa = (chave: string) => resumo.preview?.[chave] ?? 0
  const contagens: ContagensDoLote = {
    total: contagem('total'),
    pendentes: contagem('pending'),
    criadas: contagem('created'),
    atualizadas: contagem('updated'),
    vinculadas: contagem('linked'),
    ignoradas: contagem('skipped'),
    comFalha: contagem('failed'),
    invalidas: contagem('invalid'),
  }
  const resumoDaPrevia: ResumoDaPrevia = {
    contasNovas: previa('account_create'),
    contasAtualizadas: previa('account_update'),
    contasIgnoradas: previa('account_skip'),
    contatosNovos: previa('contact_create'),
    contatosExistentes: previa('contact_match'),
    decisoesPendentes: previa('decisions_pending'),
    conflitos: previa('conflicts'),
  }
  return {
    id: resumo.id,
    arquivo: resumo.file_name,
    estado: ESTADO[resumo.status] ?? 'falhou',
    ...(resumo.error_code
      ? { motivoDaFalha: MOTIVO_DA_FALHA[resumo.error_code] ?? 'Não foi possível ler o arquivo.' }
      : {}),
    colunas: resumo.headers ?? [],
    ...(resumo.delimiter ? { delimitador: resumo.delimiter } : {}),
    primeiraLinhaEhCabecalho: resumo.has_header,
    mapeamento: mapearMapeamento(resumo.mapping ?? {}),
    substituirCorrigidosAMao: resumo.replace_manual,
    ehMeu: resumo.is_mine,
    criadoEm: resumo.created_at,
    ...(resumo.finished_at ? { concluidoEm: resumo.finished_at } : {}),
    contagens,
    previa: resumoDaPrevia,
  }
}

function mapearPreviaDaLinha(previa: Record<string, unknown>): PreviaDaLinha | undefined {
  if (!previa.account_action) return undefined
  const contato = previa.contact_match
  return {
    conta: previa.account_action === 'create' ? 'criar' : previa.account_action === 'update' ? 'atualizar' : 'ignorar',
    ...(typeof previa.account_name === 'string' ? { contaExistente: previa.account_name } : {}),
    camposDaConta: rotulos(previa.account_changes, CAMPO_DA_CONTA),
    conflitosDaConta: rotulos(previa.account_conflicts, CAMPO_DA_CONTA),
    ...(contato === 'none'
      ? { contato: 'novo' as const }
      : contato === 'existing'
        ? { contato: 'existente' as const }
        : contato === 'in_file'
          ? { contato: 'repetido-no-arquivo' as const }
          : {}),
    ...(typeof previa.contact_name === 'string' ? { contatoExistente: previa.contact_name } : {}),
    outrosVinculos: Array.isArray(previa.contact_links)
      ? previa.contact_links.map((vinculo) => String((vinculo as { name?: unknown }).name ?? ''))
      : [],
    camposDoContato: rotulos(previa.contact_changes, CAMPO_DO_CONTATO),
    conflitosDoContato: rotulos(previa.contact_conflicts, CAMPO_DO_CONTATO),
    precisaDecidir: previa.needs_decision === true,
    podeTransferir: previa.can_transfer === true,
  }
}

/** O campo de "conta.nome" ou "contato.nome", como o resultado da linha o registra, na palavra de quem importa. */
function rotuloDoCampo(campo: string): string {
  const [entidade, nome] = campo.split('.')
  return (entidade === 'account' ? CAMPO_DA_CONTA : CAMPO_DO_CONTATO)[nome] ?? nome
}

function mapearLinha(linha: RegistroDeLinha): LinhaDaImportacao {
  const situacao = SITUACAO[linha.status] ?? 'falhou'
  const atualizados = texto(linha.outcome?.changed).map(rotuloDoCampo)
  const preservados = texto(linha.outcome?.preserved).map(rotuloDoCampo)
  return {
    numero: linha.line_number,
    situacao,
    celulas: linha.cells ?? [],
    ...(linha.parsed?.company_name ? { empresa: linha.parsed.company_name } : {}),
    ...(linha.parsed?.contact_name ? { contato: linha.parsed.contact_name } : {}),
    motivos: texto(linha.error_codes).map((codigo) => MOTIVO_DA_LINHA[codigo] ?? codigo),
    observacoes: [
      ...(atualizados.length > 0 ? [`Campos atualizados: ${atualizados.join(', ')}.`] : []),
      ...(preservados.length > 0 ? [`Valores escritos à mão preservados: ${preservados.join(', ')}.`] : []),
    ],
    ...(situacao === 'pendente' ? { previa: mapearPreviaDaLinha(linha.preview ?? {}) } : {}),
    ...(linha.decision && DECISAO[linha.decision] ? { decisao: DECISAO[linha.decision] } : {}),
  }
}

export function criarFonteDeImportacaoSupabase(
  cliente: SupabaseClient,
  obterWorkspaceId: () => string,
  aoMudarOsDados: () => void,
): FonteDeImportacaoDeContas {
  function workspace(): string {
    const id = obterWorkspaceId()
    if (!id) throw new Error('Nenhum Workspace ativo foi selecionado.')
    return id
  }

  /** Chama a função do banco; uma recusa chega com a mensagem para quem importa. */
  async function chamar<T>(funcao: string, parametros: Record<string, unknown>): Promise<T> {
    const { data, error } = await cliente.rpc(funcao, parametros)
    if (error) throw converterErro(error)
    return data as T
  }

  async function lote(id: string): Promise<LoteDeImportacao> {
    return mapearLote(await chamar<ResumoDoBanco>('get_import_batch', { p_batch_id: id }))
  }

  return {
    async lotes() {
      const registros = await chamar<RegistroDeLote[]>('list_import_batches', { p_workspace_id: workspace() })
      return (registros ?? []).map((registro): ResumoDeLote => ({
        id: registro.batch_id,
        arquivo: registro.file_name,
        estado: ESTADO[registro.status] ?? 'falhou',
        ehMeu: registro.is_mine,
        totalDeLinhas: registro.row_count,
        criadoEm: registro.created_at,
      }))
    },

    async enviarArquivo(arquivo) {
      const formulario = new FormData()
      formulario.append('workspaceId', workspace())
      formulario.append('file', arquivo, arquivo.name)
      const { data, error } = await cliente.functions.invoke('csv-import', { body: formulario })
      if (error) {
        const recusa = await corpoDoErroDaFuncao(error)
        if (typeof recusa?.error === 'string') throw new Error(recusa.error)
        throw new Error(`Não foi possível enviar o arquivo. ${await motivoDaFalhaDaFuncao('csv-import', error, 'APP_ORIGIN')}`)
      }
      const loteId = (data as { batchId?: unknown } | null)?.batchId
      if (typeof loteId !== 'string') throw new Error('O backend não devolveu a importação criada.')
      return lote(loteId)
    },

    lote,

    async visualizar(id, { mapeamento, primeiraLinhaEhCabecalho, substituirCorrigidosAMao }) {
      const banco: Record<string, number> = {}
      for (const [campo, coluna] of Object.entries(mapeamento) as [CampoDoCsv, number][]) {
        banco[CAMPO_NO_BANCO[campo]] = coluna
      }
      return mapearLote(
        await chamar<ResumoDoBanco>('preview_import_batch', {
          p_batch_id: id,
          p_mapping: banco,
          p_has_header: primeiraLinhaEhCabecalho,
          p_replace_manual: substituirCorrigidosAMao,
        }),
      )
    },

    async linhas(id, filtro, deslocamento, limite) {
      const registros = await chamar<RegistroDeLinha[]>('list_import_rows', {
        p_batch_id: id,
        p_filter: FILTRO_NO_BANCO[filtro],
        p_limit: limite,
        p_offset: deslocamento,
      })
      return (registros ?? []).map(mapearLinha)
    },

    decidir(id, decisao, linhas) {
      return chamar<number>('set_import_decisions', {
        p_batch_id: id,
        p_line_numbers: linhas ?? null,
        p_decision: DECISAO_NO_BANCO[decisao],
      })
    },

    async confirmar(id) {
      return mapearLote(await chamar<ResumoDoBanco>('confirm_import_batch', { p_batch_id: id }))
    },

    async processarBloco(id) {
      const processado = mapearLote(await chamar<ResumoDoBanco>('process_import_chunk', { p_batch_id: id }))
      // Cada bloco pode criar Contas e Contatos: as listas do Workspace precisam reler.
      aoMudarOsDados()
      return processado
    },

    async cancelar(id) {
      await chamar('cancel_import_batch', { p_batch_id: id })
    },

    async contasDistribuiveis(id) {
      const registros = await chamar<RegistroDeContaDistribuivel[]>('list_import_distributable_accounts', {
        p_batch_id: id,
      })
      return (registros ?? []).map((registro): ContaDistribuivel => ({
        contaId: registro.target_account_id,
        nome: registro.account_name,
        responsavelId: registro.owner_user_id,
        distribuivelAte: registro.distributable_until,
      }))
    },

    async distribuir(id, distribuicao) {
      const alteradas = await chamar<number>('distribute_imported_target_accounts', {
        p_workspace_id: workspace(),
        p_import_batch_id: id,
        p_target_account_ids: distribuicao.map((item) => item.contaId),
        p_user_ids: distribuicao.map((item) => item.responsavelId),
      })
      aoMudarOsDados()
      return alteradas
    },
  }
}
