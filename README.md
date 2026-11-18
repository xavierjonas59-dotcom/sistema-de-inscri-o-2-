# MKSAL · Controle de Despesas e Orçamentos por Setor

Sistema web para controlar o teto mensal de gastos de cada setor da MKSAL, com solicitação de despesas,
aprovação da Diretoria e transferência temporária de limite entre setores (dupla aprovação).

## Como rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # regras de negócio e RBAC (Vitest)
npm run typecheck
npm run build
```

O app abre em **modo demonstração**: os dados ficam no `localStorage` do navegador e já vêm com
setores, naturezas, despesas e transferências de exemplo. Para voltar aos dados iniciais, limpe o
armazenamento do site (DevTools → Application → Clear storage).

| Perfil | E-mail | Senha |
|---|---|---|
| Diretoria (Master) | diretoria@mksal.com.br | mksal123 |
| Gestor · Logística | logistica@mksal.com.br | mksal123 |
| Gestor · Comercial | comercial@mksal.com.br | mksal123 |
| Gestor · Financeiro | financeiro@mksal.com.br | mksal123 |
| Gestor · Administrativo | administrativo@mksal.com.br | mksal123 |

> ⚠️ O modo demonstração aplica as regras no cliente e **não é seguro para produção**.
> Em produção, use o backend Supabase (`supabase/migrations`), em que o isolamento entre setores é
> garantido por Row Level Security no banco. Veja [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Funcionalidades

**Gestor de setor** (só enxerga o próprio setor)
- Painel com Teto do mês, Total gasto, Pendente de aprovação e Saldo disponível, além de uma barra de consumo com alertas a partir de 80% e 95%
- Gráfico de gastos por natureza, solicitações recentes e histórico de transferências
- Nova solicitação de despesa (descrição, valor, natureza, justificativa, anexo PDF/imagem), com validação de saldo em tempo real
- Pedido de limite emprestado a outro setor e análise dos pedidos feitos ao seu setor (como cedente)
- Exportação das próprias despesas em CSV (Excel)

**Diretoria (Master)**
- Visão macro: gasto da empresa vs. teto global, comparativo por setor e ranking de naturezas, que pode ser filtrado por setor
- Central de aprovações unificada (despesas + transferências), com filtros por setor e por gestor
- Relatórios: consolidado por setor, por natureza, despesas detalhadas e transferências (CSV para Excel, ou impressão/PDF)
- Cadastros: setores e tetos (padrão e por competência), naturezas de despesa e usuários
