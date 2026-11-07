# 02: Inventário do Hermes, com versão e modelo fixados

**What to build:** Saber exatamente qual Hermes e qual modelo de IA a Althius usa e o que esse Hermes sabe fazer, para que nenhuma capacidade seja prometida sem prova e os tickets de liberação do motor partam de fatos.

**Blocked by:** Nenhum (pode começar imediatamente).

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, seções "Diretriz de produto", "Evolução obrigatória da integração Hermes" e "Onde a integração limita o Hermes hoje".

## Critérios de aceite

- [ ] A versão do Hermes e o modelo de IA de produção estão registrados num lugar só, e as divergências entre o README do worker, a ADR-0018 e a spec do motor estão resolvidas com remissão a esse lugar.
- [ ] Existe um inventário em `.scratch/agentes-gtm-configuraveis/` que, para cada capacidade obrigatória da spec (pesquisa web, leitura de páginas, arquivos, ferramentas externas, continuidade entre etapas, memória, habilidades, agendamento, entregas longas), diz se está disponível de ponta a ponta, se existe no motor mas está desligada ou bloqueada na integração, ou se exige ferramenta adicional, com a evidência de cada afirmação.
- [ ] O inventário diz se a API de runs da versão fixada aceita ferramentas externas ou servidores MCP e como, citando a documentação ou um teste feito.
- [ ] O inventário registra os toolsets desligados na configuração real em uso (não só o que o README manda) e, para cada um, o risco de religar numa máquina que atende vários Workspaces.
- [ ] Nada no inventário é marcado "disponível" sem um teste executado contra a versão fixada.

## Pode mexer

Documentação do worker e do motor, a ADR-0018 (só linha de remissão), o inventário novo nesta pasta.

## Não mexa

Código do worker, prompts, ferramentas, banco.

## Passos do Nan

- Mostrar ao agente a versão instalada do Hermes e o conteúdo do `~/.hermes/config.yaml` em uso na máquina do worker, sem chaves (o agente passa os comandos PowerShell prontos e diz o que apagar antes de colar).
- Confirmar o modelo de IA que deve ficar fixado em produção.

## Validação

Cada linha do inventário tem evidência (trecho de documentação da versão fixada ou saída de um teste). Revisão do Nan sobre versão e modelo.
