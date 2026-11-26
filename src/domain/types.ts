/**
 * Modelo de domínio — AM Comercial · Gestão de Despesas.
 * Valores monetários sempre em centavos (inteiros).
 */

export type Role = 'FUNCIONARIO' | 'GESTOR' | 'DIRETORIA' | 'FINANCEIRO' | 'ADMIN';

/** Competência no formato YYYY-MM. */
export type Month = string;

export interface SignatureImage {
  /** PNG com fundo transparente (data URL). */
  dataUrl: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Obrigatório para FUNCIONARIO e GESTOR; opcional para DIRETORIA (diretor responsável por um setor). */
  sectorId: string | null;
  /**
   * DIRETORIA: valor máximo (centavos) que pode liberar na Autorização de Pagamento.
   * null = sem limite (diretores gerais e diretora financeira).
   */
  paymentLimit: number | null;
  /** Cargo impresso abaixo da assinatura (ex.: "Diretora"). */
  cargo: string;
  active: boolean;
  signature: SignatureImage | null;
}

export interface UserRecord extends User {
  passwordHash: string;
}

export interface Sector {
  id: string;
  name: string;
  /** Limite mensal padrão (centavos). */
  monthlyLimit: number;
  active: boolean;
}

export interface LimitOverride {
  sectorId: string;
  month: Month;
  limit: number;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface Nature {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface BankData {
  bank: string;
  agency: string;
  account: string;
  pix: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact: string;
  bankData: BankData;
  active: boolean;
}

export type PaymentMethod = 'BOLETO' | 'BOLETO_PARCELADO' | 'PIX' | 'TRANSFERENCIA' | 'DINHEIRO' | 'OUTROS';

export interface Installment {
  /** Data de vencimento YYYY-MM-DD. */
  dueDate: string;
}

export interface Apportionment {
  costCenterId: string;
  /** Percentual com até 2 casas (ex.: 33.33). */
  percent: number;
}

export interface Item {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  surcharge: number;
}

/** Campos editáveis da Solicitação de Compras (o "conteúdo" que é assinado). */
export interface ScContent {
  supplierId: string | null;
  supplierName: string;
  supplierCode: string;
  contact: string;
  paymentMethod: PaymentMethod;
  installments: Installment[];
  apportionment: Apportionment[];
  invoiceInfo: string;
  natureId: string | null;
  items: Item[];
  bankData: BankData;
  notes: string;
}

export type ScStatus =
  | 'RASCUNHO'
  | 'AGUARDANDO_GESTOR'
  | 'DEVOLVIDA'
  | 'AGUARDANDO_DIRETORIA'
  | 'AGUARDANDO_NF'
  | 'ENVIADA_FINANCEIRO'
  | 'PAGA'
  | 'REPROVADA'
  | 'CANCELADA';

export type SignatureSlot = 'COMPRA' | 'PAGAMENTO';

export interface AppliedSignature {
  slot: SignatureSlot;
  userId: string;
  name: string;
  cargo: string;
  imageDataUrl: string;
  signedAt: string;
  ip: string;
  /** SHA-256 do conteúdo da SC no momento da assinatura. */
  contentHash: string;
  /** Código curto de verificação impresso no PDF. */
  code: string;
  /** Fase 2: método (interno, gov.br, provedor externo). */
  method: 'INTERNA' | 'GOVBR' | 'PROVEDOR';
  invalidatedAt?: string;
}

export type AttachmentKind = 'NF' | 'BOLETO' | 'COMPROVANTE' | 'ORCAMENTO' | 'COMPROVANTE_PAGAMENTO' | 'PDF_ASSINADO';

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  /** data URL no modo demonstração; caminho do Storage em produção. */
  url: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

export interface FieldChange {
  field: string;
  before: string;
  after: string;
  userId: string;
  userName: string;
  at: string;
}

export interface TimelineEntry {
  at: string;
  userId: string;
  userName: string;
  action: string;
  note?: string;
}

/** Mensagem da conversa da SC (perguntas entre solicitante e aprovadores). */
export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  at: string;
}

export interface PurchaseRequest extends ScContent {
  id: string;
  /** SC-2026-0001 */
  number: string;
  sectorId: string;
  requesterId: string;
  requesterName: string;
  /** Data da solicitação (YYYY-MM-DD) e competência derivada. */
  date: string;
  month: Month;
  createdAt: string;
  submittedAt?: string;
  status: ScStatus;
  /** Diretor escolhido na aprovação do setor para liberar o pagamento. */
  assignedDirectorId: string | null;
  assignedDirectorName: string | null;
  signatures: Partial<Record<SignatureSlot, AppliedSignature>>;
  attachments: Attachment[];
  changes: FieldChange[];
  timeline: TimelineEntry[];
  messages: ChatMessage[];
  returnReason?: string;
  rejectReason?: string;
  paidAt?: string;
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
  requestingSectorId: string;
  grantingSectorId: string;
  requesterId: string;
  requesterName: string;
  month: Month;
  amount: number;
  justification: string;
  status: TransferStatus;
  createdAt: string;
  history: TimelineEntry[];
}

export interface Notification {
  id: string;
  userId: string;
  text: string;
  scId?: string;
  at: string;
  read: boolean;
}

export type AlertLevel = 'ok' | 'attention' | 'critical' | 'over';

export interface BudgetSummary {
  sectorId: string;
  month: Month;
  baseLimit: number;
  transfersIn: number;
  transfersOut: number;
  /** Limite total = base + recebido − cedido. */
  limit: number;
  /** Aprovado pelo gestor, aguardando a Diretoria. */
  reserved: number;
  /** Aprovado pela Diretoria (inclui aguardando NF, financeiro e pagas). */
  consumed: number;
  available: number;
  usage: number;
  alert: AlertLevel;
}
