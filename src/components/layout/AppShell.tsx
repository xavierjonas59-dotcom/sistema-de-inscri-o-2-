import { useState, type ReactNode } from 'react';
import { monthLabel, shiftMonth } from '@/domain/format';
import { useQuery, useSession, useUser } from '@/app/session';
import { api } from '@/services/api';
import { Icon, type IconName } from '@/components/ui/icons';
import { cx } from '@/components/ui/primitives';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  badge?: number;
}

export function AppShell({ path, children }: { path: string; children: ReactNode }) {
  const user = useUser();
  const { logout, month, setMonth } = useSession();
  const [open, setOpen] = useState(false);
  const isDir = user.role === 'DIRETORIA';

  const { data: badges } = useQuery(async () => {
    if (isDir) {
      const [e, t] = await Promise.all([
        api.listExpenses(user, { status: 'PENDENTE_DIRETORIA' }),
        api.listTransfers(user, { status: 'PENDENTE_DIRETORIA' }),
      ]);
      return { approvals: e.length + t.length, transfers: 0 };
    }
    const t = await api.listTransfers(user, { status: 'PENDENTE_CEDENTE' });
    return { approvals: 0, transfers: t.filter((x) => x.grantingSectorId === user.sectorId).length };
  }, [user.id]);

  const { data: sectors } = useQuery(() => api.sectorDirectory(user), [user.id]);
  const sectorName = sectors?.find((s) => s.id === user.sectorId)?.name;

  const groups: { title?: string; items: NavItem[] }[] = isDir
    ? [
        {
          items: [
            { path: '/', label: 'Visão geral', icon: 'dashboard' },
            { path: '/aprovacoes', label: 'Central de aprovações', icon: 'check', badge: badges?.approvals },
            { path: '/despesas', label: 'Despesas', icon: 'receipt' },
            { path: '/transferencias', label: 'Transferências', icon: 'transfer' },
            { path: '/relatorios', label: 'Relatórios', icon: 'report' },
          ],
        },
        {
          title: 'Cadastros',
          items: [
            { path: '/admin/setores', label: 'Setores e tetos', icon: 'building' },
            { path: '/admin/naturezas', label: 'Naturezas de despesa', icon: 'tag' },
            { path: '/admin/usuarios', label: 'Usuários', icon: 'users' },
          ],
        },
      ]
    : [
        {
          items: [
            { path: '/', label: 'Meu painel', icon: 'dashboard' },
            { path: '/despesas', label: 'Minhas solicitações', icon: 'receipt' },
            { path: '/transferencias', label: 'Transferências de limite', icon: 'transfer', badge: badges?.transfers },
          ],
        },
      ];

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-sm font-bold text-white">MK</div>
        <div>
          <div className="text-sm font-semibold text-white">MKSAL</div>
          <div className="text-xs text-sidebar-foreground/70">Despesas & Orçamentos</div>
        </div>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {groups.map((g, i) => (
          <div key={i}>
            {g.title && <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{g.title}</div>}
            <ul className="space-y-1">
              {g.items.map((it) => {
                const active = it.path === '/' ? path === '/' : path.startsWith(it.path);
                return (
                  <li key={it.path}>
                    <a
                      href={`#${it.path}`}
                      onClick={() => setOpen(false)}
                      className={cx(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        active ? 'bg-white/10 font-medium text-white' : 'text-sidebar-foreground hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <Icon name={it.icon} />
                      <span className="flex-1">{it.label}</span>
                      {!!it.badge && (
                        <span className="tabular rounded-full bg-status-warning px-2 text-xs font-semibold text-slate-900">{it.badge}</span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold text-white">
            {user.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user.name}</div>
            <div className="truncate text-xs text-sidebar-foreground/70">{isDir ? 'Diretoria · Master' : `Gestor · ${sectorName ?? ''}`}</div>
          </div>
          <button onClick={logout} className="rounded-md p-2 text-sidebar-foreground hover:bg-white/10 hover:text-white" title="Sair" aria-label="Sair">
            <Icon name="logout" />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 bg-sidebar lg:block">{nav}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar" onClick={(e) => e.stopPropagation()}>
            {nav}
          </aside>
        </div>
      )}
      <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur sm:px-6">
        <button className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Icon name="menu" />
        </button>
        <div className="hidden text-sm text-muted-foreground sm:block">
          {isDir ? 'Visão consolidada · todos os setores' : <>Setor <strong className="text-foreground">{sectorName}</strong></>}
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-lg border bg-white p-1 shadow-sm" aria-label="Competência">
          <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="min-w-[140px] text-center text-sm font-medium tabular">{monthLabel(month)}</span>
          <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </header>
      <main className="print-full mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
