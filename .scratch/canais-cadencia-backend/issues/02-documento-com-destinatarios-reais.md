# 02: Documento da Sequência com destinatários reais

**What to build:** tornar persistente o documento da Sequência, seus participantes, destinos e passos de E-mail, LinkedIn e WhatsApp, mantendo lista, detalhe da Conta-alvo e Conversa como leituras do mesmo objeto. O desenho existente permanece, e SMS, Ligação e Tarefa deixam de ser opções de criação e edição.

**Blocked by:** 01: Acesso real e responsabilidade exclusiva.

**Status:** closed

- [x] O Vendedor responsável cadastra e consulta e-mail, número de WhatsApp normalizado e identidade LinkedIn reais nos Contatos participantes.
- [x] A Sequência persiste participantes confirmados, passos ordenados, conteúdo, objetivo, delay em dias úteis, janela e canal.
- [x] Somente E-mail, LinkedIn e WhatsApp podem ser gravados em passos novos ou alterados; o backend rejeita canais fora do escopo.
- [x] Lista, detalhe da Conta-alvo e Conversa refletem a mesma versão persistida da Sequência sem divergência entre sessões.
- [x] Outro participante vê apenas o resumo público e não recebe o documento privado para ser ocultado somente no navegador.
- [x] Dados fictícios, métricas de demonstração e destinos de exemplo não podem autorizar nem alimentar execução real.
- [x] A aparência existente permanece, exceto pela retirada funcional de SMS, Ligação e Tarefa.

## Comments

### 2026-09-26: conferência com dados reais

Na pré-produção, no Workspace A, com as sessões reais do Vendedor responsável e do Outro Membro, pelo Chromium headless:

- **Conta-alvo e Contato.** Uma Conta-alvo nova recebeu um Contato com e-mail, telefone e LinkedIn. No banco ficaram `contato.<n>@example.com`, `+55119…` (E.164) e `https://www.linkedin.com/in/…`, e o destino aparece no passo ("Destino: +5511935122873").
- **Canais.** O menu "Adicionar step" só oferece E-mail, LinkedIn e WhatsApp.
- **Persistência.** A Sequência criada a partir da Conta-alvo real aparece na lista, e um passo adicionado continua lá depois de recarregar.
- **Outro Membro.** Vê só o "Resumo da Conta-alvo": status, participantes e etapas, sem o documento.
- **Conversa.** Não foi conferida: o módulo de Agentes está indisponível no modo operacional.

Prints:
- [Conta-alvo com Contato](prints/02-conta-com-contato.jpg)
- [menu de canais](prints/02-menu-de-canais.jpg)
- [Sequência com passo](prints/02-sequencia-com-passos.jpg)
- [visão do Outro Membro](prints/02-outro-membro.jpg)

**Defeito que impede fechar:**
- **Sintoma.** Dois passos adicionados em seguida (LinkedIn e, cerca de 1 s depois, WhatsApp) deixaram só o WhatsApp no documento gravado.
- **Causa.** `handleAdicionarStep`, em `detalhe-sequencia.tsx`, monta `[...sequencia.steps, novoStep]` com o estado da última renderização, e `atualizarDocumento` grava `steps` inteiro. Se o segundo clique vem antes de a Sequência ser relida, ele sobrescreve o primeiro.
- **Alcance.** O mesmo padrão aparece em mover, excluir e editar passos e em mudar participantes.
- **Fechamento.** Corrigir com um teste de regressão, conferir de novo e fechar.

Dados de conferência na pré-produção: três Contas-alvo `Conferência canais-02 <n>`, cada uma com um Contato, e uma Sequência.

### 2026-09-26: correção da perda de passos

- **Correção.** `detalhe-sequencia.tsx` serializa as alterações do documento numa fila. Cada uma parte da Sequência mais recente que a tela conhece: a última gravada ou, sem gravação pendente, a última lida. Os handlers passam a montar o patch sobre esse documento, e não sobre o estado da renderização. A correção vale também para editar, mover e excluir passos e para mudar participantes e janela. A gravação a cada tecla deixa de poder chegar fora de ordem.
- **Regressão.** Novo teste em `detalhe-sequencia.test.tsx`: dois passos seguidos com a fonte simulada lenta (`atrasoMs: 150`). Ele falhava com 7 passos, sem o LinkedIn, e agora passa 5 vezes em 5.
- **Reconferência no backend real.** Na Sequência de conferência, dois passos seguidos levaram de 2 para 4 passos, com LinkedIn e WhatsApp gravados, e o resumo público com 4 ([print](prints/02-dois-passos-seguidos-gravados.jpg)).
