import { useEffect, useState } from 'react';
import { useQuery, useUser } from '@/app/session';
import { buildAuthorizationEmail, mailtoUrl, parseEmails } from '@/domain/emailRequest';
import type { PurchaseRequest } from '@/domain/types';
import { api } from '@/services/api';
import { Modal, useToast } from '@/components/ui/overlay';
import { Button, Field, Input } from '@/components/ui/primitives';
import { errMsg } from '../shared/lookups';

/** Link direto para a SC (quem não estiver logado entra e volta para ela). */
export const scLink = (id: string) => `${location.origin}${location.pathname}#/sc/ver?id=${encodeURIComponent(id)}`;

/**
 * Pedido de autorização por e-mail: monta o aviso com o link da SC e abre o programa de e-mail
 * do computador (Outlook) já preenchido. A autorização em si é feita no sistema, com a senha.
 */
export function EmailRequestModal({ open, sc, sectorName, onClose }: { open: boolean; sc: PurchaseRequest; sectorName: string; onClose: () => void }) {
  const user = useUser();
  const toast = useToast();
  const { data: approvers = [] } = useQuery(() => (open ? api.approverEmails(user, sc.id) : Promise.resolve([])), [open, sc.status]);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [error, setError] = useState('');
  const { subject, body } = buildAuthorizationEmail(sc, sectorName, scLink(sc.id));
  useEffect(() => {
    if (open) {
      setTo(approvers.join(', '));
      setCc('');
      setError('');
    }
  }, [open, approvers.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setError('');
    const toList = parseEmails(to);
    const ccList = parseEmails(cc);
    try {
      await api.logEmailRequest(user, sc.id, toList, ccList);
    } catch (e) {
      setError(errMsg(e));
      return;
    }
    window.location.href = mailtoUrl(toList, ccList, subject, body);
    toast('success', 'Abrindo o seu programa de e-mail com a mensagem pronta.');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Pedir autorização por e-mail"
      description="O Outlook abre com a mensagem pronta. É só conferir e clicar em Enviar."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button icon="mail" onClick={send}>Abrir no Outlook</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Para" hint="Já preenchido com quem precisa aprovar agora. Separe os e-mails por vírgula.">
          <Input id="mail-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="nome@amcomercial.com.br" />
        </Field>
        <Field label="Cc (opcional)">
          <Input id="mail-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Quem você quiser em cópia" />
        </Field>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-foreground/80">Prévia</div>
          <div className="rounded-md border bg-muted/50 p-4 text-sm">
            <div className="mb-2 font-semibold">{subject}</div>
            <pre className="whitespace-pre-wrap break-words font-sans text-muted-foreground">{body}</pre>
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Se o Outlook não abrir, o computador não tem um programa de e-mail configurado como padrão.
        </p>
        {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
