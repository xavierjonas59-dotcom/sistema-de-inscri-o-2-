import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ALERT, type Tone } from '@/domain/labels';
import type { AlertLevel } from '@/domain/types';
import { Icon, type IconName } from './icons';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
  secondary: 'bg-white text-foreground border border-input hover:bg-muted',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  danger: 'bg-[#d03b3b] text-white hover:bg-[#b83232] shadow-sm',
  success: 'bg-[#0a8a0a] text-white hover:bg-[#087508] shadow-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: IconName }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border bg-card shadow-card', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  info: 'bg-blue-50 text-blue-800 ring-blue-200',
  good: 'bg-green-50 text-green-800 ring-green-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  serious: 'bg-orange-50 text-orange-800 ring-orange-200',
  critical: 'bg-red-50 text-red-800 ring-red-200',
};
const toneDot: Record<Tone, string> = {
  neutral: 'bg-gray-400',
  info: 'bg-series',
  good: 'bg-status-good',
  warning: 'bg-status-warning',
  serious: 'bg-status-serious',
  critical: 'bg-status-critical',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', toneClasses[tone])}>
      <span className={cx('h-1.5 w-1.5 rounded-full', toneDot[tone])} />
      {children}
    </span>
  );
}

const alertBar: Record<AlertLevel, string> = {
  ok: 'bg-series',
  attention: 'bg-status-warning',
  critical: 'bg-status-serious',
  over: 'bg-status-critical',
};
const alertIcon: Record<AlertLevel, IconName> = { ok: 'circleCheck', attention: 'alert', critical: 'alert', over: 'alert' };

/**
 * Barra de consumo do orçamento: segmento sólido = aprovado, segmento claro = em análise.
 * A cor muda com o nível de alerta e é sempre acompanhada de rótulo textual.
 */
export function BudgetBar({
  approved,
  pending,
  ceiling,
  alert,
  showLegend = false,
}: {
  approved: number;
  pending: number;
  ceiling: number;
  alert: AlertLevel;
  showLegend?: boolean;
}) {
  const base = Math.max(ceiling, approved + pending, 1);
  const a = (approved / base) * 100;
  const p = (pending / base) * 100;
  return (
    <div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`Consumo do orçamento: ${ALERT[alert].label}`}>
        <div className={cx('absolute inset-y-0 left-0 rounded-l-full', alertBar[alert])} style={{ width: `${a}%` }} />
        <div
          className={cx('absolute inset-y-0 opacity-40', alertBar[alert])}
          style={{ left: `calc(${a}% + ${a > 0 ? 2 : 0}px)`, width: `${Math.max(0, p - (a > 0 ? 0.3 : 0))}%` }}
        />
        {/* marcador de 80% */}
        <div className="absolute inset-y-0 w-px bg-foreground/30" style={{ left: `${(0.8 * ceiling * 100) / base}%` }} title="80% do teto" />
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className={cx('h-2 w-3 rounded-sm', alertBar[alert])} />Aprovado</span>
          <span className="inline-flex items-center gap-1.5"><span className={cx('h-2 w-3 rounded-sm opacity-40', alertBar[alert])} />Em análise</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-foreground/40" />Limite de alerta (80%)</span>
        </div>
      )}
    </div>
  );
}

export function AlertBadge({ level }: { level: AlertLevel }) {
  const { label, tone } = ALERT[level];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', toneClasses[tone])}>
      <Icon name={alertIcon[level]} size={12} />
      {label}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: IconName;
  emphasis?: Tone;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={cx('grid h-9 w-9 place-items-center rounded-lg', emphasis ? toneClasses[emphasis] : 'bg-muted text-muted-foreground')}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="tabular mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon name={icon} size={22} />
      </span>
      <p className="mt-3 text-sm font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

const inputBase =
  'rounded-lg border border-input bg-white px-3 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted';

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputBase, 'h-10 w-full', p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={3} {...p} className={cx(inputBase, 'w-full py-2', p.className)} />
);
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputBase, 'pr-8', !/\bh-\d/.test(p.className ?? '') && 'h-10', !/\bw-/.test(p.className ?? '') && 'w-full', p.className)} />;

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-1" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === it.value ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className={cx('rounded-full px-1.5 text-xs tabular', value === it.value ? 'bg-primary/10 text-primary' : 'bg-white/70')}>{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Tabela responsiva simples. */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th className={cx('whitespace-nowrap border-b bg-muted/50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground', right && 'text-right')}>
    {children}
  </th>
);
export const Td = ({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <td className={cx('border-b px-4 py-3 align-top', right && 'text-right tabular', className)}>{children}</td>
);
