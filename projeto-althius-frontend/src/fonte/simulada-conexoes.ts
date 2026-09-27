// A tela Conexões da Demonstração: o catálogo de exemplo, com tudo habilitado e o Acesso simulado. O estado vem da
// fonte simulada dos Agentes, que as outras telas também leem.

import type { ConexaoDoCatalogo, FonteDeConexoes } from './conexoes-tipos'
import type { CanalId, FonteDeAgentes, IntegracaoId } from './tipos'

const idDaFutura = (nome: string) => nome.toLowerCase().replace(/\s+/g, '-')

export function criarFonteDeConexoesSimulada(fonte: FonteDeAgentes): FonteDeConexoes {
  return {
    observar: (ouvinte) => fonte.observar(ouvinte),
    async catalogo() {
      const [canais, integracoes, futuras] = await Promise.all([fonte.canais(), fonte.integracoes(), fonte.integracoesFuturas()])
      return [
        ...canais.map<ConexaoDoCatalogo>((canal) => ({
          id: canal.id,
          tipo: 'canal',
          nome: canal.nome,
          descricao: canal.descricao,
          disponivel: true,
          habilitada: true,
          acesso: { conectado: canal.conectado },
          temPrevia: true,
        })),
        ...integracoes.map<ConexaoDoCatalogo>((integracao) => ({
          id: integracao.id,
          tipo: 'integracao',
          nome: integracao.nome,
          descricao: integracao.descricao,
          categoria: integracao.categoria,
          disponivel: true,
          habilitada: true,
          acesso: { conectado: integracao.conectada },
        })),
        ...futuras.map<ConexaoDoCatalogo>((futura) => ({
          id: idDaFutura(futura.nome),
          tipo: 'integracao',
          nome: futura.nome,
          descricao: '',
          categoria: futura.categoria,
          disponivel: false,
          habilitada: false,
        })),
      ]
    },
    async podeHabilitar() {
      return (await fonte.workspace()).papel === 'administrador'
    },
    // Na Demonstração, toda Conexão disponível já está habilitada.
    async habilitar() {},
    conectar: (id) => fonte.conectar(id as CanalId | IntegracaoId),
  }
}
