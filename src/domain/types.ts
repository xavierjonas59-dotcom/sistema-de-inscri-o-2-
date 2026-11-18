/**
 * Modelo de domínio do Sistema de Controle de Despesas e Orçamentos MKSAL.
 * Estes tipos espelham as tabelas definidas em supabase/migrations.
 */

export type Role = 'DIRETORIA' | 'GESTOR';

/** Competência no formato YYYY-MM (ex.: "2026-11"). */
export type Month = string;

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Obrigatório para GESTOR; nulo para DIRETORIA. */
  sectorId: string | null;
  active: boolean;
}

/** Registro interno com credencial (apenas no modo demonstração local). */
export interface UserRecord extends User {
  password: string;
}

export interface Sector {
  id: string;
  name: string;
  /** Teto mensal padrão em centavos. */
  defaultCeiling: number;
  active: boolean;
}

/** Teto específico de um setor em uma competência (sobrepõe o padrão). */
export interface BudgetOverride {
  sectorId: string;
  month: Month;
  ceiling: number;
}

export interface Category {
  id: string;
  name: string;
  active: boolean;
}

export interface Attachment {
  name: string;
  mimeType: string;
  size: number;
  /** data URL no modo local; caminho do Storage no Supabase. */
  url: string;
}

export interface HistoryEntry {
  at: string;
  userId: string;
  userName: string;
  action: string;
  note?: string;
}

export type ExpenseStatus = 'PENDENTE_DIRETORIA' | 'APROVADA' | 'REJEITADA' | 'CANCELADA';

export interface Expense {
  id: string;
  sectorId: string;
  requesterId: string;
  /** Nome do solicitante (desnormalizado para exibição). */
  requesterName: string;
  month: Month;
  description: string;
  /** Valor em centavos. */
  amount: number;
  categoryId: string;
  justification: string;
  attachment: Attachment | null;
  status: ExpenseStatus;
  decisionReason?: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  history: HistoryEntry[];
}

export type TransferStatus =
  | 'PENDENTE_CEDENTE'
  | 'PENDENTE_DIRETORIA'
  | 'APROVADA'
  | 'RECUSADA_CEDENTE'
  | 'REJEITADA_DIRETORIA'
  | 'CANCELADA';

export interface Transfer {
  id: string;
  /** Setor que pede o limite emprestado. */
  requestingSectorId: string;
  /** Setor que cede parte do seu teto. */
  grantingSectorId: string;
  requesterId: string;
  requesterName: string;
  month: Month;
  amount: number;
  justification: string;
  status: TransferStatus;
  grantorDecisionBy?: string;
  grantorDecisionAt?: string;
  grantorNote?: string;
  directorDecisionBy?: string;
  directorDecisionAt?: string;
  directorNote?: string;
  createdAt: string;
  history: HistoryEntry[];
}

export type AlertLevel = 'ok' | 'attention' | 'critical' | 'over';

export interface BudgetSummary {
  sectorId: string;
  month: Month;
  /** Teto base (padrão ou específico da competência). */
  baseCeiling: number;
  transfersIn: number;
  transfersOut: number;
  /** Teto efetivo = base + recebido − cedido (transferências aprovadas). */
  ceiling: number;
  approved: number;
  pending: number;
  available: number;
  /** (aprovado + pendente) / teto, de 0 a ∞. */
  usage: number;
  alert: AlertLevel;
}
