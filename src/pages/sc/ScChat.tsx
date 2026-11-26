import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useUser } from '@/app/session';
import { dateTime } from '@/domain/format';
import type { PurchaseRequest } from '@/domain/types';
import { api } from '@/services/api';
import { Icon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/overlay';
import { Card, CardHeader, cx } from '@/components/ui/primitives';
import { errMsg } from '../shared/lookups';

const initials = (n: string) => n.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

/** Conversa da SC: perguntas entre quem aprova e quem pediu. Cada mensagem avisa os outros no sininho. */
export function ScChat({ sc }: { sc: PurchaseRequest }) {
  const user = useUser();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const closed = ['PAGA', 'REPROVADA', 'CANCELADA'].includes(sc.status);
  const canWrite = !closed && user.role !== 'ADMIN';
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [sc.messages.length]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.postMessage(user, sc.id, text);
      setText('');
    } catch (err) {
      toast('error', errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex h-fit flex-col">
      <CardHeader title="Conversa" subtitle={closed ? 'Solicitação encerrada: só leitura.' : 'Pergunte algo a quem pediu ou a quem aprova.'} />
      <ol ref={list} className="max-h-80 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {sc.messages.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</li>}
        {sc.messages.map((m) => {
          const mine = m.userId === user.id;
          return (
            <li key={m.id} className={cx('flex gap-2.5', mine && 'flex-row-reverse')}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-info-soft text-[11px] font-semibold text-brand">{initials(m.userName)}</span>
              <div className={cx('max-w-[85%]', mine && 'text-right')}>
                <div className="text-[12px] text-muted-foreground">{mine ? 'Você' : m.userName}, {dateTime(m.at)}</div>
                <div className={cx('mt-0.5 inline-block whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-left text-sm', mine ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{m.text}</div>
              </div>
            </li>
          );
        })}
      </ol>
      {canWrite && (
        <form onSubmit={send} className="flex items-end gap-2 border-t p-3">
          <textarea
            id="chat-text"
            rows={1}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Escreva uma mensagem…"
            aria-label="Mensagem"
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
          />
          <button type="submit" disabled={busy || !text.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-40" aria-label="Enviar mensagem">
            <Icon name="chevronRight" size={18} />
          </button>
        </form>
      )}
    </Card>
  );
}
