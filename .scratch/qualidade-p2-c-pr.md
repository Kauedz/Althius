## Summary

O editor de Monitoramento preserva o deep link durante a carga e a falha. A lista usa a mesma leitura com erro e nova tentativa; o Kanban para de apresentar Descoberta quando a RPC de estágios falha.

```text
leitura → carregando → dados / vazio confirmado
                    → erro → tentar de novo
```

## Evidence

- **Before:** deep link válido redirecionava imediatamente; falhas do editor, lista e Kanban não mostravam alerta.
  **After:** 47/47 testes focados passaram, incluindo retry e preservação da URL. Inventário dos demais fallbacks em `.scratch/qualidade-p2-c.md`.
- Dublê compartilhado atualizado para fornecer estágios vazios saudáveis; falhas explícitas continuam propagadas.
- Aguardar CI completa de frontend, Deno e pgTAP antes de publicar.

## Merge Danger

**Door:** two-way

**Blast Radius:** leituras

Publicar só frontend. Sem migrations nem funções. Passos do Nan: revisar CI e publicar pelo processo habitual. Sem merge automático.
