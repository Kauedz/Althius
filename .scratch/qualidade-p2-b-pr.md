## Summary

O modal de revelar E-mail confirma apenas após cotação válida do servidor. Falha mostra erro e nova tentativa; saldo insuficiente explica o bloqueio. O preço inventado foi removido do modal e da Fonte Supabase. A regra de não recobrar permanece coberta.

```text
abrir → consultar cotação → preço real → confirmar
                         → falha → tentar de novo
                         → saldo insuficiente → bloquear
```

## Evidence

- **Before:** teste pendente falhou porque o botão estava habilitado; falha/retry e saldo falharam pela ausência de alerta; Fonte sem linha inventava 2 créditos.
  **After:** 42/42 testes focados, lint e build verdes. Evidência e comandos em `.scratch/qualidade-p2-b.md`.
- Suíte completa local inconclusiva (interrompida por pressão de memória). Aguardar CI de frontend, Deno e pgTAP do zero; não tratar como gate verde.

## Merge Danger

**Door:** two-way

**Blast Radius:** revelação

Só frontend. Sem migrations nem funções para publicar. Passos do Nan: revisar CI e publicar frontend pelo processo habitual. PR sem merge, conforme pedido.
