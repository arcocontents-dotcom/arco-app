# Versões do Arco App

| Versão | Commit | O que é |
|---|---|---|
| v1-estavel | fcf4dbb | Versão antes do refinamento de 11/11/2026 (calendário, gestão, dashboard, feed). |
| v2-refinada | (este commit em diante) | Ícones animados, Pendências, busca ⌘K, histórico do cliente, agenda no celular, navegação instantânea. |

## Como voltar para a v1
- Mais rápido: Cloudflare → Workers → arco-app → Deployments → escolher o deploy de 10/11/2026 → Rollback.
- Pelo código: `git revert --no-edit fcf4dbb..HEAD` (ou peça para o Claude "voltar para a v1-estavel").
