// O Playbook da Demonstração: um Playbook de exemplo, todo em memória, sem backend. Nada dele chega a um Workspace
// operacional, nem o contrário.

import {
  SECOES_DO_PLAYBOOK,
  type ConteudoDoPlaybook,
  type FonteDoPlaybook,
  type IdDaSecaoDoPlaybook,
  type SecaoDoPlaybook,
  type VersaoDoPlaybook,
} from './playbook-tipos'

interface VersaoGuardada extends VersaoDoPlaybook {
  conteudo: ConteudoDoPlaybook
}

const EXEMPLOS: Partial<Record<IdDaSecaoDoPlaybook, ConteudoDoPlaybook>> = {
  empresa: {
    texto: 'A Norte Sistemas vende software de gestão para incorporadoras de médio porte. Melhores clientes: incorporadoras com 5 a 30 lançamentos por ano.',
    linhas: [],
  },
  icp: {
    texto: 'Incorporadoras com 200 a 2.000 funcionários, com equipe comercial própria e lançamentos em mais de uma cidade.',
    linhas: [],
  },
  sla_e_metas: {
    texto: '',
    linhas: [
      {
        definicao: 'Em abordagem',
        criterio: '3 perfis mapeados e telefone válido',
        prazo: 'Antes do primeiro toque',
        meta: '100% das Contas',
      },
    ],
  },
  dor_e_percepcao: {
    texto: '',
    linhas: [
      {
        dor: 'Leads de lançamento sem resposta rápida',
        urgencia: 'Alta',
        consciencia: 'Alta',
        gravidade: 'Alta',
        frequencia: 'Toda semana',
        pergunta: 'Quanto tempo leva hoje entre o lead chegar e o primeiro contato?',
      },
    ],
  },
}

export function criarFonteDoPlaybookSimulada({
  autor = 'Ana Lima',
  agora = () => new Date().toISOString(),
}: { autor?: string; agora?: () => string } = {}): FonteDoPlaybook {
  const versoes = new Map<IdDaSecaoDoPlaybook, VersaoGuardada[]>()
  for (const [id, conteudo] of Object.entries(EXEMPLOS) as [IdDaSecaoDoPlaybook, ConteudoDoPlaybook][]) {
    versoes.set(id, [{ versao: 1, autor, em: '2026-09-01T12:00:00.000Z', conteudo }])
  }
  const ouvintes = new Set<() => void>()
  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte())

  function gravar(id: IdDaSecaoDoPlaybook, conteudo: ConteudoDoPlaybook): number {
    const lista = versoes.get(id) ?? []
    const versao = (lista[0]?.versao ?? 0) + 1
    versoes.set(id, [{ versao, autor, em: agora(), conteudo }, ...lista])
    avisar()
    return versao
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    async secao(id): Promise<SecaoDoPlaybook> {
      const lista = versoes.get(id) ?? []
      const nome = SECOES_DO_PLAYBOOK.find((secao) => secao.id === id)?.nome ?? id
      return {
        id,
        nome,
        vigente: lista[0] ?? null,
        historico: lista.map(({ versao, autor: quem, em }) => ({ versao, autor: quem, em })),
      }
    },
    async salvar(id, conteudo) {
      return gravar(id, conteudo)
    },
    async restaurar(id, versao) {
      const antiga = (versoes.get(id) ?? []).find((v) => v.versao === versao)
      if (!antiga) throw new Error('Esta versão do Playbook não existe.')
      return gravar(id, antiga.conteudo)
    },
  }
}
