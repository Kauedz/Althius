import { Popover } from '@base-ui/react/popover'
import { createLucideIcon, Mail, Phone, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ContaAlvo, Contato } from '@/fonte/contas-tipos'
import { useDados, useFonteDeContas } from '@/fonte/contexto'
import type { SecaoDoDocumento } from '@/fonte/tipos'
import { cn } from '@/lib/utils'
import { AcoesDoContato } from './arquivar-e-apagar'
import { BotaoDeFotoDoContato } from './botao-de-foto-do-contato'
import { AvatarDoContato, CABECALHO, CELULA, CelulaUltimoContato } from './modulo-contas-e-contatos'
import type { EstadoDaNavegacao } from './voltar-para-a-lista'

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

/** Se o Contato tem pelo menos um dos canais que a coluna Dados de contato mostra. */
export const temDadosDeContato = (contato: Contato) => CANAIS.some(({ canal }) => contato.canais[canal])

export interface LinhaDeContato {
  contato: Contato
  /** A Conta-alvo do Contato. Sem ela na fonte, a linha fica sem empresa. */
  conta?: ContaAlvo
}

/**
 * A tabela de Contatos, na ordem em que as linhas chegam. A linha não é clicável; o nome da empresa leva à Conta-alvo.
 * No detalhe de uma Conta-alvo, a coluna Empresa sai: todas as linhas são da mesma empresa.
 */
export function TabelaDeContatos({
  linhas,
  hoje,
  rotulo,
  comEmpresa = true,
  estadoDoLink,
}: {
  linhas: LinhaDeContato[]
  hoje: Date
  rotulo: string
  comEmpresa?: boolean
  /** O estado da navegação do link da empresa, para o detalhe saber voltar a esta lista. */
  estadoDoLink?: EstadoDaNavegacao
}) {
  // A Persona do Contato aponta para a definição vigente na Memória do Workspace, lida uma vez para a tabela toda.
  const personas = useDados((fonte) => fonte.memoriaDoWorkspace(), [])?.personas.secoes
  // Arquivar e apagar (CRM-18) só existem onde a fonte os oferece: a Demonstração não ganha coluna.
  const fonteDeContas = useFonteDeContas()
  const comAcoes = !!(fonteDeContas.arquivarContato || fonteDeContas.apagarContato)

  return (
    <table
      aria-label={rotulo}
      className={cn(
        'w-full table-fixed border-separate border-spacing-0 text-left text-sm',
        comEmpresa ? 'min-w-[74rem]' : 'min-w-[63rem]',
      )}
    >
      <thead>
        <tr>
          <th scope="col" className={cn(CABECALHO, 'left-0 z-3 w-52.5')}>
            Nome
          </th>
          <th scope="col" className={cn(CABECALHO, 'w-52.5')}>
            Cargo
          </th>
          {comEmpresa && (
            <th scope="col" className={cn(CABECALHO, 'w-45')}>
              Empresa
            </th>
          )}
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
          {comAcoes && (
            <th scope="col" className={cn(CABECALHO, 'w-20')}>
              Ações
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {linhas.map(({ contato, conta }) => (
          <tr key={`${contato.id}:${contato.contaId}`} className="h-11">
            <td className={cn(CELULA, 'sticky left-0 z-1 bg-al-bg')}>
              <div className="flex min-w-0 items-center gap-2.5">
                <AvatarDoContato contato={contato} />
                <span className="truncate text-al-ink">{contato.nome}</span>
                <BotaoDeFotoDoContato contato={contato} />
              </div>
            </td>
            <td className={CELULA}>
              <TextoOuTraco texto={contato.cargo} />
            </td>
            {comEmpresa && (
              <td className={CELULA}>
                {conta ? (
                  <Link
                    to={`/contas/${conta.id}`}
                    state={estadoDoLink}
                    title={conta.nome}
                    className="block truncate text-al-ink hover:text-al-accent hover:underline"
                  >
                    {conta.nome}
                  </Link>
                ) : (
                  <TextoOuTraco />
                )}
              </td>
            )}
            <td className={CELULA}>
              <TextoOuTraco texto={contato.area} />
            </td>
            <td className={CELULA}>
              <CelulaPersona persona={contato.persona} personas={personas} />
            </td>
            <td className={CELULA}>
              <DadosDeContato canais={contato.canais} />
            </td>
            <td className={CELULA}>
              <CelulaUltimoContato data={contato.ultimoContatoEm} hoje={hoje} />
            </td>
            {comAcoes && (
              <td className={CELULA}>
                <AcoesDoContato contato={contato} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
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

/**
 * A Persona do Contato, ou "—" sem Persona. O nome abre a definição vigente dela na Memória do Workspace, lida a cada
 * abertura da tabela: o Contato guarda só o nome.
 */
function CelulaPersona({ persona, personas }: { persona?: string; personas?: SecaoDoDocumento[] }) {
  const definicao = personas?.find((p) => p.titulo === persona)?.texto
  if (!persona || !definicao) return <TextoOuTraco texto={persona} />
  return (
    <Popover.Root>
      <Popover.Trigger className="block max-w-full cursor-pointer truncate text-left underline decoration-al-muted/60 decoration-dotted underline-offset-2 hover:decoration-al-ink">
        {persona}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
          <Popover.Popup className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 border border-al-line bg-al-surface p-4 text-sm text-al-ink shadow-md outline-none">
            <Popover.Title className="font-normal">{persona}</Popover.Title>
            <Popover.Description className="leading-relaxed text-al-muted">{definicao}</Popover.Description>
            <Link to="/configuracoes/memoria/personas" className="rotulo text-al-ink underline-offset-4 hover:underline">
              Ver na Memória do Workspace
            </Link>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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
