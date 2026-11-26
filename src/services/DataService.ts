import type {
  Attachment,
  AttachmentKind,
  BudgetSummary,
  CostCenter,
  LimitOverride,
  Month,
  Nature,
  Notification,
  PurchaseRequest,
  Role,
  ScContent,
  ScStatus,
  Sector,
  Supplier,
  Transfer,
  TransferStatus,
  User,
} from '@/domain/types';

/** Dados da requisição usados na trilha de auditoria da assinatura. */
export interface RequestContext {
  ip: string;
}

export type NewFile = Pick<Attachment, 'name' | 'mimeType' | 'size' | 'url'>;

/**
 * Contrato da camada de dados. A UI depende APENAS desta interface.
 * Toda operação recebe o usuário autenticado (`actor`) e a implementação revalida
 * perfil, setor e estado — esconder botões na tela nunca é a única barreira.
 */
export interface DataService {
  login(email: string, password: string): Promise<User>;
  /** "Esqueci a senha": sem login; avisa os Admins se o e-mail existir. Nunca revela se existe. */
  requestPasswordReset(email: string): Promise<void>;
  changePassword(actor: User, current: string, next: string): Promise<void>;
  getUser(id: string): Promise<User | null>;

  // Cadastros de apoio (leitura para todos os autenticados)
  sectorDirectory(actor: User): Promise<Pick<Sector, 'id' | 'name'>[]>;
  listCostCenters(actor: User, includeInactive?: boolean): Promise<CostCenter[]>;
  listNatures(actor: User, includeInactive?: boolean): Promise<Nature[]>;
  listSuppliers(actor: User, includeInactive?: boolean): Promise<Supplier[]>;
  saveSupplier(actor: User, input: Partial<Supplier> & Pick<Supplier, 'name'>): Promise<Supplier>;

  // Saldo do setor
  getBudget(actor: User, sectorId: string, month: Month): Promise<BudgetSummary>;
  getAllBudgets(actor: User, month: Month): Promise<BudgetSummary[]>;

  // Solicitação de Compras
  listRequests(actor: User, filter?: RequestFilter): Promise<PurchaseRequest[]>;
  getRequest(actor: User, id: string): Promise<PurchaseRequest>;
  saveDraft(actor: User, id: string | null, content: ScContent): Promise<PurchaseRequest>;
  /** directorId: obrigatório quando quem envia é gestor/diretor do setor (já assina a Autorização de Compra). */
  submit(actor: User, id: string, password: string | null, ctx: RequestContext, directorId?: string): Promise<PurchaseRequest>;
  managerEdit(actor: User, id: string, content: ScContent): Promise<PurchaseRequest>;
  /** Aprovação do setor (gestor ou diretor do setor): assina a Autorização de Compra e escolhe o diretor do pagamento. */
  managerApprove(actor: User, id: string, password: string, ctx: RequestContext, directorId: string): Promise<PurchaseRequest>;
  /** O diretor escolhido repassa a liberação do pagamento para outro diretor. */
  forwardToDirector(actor: User, id: string, directorId: string, note: string): Promise<PurchaseRequest>;
  /** Diretores e o limite de liberação de cada um (para a escolha do aprovador). */
  listDirectors(actor: User): Promise<DirectorInfo[]>;
  returnForAdjustment(actor: User, id: string, reason: string): Promise<PurchaseRequest>;
  reject(actor: User, id: string, reason: string): Promise<PurchaseRequest>;
  directorApprove(actor: User, id: string, password: string, ctx: RequestContext): Promise<PurchaseRequest>;
  cancel(actor: User, id: string): Promise<PurchaseRequest>;
  addAttachment(actor: User, id: string, kind: AttachmentKind, file: NewFile): Promise<PurchaseRequest>;
  removeAttachment(actor: User, id: string, attachmentId: string): Promise<PurchaseRequest>;
  sendToFinance(actor: User, id: string): Promise<PurchaseRequest>;
  markPaid(actor: User, id: string, paidAt: string, proof: NewFile): Promise<PurchaseRequest>;
  /** E-mails de quem precisa aprovar a SC agora (para o pedido de autorização por e-mail). */
  approverEmails(actor: User, id: string): Promise<string[]>;
  /** Registra na linha do tempo que o pedido de autorização foi enviado por e-mail. */
  logEmailRequest(actor: User, id: string, to: string[], cc: string[]): Promise<PurchaseRequest>;
  /** Página pública de validação (QR code): não exige login. */
  validate(number: string): Promise<ValidationResult | null>;

  // Usuários e assinatura
  listUsers(actor: User): Promise<User[]>;
  saveUser(actor: User, input: UserInput): Promise<User>;
  setMySignature(actor: User, dataUrl: string | null): Promise<User>;

  // Administração
  listSectors(actor: User): Promise<Sector[]>;
  saveSector(actor: User, input: Partial<Sector> & Pick<Sector, 'name' | 'monthlyLimit'>): Promise<Sector>;
  listOverrides(actor: User, month: Month): Promise<LimitOverride[]>;
  setOverride(actor: User, sectorId: string, month: Month, limit: number | null): Promise<void>;
  saveCostCenter(actor: User, input: Partial<CostCenter> & Pick<CostCenter, 'code' | 'name'>): Promise<CostCenter>;
  saveNature(actor: User, input: Partial<Nature> & Pick<Nature, 'code' | 'name'>): Promise<Nature>;

  // Transferência temporária de limite entre setores
  listTransfers(actor: User, filter?: { status?: TransferStatus; month?: Month }): Promise<Transfer[]>;
  createTransfer(actor: User, input: { grantingSectorId: string; amount: number; justification: string; month: Month }): Promise<Transfer>;
  grantorDecide(actor: User, id: string, approve: boolean, note?: string): Promise<Transfer>;
  directorDecideTransfer(actor: User, id: string, approve: boolean, note?: string): Promise<Transfer>;
  cancelTransfer(actor: User, id: string): Promise<Transfer>;

  // Notificações
  listNotifications(actor: User): Promise<Notification[]>;
  markNotificationsRead(actor: User, ids: string[]): Promise<void>;

  subscribe(listener: () => void): () => void;
}

export interface DirectorInfo {
  id: string;
  name: string;
  cargo: string;
  sectorId: string | null;
  paymentLimit: number | null;
}

export interface RequestFilter {
  month?: Month;
  status?: ScStatus | ScStatus[];
  sectorId?: string;
  mine?: boolean;
}

export interface UserInput {
  id?: string;
  name: string;
  email: string;
  role: Role;
  sectorId: string | null;
  cargo: string;
  active: boolean;
  paymentLimit?: number | null;
  password?: string;
}

export interface ValidationResult {
  number: string;
  status: ScStatus;
  sectorName: string;
  requesterName: string;
  date: string;
  total: number;
  signatures: { slot: string; name: string; cargo: string; signedAt: string; code: string; valid: boolean }[];
}

export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

export class ForbiddenError extends BusinessError {
  constructor(message = 'Acesso negado para o seu perfil.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
