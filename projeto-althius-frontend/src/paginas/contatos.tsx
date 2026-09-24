import { Building2, createLucideIcon, Mail, Phone, type LucideIcon } from 'lucide-react'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { useDadosDeContas, useFonteDeContas } from '@/fonte/contexto'
import type { ContaAlvo, Contato } from '@/fonte/contas-tipos'
import { cn } from '@/lib/utils'
import {
  AbasDoModulo,
  AvatarDoContato,
  CABECALHO,
  CELULA,
  CelulaUltimoContato,
  FalhaAoCarregar,
} from './modulo-contas-e-contatos'
import { posicaoDaAderencia } from './ordem-da-aderencia'

// O Lucide tirou os ícones de marca; este é o desenho do antigo "linkedin" dele, no mesmo traço dos outros dois.
const LinkedIn = createLucideIcon('linkedin', [
  ['path', { d: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z', key: 'c2jq2r' }],
  ['rect', { width: '4', height: '12', x: '2', y: '9', key: 'mk3on5' }],
  ['circle', { cx: '4', cy: '4', r: '2', key: 'bt5ra8' }],
])

const CANAIS: { canal: keyof Contato['canais']; rotulo: string; icone: LucideIcon }[] = [
  { canal: 'email', rotulo: 'E-mail', icone: Mail },
  { canal: 'telefone', rotulo: 'Telefone', icone: Phone },
  { canal: 'linkedin', rotulo: 'LinkedIn', icone: LinkedIn },
]

interface LinhaDeContato {
  contato: Contato
  /** A Conta-alvo do Contato. Sem ela na fonte, a linha fica sem empresa e vai para o fim. */
  conta?: ContaAlvo
}

/** Aderência da empresa, na ordem de grupos da Prioridade; depois o nome da empresa e o da pessoa. */
function compararLinhas(a: LinhaDeContato, b: LinhaDeContato): number {
  return (
    posicaoDaAderencia(a.conta?.aderencia) - posicaoDaAderencia(b.conta?.aderencia) ||
    (a.conta?.nome ?? '').localeCompare(b.conta?.nome ?? '', 'pt-BR') ||
    a.contato.nome.localeCompare(b.contato.nome, 'pt-BR')
  )
}

/** A aba Contatos: as pessoas de todas as Contas-alvo, numa ordem fixa. A linha não é clicável. */
export function PaginaContatos() {
  const fonte = useFonteDeContas()
  // As contas vêm junto: dão o nome e a Aderência da empresa de cada Contato.
  const { dados, carregando, erro, recarregar } = useDadosDeContas(
    (f) => Promise.all([f.contatos(), f.contas()]),
    [],
  )

  const hoje = fonte.hoje()
  const [contatos, contas] = dados ?? []
  const contasPorId = new Map(contas?.map((conta) => [conta.id, conta]))
  const linhas = (contatos ?? [])
    .map((contato) => ({ contato, conta: contasPorId.get(contato.contaId) }))
    .toSorted(compararLinhas)

  return (
    <Pagina titulo="Contatos" icone={Building2} ocupaAJanela>
      <AbasDoModulo />

      <div className="flex items-end justify-between gap-8">
        <h2 className="sr-only">Contatos</h2>
        <p className="text-sm text-al-muted">Pessoas das Contas-alvo, organizadas para a próxima abordagem.</p>
        {contatos && (
          <span className="text-[0.8125rem] whitespace-nowrap text-al-muted">
            <strong className="font-normal text-al-ink">{contatos.length}</strong>{' '}
            {contatos.length === 1 ? 'contato' : 'contatos'}
          </span>
        )}
      </div>

      {carregando && <Carregando />}

      {erro && <FalhaAoCarregar mensagem="Não foi possível carregar os contatos." tentarDeNovo={recarregar} />}

      {!carregando && !erro && contatos?.length === 0 && (
        <p className="py-12 text-sm text-al-muted">
          Nenhum Contato ainda. As pessoas aparecem aqui quando vierem do CRM, de enriquecimento ou de um Agente.
        </p>
      )}

      {!carregando && !erro && linhas.length > 0 && (
        // O mesmo quadro da tabela de Contas: cabeçalho fixo na rolagem vertical e o Nome fixo na horizontal.
        <div className="min-h-0 overflow-auto">
          <table
            aria-label="Tabela de Contatos"
            className="w-full min-w-[74rem] table-fixed border-separate border-spacing-0 text-left text-sm"
          >
            <thead>
              <tr>
                <th scope="col" className={cn(CABECALHO, 'left-0 z-3 w-52.5')}>
                  Nome
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-52.5')}>
                  Cargo
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-45')}>
                  Empresa
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-37.5')}>
                  Área
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-42.5')}>
                  Persona
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-37.5')}>
                  Dados de contato
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-30')}>
                  Último contato
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ contato, conta }) => (
                <tr key={contato.id} className="h-11">
                  <td className={cn(CELULA, 'sticky left-0 z-1 bg-al-bg')}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AvatarDoContato contato={contato} />
                      <span className="truncate text-al-ink">{contato.nome}</span>
                    </div>
                  </td>
                  <td className={CELULA}>
                    <TextoOuTraco texto={contato.cargo} />
                  </td>
                  <td className={CELULA}>
                    <TextoOuTraco texto={conta?.nome} />
                  </td>
                  <td className={CELULA}>
                    <TextoOuTraco texto={contato.area} />
                  </td>
                  <td className={CELULA}>
                    <TextoOuTraco texto={contato.persona} />
                  </td>
                  <td className={CELULA}>
                    <DadosDeContato canais={contato.canais} />
                  </td>
                  <td className={CELULA}>
                    <CelulaUltimoContato data={contato.ultimoContatoEm} hoje={hoje} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Pagina>
  )
}

/** O texto que a fonte entrega, numa linha só, ou "—" quando falta. */
function TextoOuTraco({ texto }: { texto?: string }) {
  if (!texto) {
    return <span className="text-al-muted">—</span>
  }
  return (
    <span title={texto} className="block truncate">
      {texto}
    </span>
  )
}

/** Um ícone por canal: o disponível normal e o ausente apagado. Só a disponibilidade, sem valores nem links. */
function DadosDeContato({ canais }: { canais: Contato['canais'] }) {
  return (
    <span className="flex items-center gap-2.5">
      {CANAIS.map(({ canal, rotulo, icone: Icone }) => {
        const nome = `${rotulo} ${canais[canal] ? 'disponível' : 'não disponível'}`
        return (
          <span key={canal} role="img" aria-label={nome} title={nome}>
            <Icone
              strokeWidth={1.8}
              className={cn('size-4', canais[canal] ? 'text-al-ink' : 'text-al-muted opacity-45')}
              aria-hidden
            />
          </span>
        )
      })}
    </span>
  )
}
