# Arquitetura

## Stack
React 18 + TypeScript + Vite + Tailwind. PDF com `jspdf` (SC), `pdf-lib` (pacote para o financeiro) e `qrcode`.
Testes com Vitest.

## Camadas
```
src/domain/     Regras puras: tipos, totais, validação, hash do conteúdo, diferenças campo a campo, saldo do setor
src/services/   DataService (contrato) + LocalDataService (todas as regras e permissões) + dados de exemplo
src/pdf/        Solicitação de Compras em A4 e pacote (SC + NF + boletos + comprovantes)
src/pages/      Telas por perfil
src/components/ UI (sem bibliotecas de componentes)
```
A UI só conversa com a interface `DataService`. Toda operação recebe o usuário e o serviço **recarrega o perfil do
banco** e confere perfil, setor e status. Esconder botão nunca é a única barreira. Os testes chamam o serviço direto
(sem tela), por exemplo para provar que o gestor não consegue assinar a Autorização de Pagamento.

## Perfis
| Perfil | Pode |
|---|---|
| Funcionário | Criar SC, ver o painel do setor, acompanhar as próprias SCs, anexar NF/comprovantes após aprovação |
| Gestor | Tudo do funcionário + usuários do próprio setor (sempre como Funcionário), editar/devolver/reprovar/aprovar SCs do setor, assinar **só** a Autorização de Compra e escolher o diretor que libera o pagamento |
| Diretoria | Liberar (assinar a Autorização de Pagamento), reprovar ou encaminhar a outro diretor as SCs atribuídas a ele, até o seu limite (`paymentLimit`; vazio = qualquer valor). O diretor responsável por um setor (`sectorId`) também aprova a etapa do setor, como o gestor |
| Financeiro | Fila de Contas a Pagar, imprimir pacote, marcar como paga (data + comprovante) |
| Admin | Setores, limites, usuários de qualquer perfil, centros de custo, naturezas, fornecedores |

## Fluxo da SC
```
Rascunho → Aguardando gestor → Aguardando diretoria → Aprovada · aguardando NF → Enviada ao financeiro → Paga
              │  └─ Devolvida para ajuste (motivo) → volta ao solicitante
              └─ Reprovada (motivo; encerra)            Reprovada pela diretoria (motivo)
```
Na aprovação do setor, quem aprova escolhe o diretor que vai liberar o pagamento (`assignedDirectorId`). Só esse diretor
libera ou reprova; ele pode encaminhar para outro diretor com limite suficiente. SC criada pelo gestor (ou pelo diretor do
setor) entra direto em "Aguardando diretoria", já com a Autorização de Compra dele e o diretor escolhido.

Quadro atual: Manoel e Antônio (diretores gerais) e Ana (diretora financeira) liberam qualquer valor; Felipe (comercial)
e Victor (logística) liberam até R$ 10.000.

## Limite do setor (por mês)
- **Reservado:** SCs aprovadas pelo gestor que aguardam a diretoria (valor atual da SC).
- **Consumido:** SCs aprovadas pela diretoria (aguardando NF, no financeiro ou pagas).
- **Disponível:** limite − reservado − consumido. A aprovação do gestor é bloqueada quando passa do disponível, e a mensagem diz quanto falta.
- Reprovada ou cancelada devolve a reserva. Se o gestor alterar uma SC que já estava na diretoria, a assinatura dele
  perde a validade, a SC volta para ele e a reserva é recalculada na nova aprovação.
- Transferência temporária de limite entre setores: aceite do gestor cedente + aprovação da diretoria.

## PDF da Solicitação
`scripts/extract-sc-template.py` lê a aba "C.I (1 por página)" (convertida para .xlsx) e gera `src/pdf/scTemplate.json`
com larguras de coluna, alturas de linha, células mescladas, cores, bordas, fontes e alinhamentos. `src/pdf/scPdf.ts`
desenha esse gabarito na mesma escala do Excel ("ajustar à largura de 1 página") e preenche as células de dados.
Se a planilha mudar, rode o script de novo.

## Assinatura eletrônica (fase 1)
- O gestor e o diretor cadastram a própria imagem em *Meu perfil*. Pode ser foto da assinatura em papel (o fundo é
  removido) ou desenho na tela.
- A assinatura só é aplicada ao aprovar, depois de confirmar a senha. O sistema registra data, hora, IP, usuário,
  SHA-256 do conteúdo da SC e um código curto de verificação.
- Se o conteúdo mudar, o hash deixa de bater e a assinatura aparece como **invalidada** (na tela, no PDF e na página de validação).
- Texto impresso: "Assinado eletronicamente em …". O texto "assinatura digital" fica reservado para certificado ICP-Brasil.
- **Fase 2 (preparada, não implementada):** o campo `method` da assinatura (`INTERNA | GOVBR | PROVEDOR`) e o tipo de
  anexo `PDF_ASSINADO` (PDF assinado no gov.br e anexado de volta). A integração com ZapSign, Clicksign ou D4Sign entra
  como novo `method`.

## O que falta para produção
1. **Servidor:** rodar as regras do `LocalDataService` no servidor (ex.: Supabase Edge Function + PostgreSQL com RLS),
   trocando só o `KeyValueStore` por tabelas. Hoje, no modo demonstração, as regras rodam no navegador.
2. **IP real** na assinatura (só o servidor conhece; na demonstração aparece "não registrado").
3. **E-mail:** as notificações estão só dentro do sistema; o envio por e-mail entra quando houver serviço configurado.
4. Anexos no Storage em vez de dentro do registro da SC.
