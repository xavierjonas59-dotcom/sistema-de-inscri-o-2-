# Início com gráficos, busca, conversa na SC, menu recolhível e ajustes de privacidade

Data: 2026-11-26 · Aprovado pelo usuário na conversa.

1. **Início igual para todos** (Funcionário, Gestor, Diretoria e Admin; o Financeiro continua abrindo no Contas a Pagar).
   - Saldo no topo, limpo: "Disponível" em destaque, "de <limite> · <reservado> reservado", barra fina de uso.
   - "Gastos por mês": barras dos últimos 12 meses (consumido = aprovado pela diretoria), mês selecionado em destaque, valor no hover/foco.
   - "Gastos por natureza" do mês selecionado no topo, barras horizontais ordenadas.
   - Funcionário/gestor: só o próprio setor (forçado no serviço). Diretoria/Admin: empresa toda com filtro de setor.
   - Abaixo: listas de ação já existentes; diretoria/admin com a tabela "Limite por setor" quando o filtro é "Empresa toda".
   - Admin: Início passa a ser a página inicial; "Setores e limites" vai para `#/setores`.
   - Seed: SCs pagas de exemplo nos 6 meses anteriores (marcadas como exemplo).
2. **Busca** ("Buscar", Ctrl K): janela central "Ir para uma tela ou buscar SC…", lista de telas do perfil com o grupo à direita;
   ao digitar, filtra telas e mostra SCs (número, fornecedor, item, solicitante). Setas + Enter, Esc fecha.
3. **Conversa na SC**: mensagens (texto) de quem pode ver a SC, exceto Admin; notifica no sininho os participantes
   (solicitante, aprovadores do setor, diretor escolhido, quem já escreveu), menos o autor. Somente leitura em Paga/Reprovada/Cancelada.
4. **Menu lateral recolhível**: botão no topo; recolhido mostra só ícones (nome no title/tooltip); preferência em `localStorage` (`amc:sidebar`).
5. **Tela de entrada**: sem a ilustração 3D; à esquerda só logo e frase.
6. **Limites da diretoria só para o Admin**: `listDirectors(actor, total?)` devolve só os diretores aptos ao valor e sem `paymentLimit`
   para quem não é Admin; mensagens sem valores ("Este valor precisa ser liberado por outro diretor").
7. **E-mail**: o botão "Pedir autorização por e-mail" passa a se chamar "Notificar por e-mail" (comportamento igual).

## Plano (execução nesta sessão, com testes)
- T1 Serviço: `spendingByMonth`, `spendingByNature`, `postMessage`, `listDirectors` com filtro/ocultação, mensagens sem valores; testes Vitest.
- T2 Início (saldo, 2 gráficos, filtro), rotas do Admin; seed com 6 meses de exemplo.
- T3 Busca em janela central. T4 Conversa na SC. T5 Menu recolhível. T6 Entrada sem 3D, "Notificar por e-mail", ocultar limites na UI.
- T7 Verificação no navegador (claro/escuro), fluxo completo, push, demonstração.
