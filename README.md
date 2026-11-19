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

O app abre em **modo demonstração**: os dados ficam no navegador (IndexedDB). Senha inicial de todos (também usada para
assinar): `amc123`.

| Pessoa | Perfil | E-mail | Libera pagamento |
|---|---|---|---|
| Manoel Chroniaris | Diretor Geral | manoel@amcomercial.com.br *(a confirmar)* | qualquer valor |
| Antônio Chroniaris | Diretor Geral | antonio@amcomercial.com.br *(a confirmar)* | qualquer valor |
| Ana Katarina | Diretora Financeira · setor Financeiro | ana@amcomercial.com.br *(a confirmar)* | qualquer valor |
| Felipe Chroniaris | Diretor Comercial · setor Comercial | felipe@amcomercial.com.br *(a confirmar)* | até R$ 10.000 |
| Victor Chroniaris | Diretor de Logística · setor Logística | victor@amcomercial.com.br *(a confirmar)* | até R$ 10.000 |
| Adriano Goldman | Gestor · Administrativo | adm.gerencia@amcomercial.com.br | — |
| Silvio Crispim | Gestor · Logística | silvio@amcomercial.com.br | — |
| Siliel Inácio | Gestor · T.I | siliel@amcomercial.com.br | — |
| Stwart Lima | Gestor · Comercial | vendas.revenda@amcomercial.com.br | — |
| Funcionário (exemplo) | Funcionário · Logística | funcionario.logistica@amcomercial.demo | — |
| Contas a Pagar (exemplo) | Financeiro | contas.pagar@amcomercial.demo | — |
| Administrador | Admin | admin@amcomercial.demo | — |

> Ninguém começa com assinatura: cada gestor/diretor cadastra a sua em **Meu perfil** (foto da assinatura em papel ou
> desenho) ou desenha na primeira aprovação. Não existe assinatura simulada em nome de pessoas reais.

> ⚠️ No modo demonstração as regras rodam no navegador. Antes de usar com dados reais, o serviço
> (`src/services/LocalDataService.ts`) precisa rodar no servidor. Veja [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Como testar cada perfil

1. **Funcionário:** Nova SC → buscar fornecedor, natureza, rateio 100%, itens → *Enviar para o gestor*.
2. **Gestor (ou diretor do setor):** abrir a SC → *Editar* (a alteração fica registrada) → *Aprovar, assinar e escolher
   diretor*: assina a Autorização de Compra e escolhe quem libera o pagamento (só aparecem diretores com limite para o valor).
   O valor passa a **reservado** no painel do setor.
3. **Diretor escolhido:** *Aprovações* → abrir a SC → *Liberar pagamento e assinar* (Autorização de Pagamento), ou
   *Encaminhar para outro diretor*. O valor passa a **consumido**.
4. **Funcionário ou gestor:** na SC aprovada, anexar a **NF** → *Enviar para pagamento*.
5. **Financeiro:** *Contas a Pagar* → abrir a SC → *Imprimir pacote* → *Marcar como paga* (data + comprovante).
6. Em qualquer status: **Imprimir / Baixar PDF** gera a SC desenhada célula a célula a partir da aba "C.I (1 por página)"
   (medidas, cores, bordas e fontes extraídas da planilha para `src/pdf/scTemplate.json`). Abaixo do formulário vai o registro
   das assinaturas eletrônicas e o QR code de validação.
