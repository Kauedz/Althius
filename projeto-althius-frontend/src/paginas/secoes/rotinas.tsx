import { useState, type FormEvent } from 'react'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Button } from '@/components/ui/button'
import { useAmbiente, useDados, useFonte } from '@/fonte/contexto'
import type { Agente, CanalId, Frequencia, NovaRotina, Rotina } from '@/fonte/tipos'
import { useEscritaDeAgente, usePodeAdministrarAgentes } from '@/paginas/administracao-de-agentes'
import { descreverFrequencia, DIAS_DA_SEMANA, ROTULO_DA_FREQUENCIA, ROTULO_DO_CANAL } from '@/paginas/rotulos'

const numero = new Intl.NumberFormat('pt-BR')

/** O que o teto diz da Rotina: roda sozinha com o teto aprovado, ou por que não roda. Sem o dado (Demonstração), nada. */
function descreverTeto(rotina: Rotina): string | null {
  if (rotina.bloqueio === undefined) return null
  if (rotina.bloqueio === null) {
    return `Roda sozinha. ${numero.format(rotina.gastoNoMes ?? 0)} de ${numero.format(rotina.teto ?? 0)} créditos usados no mês.`
  }
  if (rotina.bloqueio === 'teto_atingido') {
    return 'Chegou no teto do mês: a Rotina fica pausada até o mês virar ou o teto subir.'
  }
  return 'Não roda sozinha: o Administrador aprova o teto mensal e liga o automático dela em Configurações › Automação e tetos.'
}

export function SecaoRotinas({ agente }: { agente: Agente }) {
  const fonte = useFonte()
  const rotinas = useDados((f) => f.rotinas(agente.id), [agente.id])
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const { disponivel } = useAmbiente()
  const podeAdministrar = usePodeAdministrarAgentes()

  return (
    <section aria-labelledby="titulo-rotinas" className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h2 id="titulo-rotinas" className="titulo-secao text-3xl">
            Rotinas
          </h2>
          <p className="text-al-muted">Tarefas que {agente.nome} executa sozinho, no horário combinado.</p>
        </div>
        {!criando && podeAdministrar && (
          <Button onClick={() => setCriando(true)} className="px-6 tracking-[0.04em]">
            Nova rotina
          </Button>
        )}
      </div>

      {/* Uma Rotina só roda quando o Agente executa; sem provedor de modelo, ela fica salva e a tela diz isso. */}
      {!disponivel('conversas') && (
        <Mensagem tipo="info">
          As Rotinas ficam salvas, mas ainda não rodam: executar um Agente ainda não está disponível neste Workspace.
        </Mensagem>
      )}

      {criando && (
        <FormularioDeRotina
          titulo="Nova rotina"
          rotuloDoBotao="Criar rotina"
          aoSalvar={async (rotina) => {
            await fonte.criarRotina({ ...rotina, agenteId: agente.id })
            setCriando(false)
          }}
          aoCancelar={() => setCriando(false)}
        />
      )}

      {!rotinas ? (
        <Carregando />
      ) : rotinas.length === 0 ? (
        <p className="text-al-muted">Nenhuma rotina ainda.</p>
      ) : (
        <ul className="flex flex-col border-t border-al-line">
          {rotinas.map((rotina) =>
            editandoId === rotina.id ? (
              <li key={rotina.id} className="border-b border-al-line py-4">
                <FormularioDeRotina
                  titulo="Editar rotina"
                  rotuloDoBotao="Salvar rotina"
                  inicial={rotina}
                  aoSalvar={async (dados) => {
                    await fonte.editarRotina(rotina.id, { ...dados, agenteId: agente.id })
                    setEditandoId(null)
                  }}
                  aoCancelar={() => setEditandoId(null)}
                />
              </li>
            ) : (
              <ItemDeRotina
                key={rotina.id}
                rotina={rotina}
                podeAdministrar={podeAdministrar}
                aoEditar={() => setEditandoId(rotina.id)}
              />
            ),
          )}
        </ul>
      )}
    </section>
  )
}

function ItemDeRotina({
  rotina,
  podeAdministrar,
  aoEditar,
}: {
  rotina: Rotina
  podeAdministrar: boolean
  aoEditar: () => void
}) {
  const fonte = useFonte()
  const { erro, escrever } = useEscritaDeAgente()
  return (
    <li aria-label={rotina.tarefa} className="flex items-start gap-6 border-b border-al-line py-4">
      <div className="flex flex-1 flex-col gap-1">
        <span className="font-normal">{rotina.tarefa}</span>
        <span className="text-sm text-al-muted">
          {descreverFrequencia(rotina)}
          {rotina.canalDestino && ` · envia no ${ROTULO_DO_CANAL[rotina.canalDestino]}`}
        </span>
        {!rotina.pausada && descreverTeto(rotina) && (
          <span className={rotina.bloqueio ? 'text-sm text-al-atencao' : 'text-sm text-al-muted'}>{descreverTeto(rotina)}</span>
        )}
        <Mensagem tipo="erro">{erro}</Mensagem>
      </div>
      {rotina.pausada && <span className="rounded-lg rotulo self-center border border-al-line px-2 py-1">Pausada</span>}
      {podeAdministrar && (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => escrever(() => fonte.definirRotinaPausada(rotina.id, !rotina.pausada))}>
            {rotina.pausada ? 'Retomar' : 'Pausar'}
          </Button>
          <Button variant="ghost" onClick={aoEditar}>
            Editar
          </Button>
          <Button variant="ghost" onClick={() => escrever(() => fonte.excluirRotina(rotina.id))}>
            Excluir
          </Button>
        </div>
      )}
    </li>
  )
}

function FormularioDeRotina({
  titulo,
  rotuloDoBotao,
  inicial,
  aoSalvar,
  aoCancelar,
}: {
  titulo: string
  rotuloDoBotao: string
  inicial?: Rotina
  aoSalvar: (rotina: Omit<NovaRotina, 'agenteId'>) => Promise<void>
  aoCancelar: () => void
}) {
  const canais = useDados((fonte) => fonte.canais(), []) ?? []
  const [tarefa, setTarefa] = useState(inicial?.tarefa ?? '')
  const [frequencia, setFrequencia] = useState<Frequencia>(inicial?.frequencia ?? 'semanal')
  const [diaDaSemana, setDiaDaSemana] = useState(inicial?.diaDaSemana ?? 'segunda')
  const [diaDoMes, setDiaDoMes] = useState(String(inicial?.diaDoMes ?? 1))
  const [horario, setHorario] = useState(inicial?.horario ?? '09:00')
  const [canalDestino, setCanalDestino] = useState<CanalId | ''>(inicial?.canalDestino ?? '')
  const { erro, escrever } = useEscritaDeAgente()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!tarefa.trim()) return
    await escrever(() =>
      aoSalvar({
        tarefa: tarefa.trim(),
        frequencia,
        diaDaSemana: frequencia === 'semanal' ? diaDaSemana : undefined,
        diaDoMes: frequencia === 'mensal' ? Number(diaDoMes) : undefined,
        horario,
        canalDestino: canalDestino || null,
      }),
    )
  }

  return (
    <form aria-label={titulo} onSubmit={enviar} className="cartao grid grid-cols-2 gap-4 p-6">
      <label className="col-span-2 flex flex-col gap-2">
        <span className="rotulo">Tarefa</span>
        <input required value={tarefa} onChange={(e) => setTarefa(e.target.value)} className="campo" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="rotulo">Frequência</span>
        <select value={frequencia} onChange={(e) => setFrequencia(e.target.value as Frequencia)} className="campo">
          {Object.entries(ROTULO_DA_FREQUENCIA).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </label>
      {frequencia === 'semanal' && (
        <label className="flex flex-col gap-2">
          <span className="rotulo">Dia da semana</span>
          <select value={diaDaSemana} onChange={(e) => setDiaDaSemana(e.target.value)} className="campo">
            {DIAS_DA_SEMANA.map((dia) => (
              <option key={dia} value={dia}>
                {dia}
              </option>
            ))}
          </select>
        </label>
      )}
      {frequencia === 'mensal' && (
        <label className="flex flex-col gap-2">
          <span className="rotulo">Dia do mês</span>
          <input
            type="number"
            min={1}
            max={28}
            required
            value={diaDoMes}
            onChange={(e) => setDiaDoMes(e.target.value)}
            className="campo"
          />
        </label>
      )}
      <label className="flex flex-col gap-2">
        <span className="rotulo">Horário</span>
        <input type="time" required value={horario} onChange={(e) => setHorario(e.target.value)} className="campo" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="rotulo">Canal de destino</span>
        <select value={canalDestino} onChange={(e) => setCanalDestino(e.target.value as CanalId | '')} className="campo">
          <option value="">Nenhum</option>
          {canais.map((canal) => (
            <option key={canal.id} value={canal.id} disabled={!canal.conectado}>
              {canal.nome}
              {!canal.conectado && ' (não conectado)'}
            </option>
          ))}
        </select>
      </label>
      <div className="col-span-2">
        <Mensagem tipo="erro">{erro}</Mensagem>
      </div>
      <div className="col-span-2 flex gap-2">
        <Button type="submit" className="px-6 tracking-[0.04em]">
          {rotuloDoBotao}
        </Button>
        <Button type="button" variant="ghost" onClick={aoCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
