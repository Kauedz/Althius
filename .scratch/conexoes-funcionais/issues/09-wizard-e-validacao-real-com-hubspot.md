# 09: Wizard e validação real com portal HubSpot

**What to build:** um wizard guia a criação da conta de desenvolvedor HubSpot, do portal de teste e do MCP Auth App, e o cadastro dos segredos desta frente nas Edge Functions. Depois, uma pessoa conecta o próprio Acesso a um portal real, sincroniza Companies e Contacts de teste e confere o resultado nas abas Contas e Contatos.

**Blocked by:** 06 (Sincronização incremental e o que some do HubSpot), 07 (Retirar a Integração do Workspace).

**Status:** ready-for-human

- [ ] O wizard existe no repositório e só pede o que uma pessoa precisa fazer no HubSpot e no Supabase. Cadastrar segredos exige combinar antes, como manda o AGENTS.md.
- [ ] As migrations desta frente estão aplicadas no projeto de pré-produção, conferindo antes a última versão aplicada, e a Edge Function está publicada.
- [ ] Um participante conecta o próprio Acesso a um portal de teste real e o cartão mostra a conta.
- [ ] Uma Sincronização real traz Companies com owner participante como Contas-alvo, com seus Contacts e Vínculos, e as contagens batem com o portal.
- [ ] Uma segunda Sincronização sem mudanças não altera nada.
- [ ] Os pontos do HubSpot marcados como não confirmados na [pesquisa](../pesquisa-servidores-mcp.md) (parâmetros da busca, associações, e-mail do owner, `hub_id` do token do MCP e contagem das 25 instalações) ficam confirmados ou corrigidos.
- [ ] As evidências (prints e contagens) ficam no `## Comments` deste ticket.
