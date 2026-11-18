# Arquitetura

## Stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS (sem bibliotecas de UI/gráficos: componentes próprios em `src/components`).
- **Backend de produção:** Supabase (Auth + PostgreSQL + Storage), com RLS e RPCs em `supabase/migrations`.
- **Testes:** Vitest (`*.test.ts`).

## Camadas

```
src/
  domain/      Regras puras, sem React: tipos, cálculo de orçamento, formatação, rótulos, CSV
  services/    Contrato DataService + implementação LocalDataService (demo) + seed
  app/         Sessão, competência (mês) selecionada, hooks de consulta e roteamento por hash
  components/  UI kit (primitives, modal, toast, ícones), gráficos e layout
  pages/       Telas por perfil (gestor/, diretoria/, admin/) e componentes compartilhados (shared/)
supabase/      Migrations SQL: schema, RLS, RPCs de fluxo e bucket de comprovantes
```

A UI depende apenas da interface `DataService` (`src/services/DataService.ts`). Para ligar o Supabase,
basta criar um `SupabaseDataService` que chame as RPCs da migration e trocar a instância em `src/services/api.ts`.

## Regras de orçamento (`src/domain/budget.ts` ≡ função SQL `_budget`)
- **Teto efetivo** = teto base (padrão do setor ou específico da competência) + transferências **aprovadas** recebidas − cedidas.
- **Gasto** = despesas `APROVADA`. **Em análise** = despesas `PENDENTE_DIRETORIA`.
- **Saldo disponível** = teto efetivo − gasto − em análise. O pendente fica reservado para que o mesmo saldo não seja comprometido duas vezes.
- **Alertas:** ≥ 80% atenção · ≥ 95% crítico · > 100% estourado. A cor vem sempre acompanhada de ícone e texto.

## Fluxos (máquinas de estado)

**Despesa:** `PENDENTE_DIRETORIA → APROVADA | REJEITADA` (motivo obrigatório) · `→ CANCELADA` (pelo gestor, enquanto pendente).

**Transferência de limite:**
```
PENDENTE_CEDENTE ──(gestor cedente aceita)──▶ PENDENTE_DIRETORIA ──(Diretoria aprova)──▶ APROVADA (limite transferido)
       │                                              │
       └─▶ RECUSADA_CEDENTE                           └─▶ REJEITADA_DIRETORIA
(solicitante pode cancelar enquanto estiver em andamento → CANCELADA)
```
- A transferência vale apenas para a competência (mês) informada.
- O cedente só aceita se o seu saldo livre (já descontadas as outras cessões aguardando a Diretoria) cobrir o valor.
- A Diretoria revalida o saldo do cedente no momento da aprovação final.

## Segurança (RBAC)
- **Produção (Supabase):**
  - RLS em todas as tabelas: o gestor só lê linhas do próprio setor; transferências só quando o setor dele é parte.
  - Os clientes não têm policy de escrita em `expenses`/`transfers`. Toda mudança de status passa por RPCs `security definer`, que validam o perfil, o estado e o saldo (com advisory lock contra condição de corrida).
  - Os tetos de outros setores não ficam visíveis: a lista de setores para o gestor vem de `sector_directory()`, que retorna apenas id e nome.
  - Os comprovantes ficam no bucket privado `comprovantes/<setor>/…`, e cada gestor só lê e grava a pasta do próprio setor.
- **Demo local:** o `LocalDataService` aplica as mesmas regras e sempre relê o perfil do "banco", sem confiar no objeto vindo da UI. Ainda assim, roda no navegador e serve apenas para demonstração.

## Próximos passos sugeridos
1. Implementar `SupabaseDataService` e a tela de login com Supabase Auth.
2. Notificações por e-mail ou in-app quando houver itens aguardando decisão.
3. Exportação `.xlsx` nativa e PDF gerado no servidor.
4. Histórico mensal (tendência de gastos dos últimos 12 meses).
