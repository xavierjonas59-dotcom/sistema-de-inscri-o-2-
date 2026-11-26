import { useState } from 'react';
import { useUser } from '@/app/session';
import { dateTime } from '@/domain/format';
import { ROLE_LABEL } from '@/domain/sc';
import { api } from '@/services/api';
import { useToast } from '@/components/ui/overlay';
import { Button, Card, CardHeader, PageHeader, Tabs, cx } from '@/components/ui/primitives';
import { errMsg } from './shared/lookups';
import { DrawPad, photoToSignature } from './shared/signature';

function SignaturePreview({ src, name, cargo }: { src: string | null; name: string; cargo: string }) {
  return (
    <div className="rounded border bg-card">
      <div className="bg-sheet px-3 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-white">Autorização de pagamento</div>
      <div className="flex flex-col items-center px-4 pb-3 pt-4 text-center text-xs">
        <div className="flex h-16 items-end">{src ? <img src={src} alt="Prévia da assinatura" className="max-h-16 max-w-[260px] object-contain" /> : <span className="text-muted-foreground">Sem assinatura</span>}</div>
        <div className="mt-1 w-64 border-t border-foreground/60" />
        <div className="mt-1 font-semibold">{name}</div>
        <div className="text-muted-foreground">{cargo}</div>
        <div className="text-muted-foreground">Assinado eletronicamente em dd/mm/aaaa às hh:mm</div>
        <div className="text-muted-foreground">Cód. verificação: XXXX-XXXX</div>
      </div>
    </div>
  );
}

export default function Profile() {
  const user = useUser();
  const toast = useToast();
  const [mode, setMode] = useState<'foto' | 'desenhar'>('foto');
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSign = user.role === 'GESTOR' || user.role === 'DIRETORIA';
  const slot = user.role === 'DIRETORIA' ? 'Autorização de Pagamento' : 'Autorização de Compra';

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
      <PageHeader title="Meu perfil" description={`${user.name}, ${(user.cargo || ROLE_LABEL[user.role]).toLowerCase()} (${user.email})`} />
      {!canSign ? (
        <p className="text-sm text-muted-foreground">O seu perfil não assina solicitações.</p>
      ) : (
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
            <SignaturePreview src={draft ?? user.signature?.dataUrl ?? null} name={user.name} cargo={user.cargo} />
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
