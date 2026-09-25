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

