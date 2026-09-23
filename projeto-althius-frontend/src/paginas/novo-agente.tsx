import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconeAgente } from '@/components/marca'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useDados, useFonte } from '@/fonte/contexto'
import { nomeDeAgenteCriado } from '@/fonte/regras'
import type { EspecialidadeId } from '@/fonte/tipos'

/**
 * Formulário simulado de "Novo agente" (ADR 0005): o Cliente escolhe uma das 4 Especialidades do
 * catálogo fixo, escreve o complemento do nome e, se quiser, instruções. Não há como criar Especialidade.
 */
export function DialogoNovoAgente({ aberto, aoMudar }: { aberto: boolean; aoMudar: (aberto: boolean) => void }) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="gap-6 p-6 sm:max-w-2xl">
        {/* Remonta a cada abertura: o formulário começa sempre vazio. */}
        {aberto && <Formulario aoFechar={() => aoMudar(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Formulario({ aoFechar }: { aoFechar: () => void }) {
  const fonte = useFonte()
  const navegar = useNavigate()
  const especialidades = useDados((f) => f.especialidades(), []) ?? []
  const [especialidadeId, setEspecialidadeId] = useState<EspecialidadeId | null>(null)
  const [complemento, setComplemento] = useState('')
  const [instrucoes, setInstrucoes] = useState('')
  const [erro, setErro] = useState('')
  const [criando, setCriando] = useState(false)

  const escolhida = especialidades.find((e) => e.id === especialidadeId)
  const podeCriar = escolhida !== undefined && complemento.trim() !== '' && !criando

  async function criar(evento: FormEvent) {
    evento.preventDefault()
    if (!podeCriar) return
    setCriando(true)
    try {
      const agente = await fonte.criarAgente({ especialidadeId: escolhida.id, complemento, instrucoes })
      aoFechar()
      navegar(`/agentes/${agente.id}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar o agente.')
      setCriando(false)
    }
  }

  return (
    <form onSubmit={criar} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <DialogTitle className="titulo-secao text-2xl">Novo agente</DialogTitle>
        <DialogDescription className="text-al-muted">
          Escolha a Especialidade. O agente começa com a personalização, as permissões e as habilidades do agente padrão dela.
        </DialogDescription>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="rotulo mb-2">Especialidade</legend>
        <div role="radiogroup" aria-label="Especialidade" className="grid grid-cols-2 gap-2">
          {especialidades.map((especialidade) => (
            <label
              key={especialidade.id}
              className="flex cursor-pointer items-start gap-3 border border-al-line p-4 hover:border-al-muted has-[:checked]:border-al-ink has-[:checked]:bg-al-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-al-accent"
            >
              <input
                type="radio"
                name="especialidade"
                className="sr-only"
                aria-label={especialidade.nome}
                value={especialidade.id}
                checked={especialidadeId === especialidade.id}
                onChange={() => {
                  setEspecialidadeId(especialidade.id)
                  setErro('')
                }}
              />
              <IconeAgente especialidade={especialidade.id} />
              <span className="flex flex-col gap-1">
                <span className="font-normal">{especialidade.nome}</span>
                <span className="text-sm text-al-muted">{especialidade.rotulo}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="complemento" className="rotulo">
          Complemento do nome
        </label>
        <div className="flex items-center gap-2">
          <span className="font-normal whitespace-nowrap">{escolhida ? `${escolhida.nome} ·` : 'Especialidade ·'}</span>
          <input
            id="complemento"
            value={complemento}
            onChange={(e) => {
              setComplemento(e.target.value)
              setErro('')
            }}
            placeholder="Ex.: Enterprise LATAM"
            className="campo"
          />
        </div>
        {escolhida && complemento.trim() && (
          <p className="text-sm text-al-muted">
            O agente vai se chamar <span className="text-al-ink">{nomeDeAgenteCriado(escolhida, complemento)}</span>. O nome
            não muda depois.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="instrucoes-novo-agente" className="rotulo">
          Instruções (opcional)
        </label>
        <textarea
          id="instrucoes-novo-agente"
          rows={3}
          value={instrucoes}
          onChange={(e) => setInstrucoes(e.target.value)}
          placeholder="Ex.: pontue só Contas-alvo enterprise no Brasil, no México e na Colômbia."
          className="campo"
        />
      </div>

      {erro && (
        <p role="alert" className="text-sm text-al-erro">
          {erro}
        </p>
      )}

      <DialogFooter className="flex gap-2">
        <Button type="button" variant="ghost" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!podeCriar} className="px-6 tracking-rotulo uppercase">
          Criar agente
        </Button>
      </DialogFooter>
    </form>
  )
}
