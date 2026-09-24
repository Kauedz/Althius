import { ArrowUp, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { cn } from '@/lib/utils'
import { AcaoDoMockup, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Mensagem } from '../componentes'
import type { Secao } from '../dados'
import { useMockup } from '../estado'

/** O Resumo da memória: lido por todos, mantido pela IA e editado só por Administradores. */
export function ResumoDaMemoria() {
  const { resumo, ehAdministrador, simularAtualizacaoDaIA } = useMockup()
  const [editando, setEditando] = useState(false)
  const autoria = resumo.automatico
    ? `Atualizado automaticamente ${resumo.atualizadoEm} pelo ${resumo.atualizadoPor}`
    : `Atualizado ${resumo.atualizadoEm} por ${resumo.atualizadoPor}`

  return (
    <section aria-label="Resumo da memória" className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h3 className="titulo-secao text-2xl">Resumo da memória</h3>
            <span className="selo">
              <Sparkles strokeWidth={1.8} className="size-3 text-al-accent" aria-hidden />
              Mantido pela IA
            </span>
          </div>
          <span className="text-sm text-al-muted">{autoria}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AcaoDoMockup aoClicar={simularAtualizacaoDaIA}>Simular atualização da IA</AcaoDoMockup>
          {ehAdministrador && !editando && (
            <button type="button" onClick={() => setEditando(true)} className={BOTAO_SECUNDARIO}>
              Editar resumo
            </button>
          )}
        </div>
      </div>

      <p className="max-w-3xl text-sm text-al-muted">
        O que os Agentes sabem da Databricks. Eles atualizam este resumo sozinhos com o que aprendem nas Execuções, sem passar por Aprovações.{' '}
        {ehAdministrador ? 'Como Administrador, você também pode editar.' : 'Só Administradores editam.'} O ICP e as Personas ficam nas próprias abas e
        continuam mudando só com aprovação.
      </p>

      {editando ? (
        <EdicaoDoResumo aoTerminar={() => setEditando(false)} />
      ) : (
        <div className="cartao flex flex-col gap-6 p-6">
          {resumo.secoes.map((secao) => (
            <div key={secao.titulo} className="flex flex-col gap-1.5">
              <h4 className="flex items-center gap-2 text-lg font-normal">
                {secao.titulo}
                {resumo.secaoAtualizada === secao.titulo && (
                  <span className="selo h-5 border-al-sucesso/60 text-al-sucesso">Atualizado agora</span>
                )}
              </h4>
              <p className="leading-relaxed text-al-ink/90">{secao.texto}</p>
            </div>
          ))}
        </div>
      )}

      <ConversaSobreOResumo />
    </section>
  )
}

function EdicaoDoResumo({ aoTerminar }: { aoTerminar: () => void }) {
  const { resumo, editarResumo } = useMockup()
  const [secoes, setSecoes] = useState<Secao[]>(resumo.secoes)
  const [erro, setErro] = useState<string | null>(null)

  function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (secoes.some((s) => !s.texto.trim())) {
      setErro('Nenhuma seção pode ficar vazia.')
      return
    }
    const falha = editarResumo(secoes.map((s) => ({ ...s, texto: s.texto.trim() })))
    if (falha) {
      setErro(falha)
      return
    }
    aoTerminar()
  }

  return (
    <form aria-label="Editar resumo" noValidate onSubmit={salvar} className="cartao flex flex-col gap-5 p-6">
      {secoes.map((secao, i) => (
        <div key={secao.titulo} className="flex flex-col gap-1.5">
          <label htmlFor={`resumo-${i}`} className="rotulo">
            {secao.titulo}
          </label>
          <textarea
            id={`resumo-${i}`}
            rows={3}
            value={secao.texto}
            onChange={(e) => setSecoes((atuais) => atuais.map((s, j) => (j === i ? { ...s, texto: e.target.value } : s)))}
            className="campo leading-relaxed"
          />
        </div>
      ))}
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <div className="flex gap-2">
        <button type="submit" className={BOTAO_PRIMARIO}>
          Salvar resumo
        </button>
        <button type="button" onClick={aoTerminar} className={BOTAO_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function ConversaSobreOResumo() {
  const { conversarComOResumo, visitante } = useMockup()
  const [mensagem, setMensagem] = useState('')
  const [conversa, setConversa] = useState<{ autor: string; texto: string; ehIA: boolean }[]>([])

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!mensagem.trim()) return
    const resposta = conversarComOResumo(mensagem)
    setConversa((atual) => [
      ...atual,
      { autor: visitante.nome, texto: mensagem.trim(), ehIA: false },
      { autor: 'Althius', texto: resposta, ehIA: true },
    ])
    setMensagem('')
  }

  return (
    <div className="flex flex-col gap-4">
      {conversa.length > 0 && (
        <ol role="log" aria-label="Conversa sobre o resumo" className="flex flex-col gap-3">
          {conversa.map((item, i) => (
            <li key={i} className={cn('flex flex-col gap-0.5 border-l-2 pl-4', item.ehIA ? 'border-al-accent' : 'border-al-line')}>
              <span className="text-sm font-normal">
                {item.autor}
                {item.ehIA && <span className="rotulo ml-2">IA</span>}
              </span>
              <p className={cn(item.ehIA && 'text-al-muted')}>{item.texto}</p>
            </li>
          ))}
        </ol>
      )}
      <form aria-label="Conversar sobre o resumo" onSubmit={enviar} className="composer flex-row items-end">
        <label htmlFor="conversa-resumo" className="sr-only">
          Pergunte ou atualize as informações
        </label>
        <textarea
          id="conversa-resumo"
          rows={1}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder="Pergunte ou atualize as informações"
          className="pb-4!"
        />
        <button
          type="submit"
          aria-label="Enviar"
          disabled={!mensagem.trim()}
          className="m-2 grid size-9 shrink-0 place-items-center rounded-full bg-al-accent text-al-on-accent transition-opacity disabled:opacity-40"
        >
          <ArrowUp strokeWidth={2} className="size-4" aria-hidden />
        </button>
      </form>
    </div>
  )
}
