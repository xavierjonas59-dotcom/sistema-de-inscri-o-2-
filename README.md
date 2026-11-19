# AM Comercial · Gestão de Despesas

Solicitação de Compras (SC) com limite mensal compartilhado por setor, aprovação do gestor e da diretoria
com assinatura eletrônica, anexos de NF/boletos e fila de Contas a Pagar.

## Como rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # regras de negócio, permissões e PDF (Vitest)
npm run typecheck
npm run build
```

O app abre em **modo demonstração**: os dados ficam no navegador (IndexedDB), já com setores, fornecedores e SCs
de exemplo. Senha de todos os usuários (também usada para assinar): `amc123`.

| Perfil | E-mail |
|---|---|
| Funcionário · Logística | funcionario.logistica@amcomercial.demo |
| Gestor · Logística | gestor.logistica@amcomercial.demo |
| Diretoria | diretoria@amcomercial.demo |
| Financeiro (Contas a Pagar) | financeiro@amcomercial.demo |
| Admin | admin@amcomercial.demo |
| Gestor · Comercial | gestor.comercial@amcomercial.demo |

> As assinaturas dos usuários de demonstração são fictícias, geradas por código. Cada gestor e diretor real cadastra a
> própria assinatura em **Meu perfil** (foto da assinatura em papel ou desenho na tela).

> ⚠️ No modo demonstração as regras rodam no navegador. Antes de usar com dados reais, o serviço
> (`src/services/LocalDataService.ts`) precisa rodar no servidor. Veja [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Como testar cada perfil

1. **Funcionário:** Nova SC → buscar fornecedor, natureza, rateio 100%, itens → *Enviar para o gestor*.
2. **Gestor:** abrir a SC em *Solicitações do setor* → *Editar* (a alteração fica registrada) → *Aprovar e assinar* (senha).
   O valor passa a **reservado** no painel do setor.
3. **Diretoria:** *Aprovações* → abrir a SC → *Aprovar e assinar* a Autorização de Pagamento. O valor passa a **consumido**.
4. **Funcionário ou gestor:** na SC aprovada, anexar a **NF** → *Enviar para pagamento*.
5. **Financeiro:** *Contas a Pagar* → abrir a SC → *Imprimir pacote* → *Marcar como paga* (data + comprovante).
6. Em qualquer status: **Imprimir / Baixar PDF** gera a SC no layout da planilha "C.I (1 por página)",
   com QR code para a página de validação (`#/validar?sc=SC-2026-0001`).
