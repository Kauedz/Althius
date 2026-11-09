// O Contexto da empresa nas telas (spec contexto-da-empresa): os três textos do AI Context — Empresa, Perfil de
// cliente ideal e Personas — com a versão vigente. É o contrato único para quem consulta o contexto; o Workspace
// operacional lê do banco e a Demonstração usa a implementação simulada.

import type { FonteObservavel } from './tipos'

/** Os três textos, sempre juntos. Primário e secundários são partes escritas do mesmo texto de ICP. */
export interface TextosDoContexto {
  empresa: string
  icp: string
  personas: string
}

/** Outra gravação chegou antes: a tela mantém o rascunho e pede para recarregar. */
export const ERRO_CONTEXTO_MUDOU =
  'Outra pessoa salvou o contexto enquanto você editava. Seu texto continua aqui: copie o que quiser manter e recarregue para ver a versão atual.'

export const TEXTOS_VAZIOS: TextosDoContexto = { empresa: '', icp: '', personas: '' }

/** Os três campos, na ordem da tela. */
export const CAMPOS_DO_CONTEXTO = [
  {
    id: 'empresa',
    nome: 'Empresa',
    ajuda: 'O que a empresa faz e vende: ofertas, problemas que resolve e diferenciais.',
  },
  {
    id: 'icp',
    nome: 'Perfil de cliente ideal',
    ajuda: 'As companhias atendidas: ICP primário e secundários, características, necessidades e exclusões.',
  },
  {
    id: 'personas',
    nome: 'Personas',
    ajuda: 'Quem compra dentro dessas empresas: cargos, responsabilidades, objetivos, dores e papel na compra.',
  },
] as const satisfies readonly { id: keyof TextosDoContexto; nome: string; ajuda: string }[]

/** De onde veio a versão: escrita à mão ou aceita de uma leitura do site. */
export type OrigemDoContexto = 'manual' | 'geracao'

export interface VersaoDoContexto extends TextosDoContexto {
  versao: number
  origem: OrigemDoContexto
  /** O nome de quem gravou, ou nulo quando a pessoa já não está no Workspace (ou foi a geração automática). */
  autor: string | null
  /** ISO 8601. */
  em: string
}

/** Por que a leitura do site não rendeu o contexto, em palavras do produto. */
export type MotivoDaFalhaDaGeracao = 'site_insuficiente' | 'site_indisponivel' | 'sem_motor' | 'saida_invalida' | 'falhou'

export const MOTIVOS_DA_FALHA_DA_GERACAO: Record<MotivoDaFalhaDaGeracao, string> = {
  site_insuficiente:
    'O site não traz informação suficiente para descrever a empresa, os clientes ideais e as personas. Nada foi inventado: escreva os textos à mão ou tente de novo depois de atualizar o site.',
  site_indisponivel: 'Não conseguimos abrir o site. Confira o endereço e tente de novo, ou escreva os textos à mão.',
  sem_motor: 'A leitura do site não está disponível agora. Escreva os textos à mão ou tente de novo mais tarde.',
  saida_invalida: 'A leitura não produziu os três textos. Tente de novo ou escreva os textos à mão.',
  falhou: 'A leitura do site falhou. Tente de novo ou escreva os textos à mão.',
}

/** A leitura do site mais recente que ainda pede atenção: em andamento, com sugestão para decidir ou com falha. */
export type GeracaoDoContexto =
  | { id: string; site: string; estado: 'gerando'; iniciadaEm: string }
  | { id: string; site: string; estado: 'sugestao'; textos: TextosDoContexto; fontes: string[]; iniciadaEm: string }
  | { id: string; site: string; estado: 'falha'; motivo: MotivoDaFalhaDaGeracao; iniciadaEm: string }

export interface ContextoDaEmpresa {
  /** O site cadastrado da empresa; vazio quando ninguém informou. */
  site: string
  /** A versão vigente; nula enquanto ninguém escreveu nem gerou. */
  vigente: VersaoDoContexto | null
  /** A leitura do site que pede atenção; nula quando não há nenhuma. */
  geracao: GeracaoDoContexto | null
}

export interface FonteDoContextoDaEmpresa extends FonteObservavel {
  /** O contexto vigente. Toda Participação ativa consulta. */
  contexto(): Promise<ContextoDaEmpresa>
  /**
   * Grava os três textos como a próxima versão, que fica vigente na hora. Só Administrador. `versaoEsperada` é a versão
   * que a tela mostrava (nula sem versão): se outra gravação chegou antes, recusa sem sobrescrever. Devolve a versão.
   */
  salvar(textos: TextosDoContexto, versaoEsperada: number | null): Promise<number>
  /**
   * Começa a leitura do site (o informado, que passa a ser o cadastrado, ou o já cadastrado). Só Administrador. Volta
   * logo; o andamento aparece em `contexto().geracao`. Sem contexto, a primeira leitura completa fica vigente sozinha;
   * com contexto, vira sugestão. Repetir durante a leitura reaproveita a mesma.
   */
  gerar(site?: string): Promise<void>
  /** Aceita a sugestão: os textos dela viram a próxima versão, se a vigente ainda é `versaoEsperada`. */
  aceitarSugestao(geracaoId: string, versaoEsperada: number | null): Promise<number>
  /** Descarta a sugestão (ou dispensa o aviso de falha), conservando a versão vigente. */
  descartarGeracao(geracaoId: string): Promise<void>
}

export function textosIguais(a: TextosDoContexto, b: TextosDoContexto): boolean {
  return a.empresa === b.empresa && a.icp === b.icp && a.personas === b.personas
}

export function contextoVazio(textos: TextosDoContexto): boolean {
  return !textos.empresa.trim() && !textos.icp.trim() && !textos.personas.trim()
}
