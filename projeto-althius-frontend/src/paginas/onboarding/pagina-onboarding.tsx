// O onboarding fora da Casca: o wizard do Day0 e, no fim dele, o checklist do Norte.
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LogoDoWorkspace } from '@/components/logos'
import { Carregando } from '@/components/marca'
import { useAmbiente, useDados, useFonteDeOnboarding } from '@/fonte/contexto'
import { normalizarDominio } from '@/fonte/dominio-do-site'
import {
  ORIGENS_HDYHAU,
  PAPEIS_DO_DAY0,
  type FonteDeOnboarding,
  type OrigemHdyhau,
  type PapelNoDay0,
} from '@/fonte/onboarding-tipos'
import { EtapaChecklist } from './checklist'
import { Campo, EscolhaUnica, PARAMETRO_DE_CONVITE, type PropsDaEtapa } from './componentes'
import { Moldura } from './moldura'
import { Day0Operacional } from './day0-operacional'

/**
 * Onboarding fora da Casca. O estado vem só da Fonte de onboarding. Sem link de convite, a pessoa entra como
 * criadora; o parâmetro `convite` no endereço simula a chegada por um link de convite.
 */
export function PaginaOnboarding() {
  const ambiente = useAmbiente()
  return ambiente.modo === 'real' ? <Day0Operacional /> : <PaginaOnboardingDaDemonstracao />
}

function PaginaOnboardingDaDemonstracao() {
  const fonte = useFonteDeOnboarding()
  const estado = useDados(fonte, (f) => f.ler(), [])
  const [parametros] = useSearchParams()
  const chegouPorConvite = parametros.has(PARAMETRO_DE_CONVITE)

  useEffect(() => {
    void fonte.dispensarRetorno()
    void fonte.retomar()
  }, [fonte])

  const precisaIniciar = estado !== undefined && !estado.ramo
  useEffect(() => {
    if (precisaIniciar) void fonte.iniciar(chegouPorConvite ? 'convidado' : 'criador')
  }, [fonte, precisaIniciar, chegouPorConvite])

  if (!estado?.ramo) return <Carregando rotulo="Carregando onboarding" />
  // Os rascunhos valem só no ramo em que foram feitos: a troca de ramo da demonstração recomeça do zero.
  return <Wizard key={estado.ramo} estado={estado} fonte={fonte} />
}

/**
 * O que a pessoa escolheu ou digitou num passo do Day0 e ainda não confirmou com Continuar. Fica na tela, e não na
 * Fonte, até ser confirmado: Voltar e Continuar mudam de passo sem perder o rascunho.
 */
interface Rascunho {
  papel?: PapelNoDay0
  empresa?: string
  dominio?: string
  comoConheceu?: OrigemHdyhau
  /** Os e-mails do convite nunca vão para a Fonte: nada é enviado nem guardado. */
  emails?: string
}

interface PropsDoPasso extends PropsDaEtapa {
  rascunho: Rascunho
  rascunhar: (mudanca: Rascunho) => void
}

function Wizard({ estado, fonte }: PropsDaEtapa) {
  const [rascunho, setRascunho] = useState<Rascunho>({})
  const passo: PropsDoPasso = {
    estado,
    fonte,
    rascunho,
    rascunhar: (mudanca) => setRascunho((atual) => ({ ...atual, ...mudanca })),
  }

  switch (estado.etapa) {
    case 'papel':
      return <EtapaPapel {...passo} />
    case 'empresa':
      return <EtapaEmpresa {...passo} />
    case 'dominio':
      return <EtapaDominio {...passo} />
    case 'hdyhau':
      return <EtapaHdyhau {...passo} />
    case 'convite':
      return <EtapaConvite {...passo} />
    case 'checklist':
      return <EtapaChecklist estado={estado} fonte={fonte} />
  }
}

function EtapaPapel({ estado, fonte, rascunho, rascunhar }: PropsDoPasso) {
  const papel = rascunho.papel ?? estado.papel
  return (
    <Moldura
      estado={estado}
      fonte={fonte}
      titulo="Qual é o seu papel?"
      continuar={{ disabled: !papel, aoContinuar: () => papel && void fonte.definirPapel(papel) }}
    >
      <EscolhaUnica rotulo="Papel" opcoes={PAPEIS_DO_DAY0} valor={papel} aoEscolher={(valor) => rascunhar({ papel: valor })} />
    </Moldura>
  )
}

function EtapaEmpresa({ estado, fonte, rascunho, rascunhar }: PropsDoPasso) {
  const nome = rascunho.empresa ?? estado.empresa
  const sugerido = nome.trim()
  return (
    <Moldura
      estado={estado}
      fonte={fonte}
      titulo="Qual é a sua empresa?"
      continuar={{ disabled: !sugerido, aoContinuar: () => void fonte.definirCliente(sugerido) }}
    >
      <Campo rotulo="Empresa">
        <input
          className="campo"
          aria-label="Empresa"
          placeholder="Nome da empresa"
          value={nome}
          onChange={(evento) => rascunhar({ empresa: evento.target.value })}
        />
      </Campo>
      <p>Nome sugerido do Workspace e do Cliente: {sugerido || 'aguardando o nome'}.</p>
      <p>O Workspace é criado para você com esse nome. Nenhuma Conta-alvo nasce daqui.</p>
    </Moldura>
  )
}

function EtapaDominio({ estado, fonte, rascunho, rascunhar }: PropsDoPasso) {
  const dominio = rascunho.dominio ?? estado.dominio
  const host = normalizarDominio(dominio)
  const logo = usePreviaDoLogo(fonte, host, host === estado.dominio ? estado.logoDoSite : null)
  const nome = estado.workspace?.nomeSugerido || estado.empresa
  return (
    <Moldura
      estado={estado}
      fonte={fonte}
      titulo="Qual é o site da empresa?"
      continuar={{ disabled: !host, aoContinuar: () => host && void fonte.definirDominio(host) }}
    >
      <Campo rotulo="Domínio do site">
        <input
          className="campo"
          aria-label="Domínio do site"
          inputMode="url"
          placeholder="empresa.com.br"
          value={dominio}
          onChange={(evento) => rascunhar({ dominio: evento.target.value })}
        />
      </Campo>
      <div className="flex items-center gap-3">
        <LogoDoWorkspace nome={nome} endereco={logo} className="size-10" />
        <p>O logo do Workspace vem do site. Sem logo, fica a inicial de {nome}.</p>
      </div>
      <p>
        Ao continuar, a Althius lê o site para sugerir o que você vende, o ICP provável e as Personas possíveis. É só
        uma base: você revisa tudo no checklist, e pode seguir enquanto a leitura acontece.
      </p>
    </Moldura>
  )
}

const ESPERA_DA_PREVIA_MS = 300

/**
 * A prévia do logo do domínio que a pessoa está digitando, procurada pela Fonte quando a digitação para. Enquanto
 * ela não chega, vale o logo já guardado do domínio confirmado.
 */
function usePreviaDoLogo(fonte: FonteDeOnboarding, host: string | null, guardado: string | null) {
  const [previa, setPrevia] = useState<{ host: string; logo: string | null } | null>(null)
  useEffect(() => {
    if (!host) return
    let valendo = true
    const espera = setTimeout(() => {
      void fonte.buscarLogo(host).then((logo) => {
        if (valendo) setPrevia({ host, logo })
      })
    }, ESPERA_DA_PREVIA_MS)
    return () => {
      valendo = false
      clearTimeout(espera)
    }
  }, [fonte, host])
  if (!host) return null
  return previa?.host === host ? previa.logo : guardado
}

function EtapaHdyhau({ estado, fonte, rascunho, rascunhar }: PropsDoPasso) {
  const origem = rascunho.comoConheceu ?? estado.comoConheceu
  return (
    <Moldura
      estado={estado}
      fonte={fonte}
      titulo="Como nos conheceu?"
      continuar={{ disabled: !origem, aoContinuar: () => origem && void fonte.definirComoConheceu(origem) }}
    >
      <EscolhaUnica
        rotulo="Como nos conheceu?"
        opcoes={ORIGENS_HDYHAU}
        valor={origem}
        aoEscolher={(valor) => rascunhar({ comoConheceu: valor })}
      />
    </Moldura>
  )
}

function EtapaConvite({ estado, fonte, rascunho, rascunhar }: PropsDoPasso) {
  const emails = rascunho.emails ?? ''
  return (
    <Moldura
      estado={estado}
      fonte={fonte}
      titulo="Convide colegas"
      continuar={{ disabled: !emails.trim(), aoContinuar: () => void fonte.confirmarConvite() }}
      pular={{ rotulo: 'Pular convite', aoPular: () => void fonte.pularConvite() }}
    >
      <p>Este passo é só demonstração. Nenhum e-mail é enviado e nenhuma Participação no Workspace é criada.</p>
      <Campo rotulo="E-mails">
        <input
          className="campo"
          aria-label="E-mails dos colegas"
          placeholder="colegas@empresa.com"
          value={emails}
          onChange={(evento) => rascunhar({ emails: evento.target.value })}
        />
      </Campo>
    </Moldura>
  )
}
