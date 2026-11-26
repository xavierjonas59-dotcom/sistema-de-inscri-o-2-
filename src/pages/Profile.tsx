import { useState, type FormEvent } from 'react';
import { navigate, useQuery, useUser } from '@/app/session';
import { dateTime } from '@/domain/format';
import { ROLE_LABEL } from '@/domain/sc';
import { api } from '@/services/api';
import { useToast } from '@/components/ui/overlay';
import { Button, Card, CardHeader, Field, Input, PageHeader, Tabs, cx } from '@/components/ui/primitives';
import { errMsg } from './shared/lookups';
import { DrawPad, photoToSignature } from './shared/signature';

function SignaturePreview({ src, name, cargo, slot }: { src: string | null; name: string; cargo: string; slot: string }) {
  return (
    <div className="rounded border bg-card">
      <div className="bg-sheet px-3 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-white">{slot}</div>
      <div className="flex flex-col items-center px-4 pb-3 pt-4 text-center text-xs">
        <div className="flex h-16 items-end">{src ? <img src={src} alt="Prévia da assinatura" className="max-h-16 max-w-[260px] object-contain dark:rounded dark:bg-white dark:px-1.5 dark:py-0.5" /> : <span className="text-muted-foreground">Sem assinatura</span>}</div>
        <div className="mt-1 w-64 border-t border-foreground/60" />
        <div className="mt-1 font-semibold">{name}</div>
        <div className="text-muted-foreground">{cargo}</div>
        <div className="text-muted-foreground">Assinado eletronicamente em dd/mm/aaaa às hh:mm</div>
        <div className="text-muted-foreground">Cód. verificação: XXXX-XXXX</div>
      </div>
    </div>
  );
}

function SignatureSection() {
  const user = useUser();
  const toast = useToast();
  const [mode, setMode] = useState<'foto' | 'desenhar'>('foto');
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSign = user.role === 'GESTOR' || user.role === 'DIRETORIA';
  // Diretor de setor assina as duas; diretor geral e diretora financeira, a de pagamento; gestor, a de compra.
  const slot = user.role !== 'DIRETORIA' ? 'Autorização de Compra' : user.sectorId ? 'Autorização de Compra e de Pagamento' : 'Autorização de Pagamento';

  const save = async (value: string | null) => {
    setBusy(true);
    try {
      await api.setMySignature(user, value);
      setDraft(null);
      toast('success', value ? 'Assinatura salva.' : 'Assinatura removida.');
    } catch (e) {
      toast('error', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {canSign && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Cadastrar assinatura" subtitle={`Usada somente na ${slot}, depois de você confirmar a senha.`} />
            <div className="space-y-4 p-4">
              <Tabs value={mode} onChange={(m) => { setMode(m); setDraft(null); }} items={[{ value: 'foto', label: 'Enviar foto' }, { value: 'desenhar', label: 'Desenhar na tela' }]} />
              {mode === 'foto' ? (
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">Assine com caneta azul ou preta numa folha branca, tire uma foto bem iluminada e envie. O fundo do papel é removido automaticamente. PNG com fundo transparente também é aceito.</p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="block w-full text-sm"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        setDraft(await photoToSignature(f));
                      } catch (err) {
                        toast('error', errMsg(err));
                      }
                    }}
                  />
                </div>
              ) : (
                <DrawPad onChange={setDraft} />
              )}
              <div className="flex gap-2">
                <Button disabled={!draft || busy} onClick={() => save(draft)}>Salvar esta assinatura</Button>
                {user.signature && <Button variant="ghost" disabled={busy} onClick={() => save(null)}>Remover assinatura atual</Button>}
              </div>
            </div>
          </Card>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">{draft ? 'Prévia da nova assinatura' : 'Como sai no documento'}</h2>
            <SignaturePreview src={draft ?? user.signature?.dataUrl ?? null} name={user.name} cargo={user.cargo} slot={slot} />
            {user.signature && !draft && <p className="text-xs text-muted-foreground">Atualizada em {dateTime(user.signature.updatedAt)}.</p>}
            <div className={cx('rounded border bg-card p-3 text-xs text-muted-foreground')}>
              Cada aplicação registra data, hora, IP, usuário e um código (hash) do conteúdo da SC. Se a SC for alterada depois, a assinatura deixa de valer e precisa ser refeita.
              A assinatura com certificado (gov.br, ZapSign, Clicksign ou D4Sign) fica para a fase 2.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type Section = 'dados' | 'seguranca' | 'avisos';

/** Meu perfil: Dados do perfil (com a assinatura), Segurança e verificação, Avisos por e-mail. */
export default function Profile({ query }: { query: URLSearchParams }) {
  const user = useUser();
  const aba = (['dados', 'seguranca', 'avisos'].includes(query.get('aba') ?? '') ? query.get('aba') : 'dados') as Section;
  const { data: sectors = [] } = useQuery(() => api.sectorDirectory(user), [user.id]);
  const sectorName = sectors.find((x) => x.id === user.sectorId)?.name;
  return (
    <>
      <PageHeader title="Meu perfil" description={user.email} />
      <div className="mb-6">
        <Tabs<Section>
          value={aba}
          onChange={(v) => navigate(`/perfil?aba=${v}`)}
          items={[
            { value: 'dados', label: 'Dados do perfil' },
            { value: 'seguranca', label: 'Segurança e verificação' },
            { value: 'avisos', label: 'Avisos por e-mail' },
          ]}
        />
      </div>
      {aba === 'dados' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Dados do perfil" subtitle="Para alterar nome, e-mail, cargo ou setor, fale com o administrador do sistema." />
            <dl className="grid gap-x-8 gap-y-4 px-5 py-5 sm:grid-cols-2">
              {[
                ['Nome', user.name],
                ['E-mail', user.email],
                ['Cargo', user.cargo || '—'],
                ['Perfil', ROLE_LABEL[user.role]],
                ['Setor', sectorName ?? (user.role === 'DIRETORIA' ? 'Diretoria geral' : '—')],
                ...(user.role === 'DIRETORIA' ? [['Libera pagamentos', user.paymentLimit === null ? 'Qualquer valor' : `Até ${(user.paymentLimit / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[13px] text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {(user.role === 'GESTOR' || user.role === 'DIRETORIA') && (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Assinatura</h2>
              <SignatureSection />
            </div>
          )}
        </div>
      )}
      {aba === 'seguranca' && <SecuritySection />}
      {aba === 'avisos' && (
        <Card>
          <CardHeader title="Avisos por e-mail" subtitle="Em breve" />
          <div className="space-y-2 px-5 py-5 text-sm text-muted-foreground">
            <p>O envio automático de avisos por e-mail ainda será ativado. Hoje os avisos chegam pelo sininho, no topo da tela.</p>
            <p>Para pedir uma autorização por e-mail agora, abra a solicitação e use “Pedir autorização por e-mail”.</p>
          </div>
        </Card>
      )}
    </>
  );
}

function SecuritySection() {
  const user = useUser();
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (f.next !== f.confirm) return setError('A confirmação não confere com a nova senha.');
    setBusy(true);
    try {
      await api.changePassword(user, f.current, f.next);
      setF({ current: '', next: '', confirm: '' });
      toast('success', 'Senha alterada.');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="max-w-xl">
      <CardHeader title="Trocar senha" subtitle="A mesma senha é usada para entrar e para confirmar as suas assinaturas." />
      <form onSubmit={submit} className="space-y-4 px-5 py-5">
        <Field label="Senha atual"><Input id="pw-current" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></Field>
        <Field label="Nova senha" hint="Mínimo de 6 caracteres."><Input id="pw-next" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required /></Field>
        <Field label="Confirmar nova senha"><Input id="pw-confirm" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></Field>
        {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</Button>
      </form>
    </Card>
  );
}
