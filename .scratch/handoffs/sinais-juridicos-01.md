# Handoff: pesquisa de fontes de jurimetria

## Contexto e resultado

Foi trabalhado somente o ticket `.scratch/sinais-juridicos/issues/01-pesquisa-de-fontes.md` na branch `ralph/sinais-juridicos-01-pesquisa-de-fontes`. A pesquisa está em `.scratch/sinais-juridicos/pesquisa-fontes.md`; consulte esses artefatos para requisitos, achados e fontes. O ticket permanece aberto, status `ready-for-human`, com 3/3 critérios conferidos.

A pesquisa foi consultada em 26/10/2026 em páginas do CNJ, STF, STJ e documentação/páginas dos fornecedores. Restam pontos explicitamente como “não sei”, sobretudo resposta real/filtros do DataJud, busca pública do DJEN, detalhes do CSV do STJ e autorização comercial de fornecedores. Não houve chamada autenticada, processo real, teste automatizado, mudança de código, migration ou ação remota.

## Decisões de processo

- Escopo mantido no ticket 01: apenas nota de pesquisa e seção Comments do ticket; sem iniciar outro ticket nem alterar spec/ADR/código.
- Seam de validação pré-confirmado pelo Renan conforme instrução da sessão: verificar as fontes e a correspondência entre as seis perguntas e as respostas/fontes; sem testes automatizados novos para documentação.
- Os critérios foram marcados porque a nota contém resposta/fonte datada ou “não sei”, veredito J/U/R/I no topo e exemplos sem dado pessoal real.
- O ticket não foi fechado porque validação jurídica e confirmação contratual/comercial não fazem parte do ticket de pesquisa; não se fez decisão de produto.
- Regra de commit: alterações devem permanecer no worktree para a matriz; não executar `git add` nem `git commit`.

## Próxima sessão

Se for continuar, comece conferindo `git status` e os diffs dos artefatos citados. A pendência comercial precisa de confirmação escrita do fornecedor sobre preço, polo passivo e licença para guardar/exibir dados em SaaS; a validação ética pertence ao ticket 02.

## Correção rfix1

A revisão encontrou “333 transações” sem suporte na página de preços do JUDIT. A linha foi corrigida para informar os valores publicados por faixa (R$ 15,00 a R$ 10,00 e R$ 0,25 por processo capturado) e explicitar que a página não informa uma quantidade de transações. Seam TDD pré-confirmado: regressão textual sobre a frase sem suporte, reproduzida na versão-base e aprovada na nota corrigida. A verificação não cria fixture nem altera código. A decisão e o resultado também constam nos Comments do ticket.

## Suggested skills

- `research`: caso alguém prossiga verificando fontes/documentação primária.
- `code-review`: revisar alterações do ticket se houver nova edição.
- `tdd`: para tickets de implementação futuros, escolhendo e registrando seam antes dos testes conforme instrução do usuário.
