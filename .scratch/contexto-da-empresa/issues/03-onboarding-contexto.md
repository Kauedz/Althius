# 03: Configuração automática no onboarding

**What to build:** Informar empresa e site no onboarding e receber contexto pronto; retomar depois quando a etapa for pulada, inclusive em Workspaces existentes.

**Blocked by:** 02: Gerar contexto pelo site e revisar novas gerações

**Status:** ready-for-agent

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [ ] Empresa e site iniciam a geração do ticket 02, sem confirmação adicional após sucesso.
- [ ] Pular não bloqueia a entrada geral; Configurações permite informar o site depois.
- [ ] Falha é comunicada e permite concluir o onboarding, tentar novamente ou editar manualmente.
- [ ] Retirar o questionário obrigatório de mini-ICP como fonte concorrente.
- [ ] Workspace existente usa o site cadastrado ou solicita seu preenchimento; gera conteúdo do zero, sem copiar ou resumir o Playbook.
- [ ] Retomada e recarregamento não repetem a geração indevidamente; participante sem permissão não pode substituir contexto do Workspace.
- [ ] Operações que requerem ICP suficiente comunicam a pendência e encaminham para a configuração, sem bloquear funções independentes.

## Pode mexer

Onboarding, cadastro de empresa/site, retomada em Configurações e estados de pendência do contexto.

## Não mexa

Exclusão de dados antigos, reclassificação de Contas-alvo e remoção global do Playbook antes do ticket 07.

## Validação

Testar percurso novo, etapa pulada, Workspace existente com e sem site, falha, retomada e vigência automática.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.
