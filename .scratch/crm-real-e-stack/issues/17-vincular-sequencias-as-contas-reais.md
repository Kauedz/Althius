# 17: Vincular Sequências e responsabilidades às Contas reais

**What to build:** a Sequência existente opera com a mesma Conta-alvo UUID do CRM e mantém sua propriedade exclusiva, documento privado e projeção compartilhada.

**Blocked by:** 04: Criar e consultar Contas-alvo reais; 06: Atribuir responsabilidade e distribuir recomendações pela roleta.

**Status:** ready-for-agent

- [ ] Migrar ownership de Sequência e responsabilidade de Conta para relação tipada com Conta-alvo, sem IDs de demonstração ou strings órfãs.
- [ ] Migração preserva/valida dados existentes e impede divergência entre Workspace, Conta, vendedor responsável e Sequência.
- [ ] No máximo uma Sequência ativa por Conta e um vendedor responsável exclusivo conforme ADR-0009.
- [ ] Documento e dados privados de destinatário continuam acessíveis somente ao titular; o Workspace vê a projeção segura prevista na ADR-0008.
- [ ] Interface existente mostra Contas e Sequências reais com permissões, estados vazios e erros coerentes.
- [ ] Arquivar Conta pausa a Sequência, cancela passos pendentes e preserva histórico; restaurar exige confirmação explícita do responsável.
- [ ] Apagamento permanente cancela passos pendentes e impede execução posterior, preparando os eventos preservados para anonimização.


## Comments

- 2026-09-25: este ticket não bloqueia o primeiro envio real, porque a Sequência já grava o UUID da Conta-alvo como texto. Quando a chave estrangeira entrar, há dois pontos a tratar:
  - as Sequências `teste-real-*` do Workspace A, criadas pelo `npm run teste:real` com ids de Conta-alvo em texto e sem Conta-alvo real, precisam ser removidas por operação administrativa na pré-produção ([ADR-0013](../../../docs/adr/0013-supabase-auto-hospedado-em-vps.md), revisão);
  - o `teste:real` precisa passar a criar uma Conta-alvo real antes de cada Sequência.
