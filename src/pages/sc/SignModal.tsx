import { useEffect, useState } from 'react';
import { useQuery, useUser } from '@/app/session';
import { money } from '@/domain/format';
import { api } from '@/services/api';
import { Modal } from '@/components/ui/overlay';
import { Button, Field, Input, Select } from '@/components/ui/primitives';
import { errMsg } from '../shared/lookups';
import { DrawPad } from '../shared/signature';

/** Texto do limite de liberação de um diretor. */
export const limitLabel = (limit: number | null) => (limit === null ? 'sem limite' : `até ${money(limit)}`);

/**
 * Confirmação de senha para aplicar a assinatura eletrônica.
 * - `chooseDirector`: na aprovação do setor, escolhe quem vai liberar o pagamento.
 * - Sem assinatura cadastrada, a pessoa desenha ali mesmo (fica salva no perfil).
 * A senha, o limite do diretor e as permissões são conferidos no serviço.
 */
export function SignModal({
  open,
  onClose,
  slotLabel,
  number,
  total,
  chooseDirector = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  slotLabel: string;
  number: string;
  total: number;
  chooseDirector?: boolean;
  onConfirm: (password: string, directorId: string) => Promise<void>;
}) {
  const user = useUser();
  const [password, setPassword] = useState('');
  const [directorId, setDirectorId] = useState('');
  const [drawn, setDrawn] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: directors = [] } = useQuery(() => (chooseDirector ? api.listDirectors(user) : Promise.resolve([])), [chooseDirector, open]);
  const eligible = directors.filter((d) => d.paymentLimit === null || total <= d.paymentLimit);
  useEffect(() => {
    if (open) {
      setPassword('');
      setError('');
      setDrawn(null);
      setDirectorId('');
    }
  }, [open]);

  const needsDrawing = !user.signature;
  const ready = !!password && (!needsDrawing || !!drawn) && (!chooseDirector || !!directorId);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      if (needsDrawing && drawn) await api.setMySignature(user, drawn);
      await onConfirm(password, directorId);
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assinar ${slotLabel}`}
      description={`${number} · ${money(total)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={busy || !ready}>{busy ? 'Assinando…' : chooseDirector ? 'Assinar e enviar ao diretor' : 'Assinar e liberar'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {chooseDirector && (
          <Field label="Diretor que vai liberar o pagamento" hint={`Aparecem os diretores que podem liberar ${money(total)}.`}>
            <Select id="sign-director" value={directorId} onChange={(e) => setDirectorId(e.target.value)}>
              <option value="">Selecione…</option>
              {eligible.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.cargo} ({limitLabel(d.paymentLimit)})</option>)}
            </Select>
          </Field>
        )}
        {chooseDirector && directors.length > eligible.length && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Fora da lista por limite: {directors.filter((d) => !eligible.includes(d)).map((d) => `${d.name} (${limitLabel(d.paymentLimit)})`).join(', ')}.
          </p>
        )}
        {needsDrawing ? (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Você ainda não tem assinatura cadastrada. Assine abaixo (ela fica salva no seu perfil):</div>
            <DrawPad onChange={setDrawn} />
          </div>
        ) : (
          <div className="rounded border bg-[#fafafa] px-4 pt-3 text-center">
            <img src={user.signature!.dataUrl} alt="Sua assinatura" className="mx-auto h-14 object-contain" />
            <div className="mx-auto mt-1 w-56 border-t border-foreground/60" />
            <div className="py-2 text-xs">
              <div className="font-semibold">{user.name} · {user.cargo}</div>
              <div className="text-muted-foreground">Assinado eletronicamente</div>
            </div>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          A assinatura entra no campo <strong className="text-foreground">{slotLabel}</strong> com data, hora e código de verificação. Se a SC for alterada depois, ela perde a validade.
        </p>
        <Field label="Confirme a sua senha">
          <Input id="sign-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ready && confirm()} />
        </Field>
        {error && <p className="rounded bg-[#fbeeee] px-3 py-2 text-sm text-[#a12626]">{error}</p>}
      </div>
    </Modal>
  );
}
