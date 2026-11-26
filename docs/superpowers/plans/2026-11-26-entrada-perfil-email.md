# Tela de entrada, perfil/modo escuro e autorização por e-mail — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o design aprovado em `docs/superpowers/specs/2026-11-26-entrada-perfil-email-design.md`.

**Architecture:** Regras novas no `LocalDataService` (mesma interface `DataService`), testadas com Vitest. Tema por classe `dark`
no `<html>` com tokens CSS (Tailwind `darkMode: 'class'`), preferência em `localStorage`. E-mail via `mailto:` montado por
função pura. Ilustração 3D em React/CSS.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind 3, Vitest, Playwright (verificação manual por script).

## Global Constraints
- Cor da marca #282C8D; faixas do documento #002060; neutros do Alto (#F5F5F7, #F9F9FC, #E8E8E8, #1D1D1F, #5F5F64).
- Título da entrada: "Cada compra aprovada." / "Cada real sob controle." (2ª linha na cor da marca).
- Resposta do "Esqueci a senha" sempre: "Se o e-mail estiver cadastrado, o administrador foi avisado."
- Chave do tema: `amc:theme` = `light | system | dark` (padrão `system`).
- PDF não muda. Nada de assinatura simulada de pessoas reais.

---

### Task 1: Serviço — esqueci a senha, trocar senha, registro do pedido por e-mail
**Files:** Modify `src/services/DataService.ts`, `src/services/LocalDataService.ts`; Test `src/services/LocalDataService.test.ts`
**Produces:**
- `requestPasswordReset(email: string): Promise<void>` — sem login; notifica Admins ativos se o e-mail existir e estiver ativo; nunca lança por e-mail inexistente.
- `changePassword(actor: User, current: string, next: string): Promise<void>` — `BusinessError('Senha atual incorreta.')`; nova com ≥ 6 caracteres e diferente da atual.
- `logEmailRequest(actor: User, id: string, to: string[], cc: string[]): Promise<PurchaseRequest>` — solicitante ou aprovador do setor; status `AGUARDANDO_GESTOR|AGUARDANDO_DIRETORIA`; e-mails válidos; ao menos 1 em `to`; timeline "Pediu autorização por e-mail" com nota "Para: …; Cc: …".
- `approverEmails(actor: User, id: string): Promise<string[]>` — e-mails de quem aprova agora.

- [ ] Step 1: testes
```ts
describe('acesso e e-mail', () => {
  it('esqueci a senha avisa o admin só se o e-mail existir', async () => {
    await svc.requestPasswordReset('ninguem@x.com');
    expect((await svc.listNotifications(admin)).length).toBe(0);
    await svc.requestPasswordReset('SILVIO@amcomercial.com.br');
    expect((await svc.listNotifications(admin)).some((n) => n.text.includes('Silvio Crispim'))).toBe(true);
  });
  it('troca de senha confere a atual e o tamanho', async () => {
    await expect(svc.changePassword(func, 'x', 'novasenha')).rejects.toThrow('Senha atual incorreta');
    await expect(svc.changePassword(func, PW, '123')).rejects.toThrow('6');
    await svc.changePassword(func, PW, 'novasenha');
    await expect(svc.login(func.email, PW)).rejects.toThrow();
    expect((await svc.login(func.email, 'novasenha')).id).toBe(func.id);
  });
  it('pedido de autorização por e-mail fica na linha do tempo', async () => {
    const sc = await newSc();
    expect(await svc.approverEmails(func, sc.id)).toEqual(expect.arrayContaining(['silvio@amcomercial.com.br', 'victor@amcomercial.com.br']));
    await expect(svc.logEmailRequest(func, sc.id, ['invalido'], [])).rejects.toThrow('E-mail inválido');
    const r = await svc.logEmailRequest(func, sc.id, ['silvio@amcomercial.com.br'], ['ana@amcomercial.com.br']);
    expect(r.timeline.at(-1)?.action).toBe('Pediu autorização por e-mail');
    await expect(svc.logEmailRequest(stwart, sc.id, ['a@b.com'], [])).rejects.toThrow();
  });
});
```
- [ ] Step 2: `npx vitest run src/services` → FAIL (métodos inexistentes)
- [ ] Step 3: implementar os 4 métodos no serviço e na interface
- [ ] Step 4: `npx vitest run` → PASS
- [ ] Step 5: commit `feat: esqueci a senha, troca de senha e registro do pedido por e-mail`

### Task 2: Função pura do e-mail de autorização
**Files:** Create `src/domain/emailRequest.ts`; Test `src/domain/emailRequest.test.ts`
**Produces:** `buildAuthorizationEmail(sc: PurchaseRequest, sectorName: string, link: string): { subject: string; body: string }`
e `mailtoUrl(to: string[], cc: string[], subject: string, body: string): string` (codifica com `encodeURIComponent`, omite `cc` vazio, quebras de linha `%0D%0A`) e `parseEmails(text: string): string[]` (separa por vírgula/ponto e vírgula/espaço).
- [ ] testes: assunto contém número e valor; corpo contém link; mailto sem `cc=` quando vazio; `parseEmails('a@b.com; c@d.com,')` → 2.
- [ ] implementar, rodar, commit.

### Task 3: Tema (claro/automático/escuro) e tokens escuros
**Files:** Create `src/app/theme.ts`; Modify `tailwind.config.cjs`, `src/index.css`, `src/main.tsx`
**Produces:** `type ThemePref = 'light'|'system'|'dark'`; `useTheme(): [ThemePref, (p: ThemePref) => void]`; `applyTheme()` chamado no `main.tsx`;
componente `ThemeSwitch` em `src/components/ui/ThemeSwitch.tsx` (controle segmentado com ícones sol/monitor/lua, `aria-label`).
Tokens novos (claro/escuro): `--danger`, `--danger-soft`, `--danger-line`, `--warn*`, `--ok*`, `--info-soft`, `--info-line`, `--track`, `--topbar`, `--sidebar`.
- [ ] implementar; build; commit.

### Task 4: Varredura do modo escuro
**Files:** todos os `.tsx` com cores fixas (`bg-white`, `bg-[#…]`, `text-[#…]`, `border-[#…]`, `hover:bg-black/…`).
Trocar por tokens: `bg-card`, `bg-background`, `bg-muted`, `bg-track`, `text-danger`, `bg-danger-soft`, `border-danger-line`,
`text-warn`, `bg-warn-soft`, `text-ok`, `bg-ok-soft`, `bg-info-soft`, `border-info-line`, `text-muted-foreground`, `hover:bg-foreground/5`.
Logo: gerar `src/assets/logo-planilha-claro.png` (traço branco, fundo transparente) para o tema escuro.
- [ ] `grep -rnoE "(bg|text|border)-\[#" src --include=*.tsx` só pode listar `bg-sheet`/cores de documento intencionais.
- [ ] screenshots claro/escuro das telas principais; commit.

### Task 5: Tela de entrada + ilustração 3D + esqueci a senha
**Files:** Rewrite `src/pages/Login.tsx`; Create `src/pages/login/ScIllustration.tsx`, `src/pages/login/ForgotPassword.tsx`; Modify `src/app/session.tsx` (após login, voltar para a rota pedida em vez de `#/`).
- [ ] Layout e textos exatamente como na spec; sem lista de demonstração; `ThemeSwitch` no canto.
- [ ] Ilustração: miniatura da SC (faixas #002060, itens, total, 4 assinaturas, selo "Aprovada"), `transform: perspective(1400px) rotateX(18deg) rotateY(-16deg) rotateZ(3deg)`, `aria-hidden`.
- [ ] Esqueci a senha → `api.requestPasswordReset` e a mensagem neutra.
- [ ] screenshots desktop/celular claro/escuro; commit.

### Task 6: Pedir autorização por e-mail
**Files:** Create `src/pages/sc/EmailRequestModal.tsx`; Modify `src/pages/sc/ScDetail.tsx`
- [ ] Botão nos status válidos para solicitante/aprovador; Para pré-preenchido com `api.approverEmails`; Cc livre; prévia; "Abrir no Outlook" → `api.logEmailRequest` e depois `window.location.href = mailtoUrl(...)`.
- [ ] Playwright confirma navegação para `mailto:`; commit.

### Task 7: Painel do perfil e página Meu perfil
**Files:** Modify `src/components/layout/AppShell.tsx`; Rewrite `src/pages/Profile.tsx` (abas Dados do perfil / Segurança e verificação / Avisos por e-mail, via `?aba=`); Modify `src/App.tsx` (`/perfil` para todos os perfis).
- [ ] Popover com cabeçalho, 3 itens, Tema (`ThemeSwitch`) e Sair; fecha com Esc e clique fora; item "Minha assinatura" sai do menu.
- [ ] Troca de senha usa `api.changePassword`; assinatura em Dados do perfil para gestor/diretoria.
- [ ] screenshots; commit.

### Task 8: Fechamento
- [ ] `npx tsc --noEmit`, `npx vitest run`, fluxo completo no navegador (funcionário → gestor → diretor → financeiro), README (usuários de teste), push, republicar a demonstração.
