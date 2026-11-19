import { useEffect, useState } from 'react';
import { useUser } from '@/app/session';
import { money } from '@/domain/format';
import { Modal } from '@/components/ui/overlay';
import { Button, Field, Input } from '@/components/ui/primitives';
import { errMsg } from '../shared/lookups';

/**
 * Confirmação de senha para aplicar a assinatura eletrônica.
 * A senha é conferida no serviço; esta tela só a coleta.
 */
export function SignModal({
  open,
  onClose,
  slotLabel,
  number,
  total,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  slotLabel: string;
  number: string;
  total: number;
  onConfirm: (password: string) => Promise<void>;
}) {
  const user = useUser();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPassword('');
      setError('');
    }
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(password);
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
          <Button onClick={confirm} disabled={busy || !password || !user.signature}>{busy ? 'Assinando…' : 'Assinar e aprovar'}</Button>
        </>
      }
    >
      {user.signature ? (
        <div className="space-y-4">
          <div className="rounded border bg-[#fafafa] px-4 pt-3 text-center">
            <img src={user.signature.dataUrl} alt="Sua assinatura" className="mx-auto h-16 object-contain" />
            <div className="mx-auto mt-1 w-56 border-t border-foreground/60" />
            <div className="py-2 text-xs">
              <div className="font-semibold">{user.name}</div>
              <div className="text-muted-foreground">{user.cargo}</div>
              <div className="text-muted-foreground">Assinado eletronicamente</div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Ao confirmar, a sua assinatura é aplicada no campo <strong className="text-foreground">{slotLabel}</strong> com data, hora e um código de
            verificação. Se a SC for alterada depois, a assinatura perde a validade.
          </p>
          <Field label="Confirme a sua senha">
            <Input id="sign-password" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && password && confirm()} />
          </Field>
          {error && <p className="rounded bg-[#fbeeee] px-3 py-2 text-sm text-[#a12626]">{error}</p>}
        </div>
      ) : (
        <p className="text-sm">
          Você ainda não cadastrou a sua assinatura. <a className="font-medium text-primary underline" href="#/perfil">Cadastrar em Meu perfil</a>.
        </p>
      )}
    </Modal>
  );
}
