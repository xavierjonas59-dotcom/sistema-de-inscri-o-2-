import type { AlertLevel, TransferStatus } from './types';

export type Tone = 'neutral' | 'info' | 'good' | 'warning' | 'serious' | 'critical';

export const TRANSFER_STATUS: Record<TransferStatus, { label: string; tone: Tone }> = {
  PENDENTE_CEDENTE: { label: 'Aguardando cedente', tone: 'info' },
  PENDENTE_DIRETORIA: { label: 'Aguardando diretoria', tone: 'warning' },
  APROVADA: { label: 'Efetivada', tone: 'good' },
  RECUSADA_CEDENTE: { label: 'Recusada pelo cedente', tone: 'critical' },
  REJEITADA_DIRETORIA: { label: 'Rejeitada pela diretoria', tone: 'critical' },
  CANCELADA: { label: 'Cancelada', tone: 'neutral' },
};

export const ALERT: Record<AlertLevel, { label: string; tone: Tone }> = {
  ok: { label: 'Dentro do limite', tone: 'good' },
  attention: { label: 'Acima de 80%', tone: 'warning' },
  critical: { label: 'Acima de 95%', tone: 'serious' },
  over: { label: 'Limite estourado', tone: 'critical' },
};
