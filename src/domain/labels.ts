import type { AlertLevel, ExpenseStatus, TransferStatus } from './types';

export type Tone = 'neutral' | 'info' | 'good' | 'warning' | 'serious' | 'critical';

export const EXPENSE_STATUS: Record<ExpenseStatus, { label: string; tone: Tone }> = {
  PENDENTE_DIRETORIA: { label: 'Pendente Diretoria', tone: 'warning' },
  APROVADA: { label: 'Aprovada', tone: 'good' },
  REJEITADA: { label: 'Rejeitada', tone: 'critical' },
  CANCELADA: { label: 'Cancelada', tone: 'neutral' },
};

export const TRANSFER_STATUS: Record<TransferStatus, { label: string; tone: Tone }> = {
  PENDENTE_CEDENTE: { label: 'Aguardando cedente', tone: 'info' },
  PENDENTE_DIRETORIA: { label: 'Pendente Diretoria', tone: 'warning' },
  APROVADA: { label: 'Efetivada', tone: 'good' },
  RECUSADA_CEDENTE: { label: 'Recusada pelo cedente', tone: 'critical' },
  REJEITADA_DIRETORIA: { label: 'Rejeitada pela Diretoria', tone: 'critical' },
  CANCELADA: { label: 'Cancelada', tone: 'neutral' },
};

export const ALERT: Record<AlertLevel, { label: string; tone: Tone }> = {
  ok: { label: 'Dentro do orçamento', tone: 'good' },
  attention: { label: 'Atenção: acima de 80%', tone: 'warning' },
  critical: { label: 'Crítico: acima de 95%', tone: 'serious' },
  over: { label: 'Orçamento estourado', tone: 'critical' },
};
