import type {
  Attachment,
  BudgetOverride,
  BudgetSummary,
  Category,
  Expense,
  ExpenseStatus,
  Month,
  Role,
  Sector,
  Transfer,
  TransferStatus,
  User,
} from '@/domain/types';

/**
 * Contrato da camada de dados. A UI depende APENAS desta interface.
 *
 * Toda operação recebe o usuário autenticado (`actor`) e é responsável por
 * aplicar o RBAC: um GESTOR nunca recebe dados de outro setor. No backend
 * Supabase a mesma garantia é dada por Row Level Security (ver supabase/migrations).
 */
export interface DataService {
  // Autenticação
  login(email: string, password: string): Promise<User>;
  getUser(id: string): Promise<User | null>;

  // Diretório público mínimo (apenas id/nome) — usado para escolher o setor cedente.
  sectorDirectory(actor: User): Promise<Pick<Sector, 'id' | 'name'>[]>;
  listCategories(actor: User, includeInactive?: boolean): Promise<Category[]>;

  // Orçamento
  getBudget(actor: User, sectorId: string, month: Month): Promise<BudgetSummary>;
  getAllBudgets(actor: User, month: Month): Promise<BudgetSummary[]>;

  // Despesas
  listExpenses(actor: User, filter?: ExpenseFilter): Promise<Expense[]>;
  createExpense(actor: User, input: NewExpense): Promise<Expense>;
  decideExpense(actor: User, id: string, approve: boolean, reason?: string): Promise<Expense>;
  cancelExpense(actor: User, id: string): Promise<Expense>;

  // Transferências de limite
  listTransfers(actor: User, filter?: TransferFilter): Promise<Transfer[]>;
  createTransfer(actor: User, input: NewTransfer): Promise<Transfer>;
  grantorDecide(actor: User, id: string, approve: boolean, note?: string): Promise<Transfer>;
  directorDecide(actor: User, id: string, approve: boolean, note?: string): Promise<Transfer>;
  cancelTransfer(actor: User, id: string): Promise<Transfer>;

  // Administração (somente DIRETORIA)
  listUsers(actor: User): Promise<User[]>;
  saveUser(actor: User, input: UserInput): Promise<User>;
  listSectors(actor: User): Promise<Sector[]>;
  saveSector(actor: User, input: Partial<Sector> & Pick<Sector, 'name' | 'defaultCeiling'>): Promise<Sector>;
  listOverrides(actor: User, month: Month): Promise<BudgetOverride[]>;
  setOverride(actor: User, sectorId: string, month: Month, ceiling: number | null): Promise<void>;
  saveCategory(actor: User, input: Partial<Category> & Pick<Category, 'name'>): Promise<Category>;

  /** Notifica a UI sobre qualquer alteração (para re-renderizar). */
  subscribe(listener: () => void): () => void;
}

export interface ExpenseFilter {
  month?: Month;
  sectorId?: string;
  requesterId?: string;
  status?: ExpenseStatus;
  categoryId?: string;
}

export interface TransferFilter {
  month?: Month;
  sectorId?: string;
  status?: TransferStatus;
}

export interface NewExpense {
  description: string;
  amount: number;
  categoryId: string;
  justification: string;
  attachment: Attachment | null;
  month: Month;
}

export interface NewTransfer {
  grantingSectorId: string;
  amount: number;
  justification: string;
  month: Month;
}

export interface UserInput {
  id?: string;
  name: string;
  email: string;
  role: Role;
  sectorId: string | null;
  active: boolean;
  /** Obrigatória na criação; opcional na edição (mantém a atual). */
  password?: string;
}

/** Erro de regra de negócio, exibido ao usuário. */
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
