# Tela de entrada, painel do perfil com modo escuro e pedido de autorização por e-mail

Data: 2026-11-26 · Aprovado pelo usuário na conversa (brainstorming).
Referência visual: app.altosistemas.com.br/entrar e o menu de perfil do Alto (prints enviados pelo usuário).
Cores: as da AM Comercial (#282C8D) no lugar do verde do Alto.

## Parte 1 — Tela de entrada
- Layout em duas colunas (≥ 1024px): esquerda com logo da AM, título em duas linhas
  "Cada compra aprovada." / "Cada real sob controle." (2ª linha na cor da marca) e, abaixo,
  a ilustração 3D da SC; direita com o cartão de entrada. Fundo #F5F5F7 com brilho radial suave no canto.
- Abaixo de 1024px: só o cartão (título e ilustração somem), centralizado.
- Cartão: "Entrar", "Bom te ver de novo.", E-mail (placeholder voce@amcomercial.com.br), Senha com botão
  mostrar/ocultar, botão "Entrar", link "Esqueci a senha"; rodapé "© 2026 AM Comercial".
- Ilustração: componente React/CSS (sem imagem), miniatura fiel da SC (faixas #002060, linhas de itens,
  total, 4 campos de assinatura, assinatura em traço azul, selo "Aprovada"), em perspectiva
  (rotateX/rotateY), sombra suave; decorativa (`aria-hidden`); respeita o modo escuro.
- "Esqueci a senha": formulário com e-mail → `api.requestPasswordReset(email)`. Resposta sempre neutra:
  "Se o e-mail estiver cadastrado, o administrador foi avisado." Se existir e estiver ativo, cria
  notificação para todos os Admins ativos. Sem login exigido.
- Remover a lista de usuários de demonstração da tela. Os e-mails de teste ficam no README.
- Seletor de tema (claro/automático/escuro) no canto superior direito da tela de entrada.

## Parte 2 — Painel do perfil e modo escuro
- O rodapé do menu (avatar + nome) vira um botão que abre um painel (popover) com:
  cabeçalho (iniciais, nome, e-mail); "Dados do perfil"; "Avisos por e-mail"; "Segurança e verificação";
  linha "Tema" com controle segmentado (claro/automático/escuro); "Sair".
- Rota `#/perfil` com seções:
  - Dados do perfil: nome, e-mail, cargo, perfil e setor (somente leitura; alterações pelo Admin) e,
    para gestor/diretoria, a assinatura (conteúdo da antiga tela "Minha assinatura").
  - Segurança e verificação: trocar senha (senha atual + nova + confirmação, mínimo 6) →
    `api.changePassword(actor, atual, nova)`; data do último acesso desta sessão.
  - Avisos por e-mail: estado "em breve" explicando que hoje os avisos chegam pelo sininho.
- O item "Minha assinatura" sai do menu lateral (fica em Dados do perfil). Todos os perfis têm `#/perfil`.
- Tema: preferência por navegador (`localStorage`, chave `amc:theme`, valores light|system|dark;
  padrão system). Classe `dark` no `<html>`; tokens CSS com variantes escuras; Tailwind `darkMode: 'class'`.
- Todas as telas e componentes usam tokens (sem cores fixas de fundo/texto claras); estados (tags de status,
  avisos) têm versão escura. O PDF não muda.

## Parte 3 — Pedir autorização por e-mail
- Botão "Pedir autorização por e-mail" na tela da SC quando o status é "Aguardando gestor" ou
  "Aguardando diretoria", visível para o solicitante e para o aprovador do setor.
- Janela: Para (pré-preenchido com o(s) e-mail(s) de quem aprova agora: gestor(es) e diretor do setor
  em "aguardando gestor"; o diretor escolhido em "aguardando diretoria"), Cc (livre, separado por vírgula),
  prévia do assunto e do texto. Validação de e-mails.
- "Abrir no Outlook" abre `mailto:` com to, cc, subject e body (sem anexo). Texto:
  "Foi solicitada a compra/serviço <descrição do 1º item (+N itens)> para o setor <setor>, no valor de
  <total> (<número>), fornecedor <fornecedor>. Por favor, autorize pelo link: <link da SC>".
- Link: `<origem>#/sc/ver?id=<id>`; quem não estiver logado entra e volta para a SC (`voltar`).
- `api.logEmailRequest(actor, id, to, cc)` registra na linha do tempo "Pediu autorização por e-mail"
  com os destinatários.
- Envio automático pelo servidor fica fora deste escopo.

## Testes
- Serviço: requestPasswordReset (neutro, notifica admin só se existir), changePassword (senha atual errada,
  mínimo 6), logEmailRequest (só solicitante/aprovador, status válidos, e-mails válidos).
- Função pura que monta o mailto (codificação, Cc vazio, texto).
- Navegador: entrada (desktop e celular), esqueci a senha, painel do perfil, troca de senha, tema escuro
  em todas as telas principais, pedido por e-mail abrindo `mailto:`.
