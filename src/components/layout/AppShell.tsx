import { useEffect, useRef, useState, type ReactNode } from 'react';
import logo from '@/assets/logo-am-comercial.jpg';
import { navigate, useQuery, useSession, useUser } from '@/app/session';
import { dateTime, monthLabel, shiftMonth } from '@/domain/format';
import { ROLE_LABEL } from '@/domain/sc';
import type { Role } from '@/domain/types';
import { api } from '@/services/api';
import { Icon } from '@/components/ui/icons';
import { cx } from '@/components/ui/primitives';

interface NavItem {
  path: string;
  label: string;
  badge?: number;
}

export function AppShell({ path, children }: { path: string; children: ReactNode }) {
  const user = useUser();
  const { logout, month, setMonth } = useSession();
  const [open, setOpen] = useState(false);

  const { data: counts } = useQuery(async () => {
    if (user.role === 'GESTOR') return { gestor: (await api.listRequests(user, { status: 'AGUARDANDO_GESTOR' })).length };
    if (user.role === 'DIRETORIA') {
      const all = await api.listRequests(user, { status: ['AGUARDANDO_DIRETORIA', 'AGUARDANDO_GESTOR'] });
      return {
        dir: all.filter((r) => r.status === 'AGUARDANDO_DIRETORIA' && r.assignedDirectorId === user.id).length +
          all.filter((r) => r.status === 'AGUARDANDO_GESTOR' && !!user.sectorId && r.sectorId === user.sectorId).length,
      };
    }
    if (user.role === 'FINANCEIRO') return { fin: (await api.listRequests(user, { status: 'ENVIADA_FINANCEIRO' })).length };
    return {};
  }, [user.id]);
  const { data: sectors } = useQuery(() => api.sectorDirectory(user), [user.id]);
  const sectorName = sectors?.find((s) => s.id === user.sectorId)?.name;

  const nav: Record<Role, NavItem[]> = {
    FUNCIONARIO: [
      { path: '/', label: 'Painel do setor' },
      { path: '/sc', label: 'Minhas solicitações' },
      { path: '/sc/nova', label: 'Nova SC' },
    ],
    GESTOR: [
      { path: '/', label: 'Painel do setor' },
      { path: '/sc', label: 'Solicitações do setor', badge: counts?.gestor },
      { path: '/sc/nova', label: 'Nova SC' },
      { path: '/transferencias', label: 'Transferência de limite' },
      { path: '/usuarios', label: 'Usuários do setor' },
      { path: '/perfil', label: 'Meu perfil e assinatura' },
    ],
    DIRETORIA: [
      { path: '/', label: 'Visão geral' },
      { path: '/aprovacoes', label: 'Aprovações', badge: counts?.dir },
      { path: '/sc', label: 'Solicitações' },
      ...(user.sectorId ? [{ path: '/sc/nova', label: 'Nova SC' }] : []),
      { path: '/transferencias', label: 'Transferência de limite' },
      { path: '/perfil', label: 'Meu perfil e assinatura' },
    ],
    FINANCEIRO: [{ path: '/', label: 'Contas a Pagar', badge: counts?.fin }],
    ADMIN: [
      { path: '/', label: 'Setores e limites' },
      { path: '/usuarios', label: 'Usuários' },
      { path: '/cadastros', label: 'Centros de custo e naturezas' },
      { path: '/fornecedores', label: 'Fornecedores' },
    ],
  };
  const items = nav[user.role];
  const activePath = items.map((i) => i.path).filter((p) => (p === '/' ? path === '/' : path === p || path.startsWith(p + '/'))).sort((a, b) => b.length - a.length)[0];

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="px-4 pb-4 pt-5">
        <img src={logo} alt="AM Comercial" className="h-16 w-16" />
        <div className="mt-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/80">Gestão de Despesas</div>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {items.map((it) => (
          <li key={it.path}>
            <a
              href={`#${it.path}`}
              onClick={() => setOpen(false)}
              className={cx(
                'flex items-center justify-between rounded px-3 py-2 text-sm',
                activePath === it.path ? 'bg-white text-brand font-semibold' : 'text-sidebar-foreground hover:bg-white/10 hover:text-white',
              )}
            >
              {it.label}
              {!!it.badge && <span className={cx('tabular rounded-sm px-1.5 text-xs font-semibold', activePath === it.path ? 'bg-brand text-white' : 'bg-white text-brand')}>{it.badge}</span>}
            </a>
          </li>
        ))}
      </ul>
      <div className="border-t border-white/15 px-4 py-3 text-sm">
        <div className="truncate font-medium text-white">{user.name}</div>
        <div className="truncate text-xs text-sidebar-foreground">
          {user.role === 'DIRETORIA' ? user.cargo : ROLE_LABEL[user.role]}
          {sectorName && user.role !== 'DIRETORIA' ? ` · ${sectorName}` : ''}
        </div>
        <button onClick={logout} className="mt-2 text-xs text-sidebar-foreground underline hover:text-white">Sair</button>
      </div>
    </nav>
  );

  const showMonth = user.role !== 'FINANCEIRO';

  return (
    <div className="min-h-screen lg:pl-56">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-56 bg-sidebar lg:block">{sidebar}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-white px-4 sm:px-6">
        <button className="rounded p-2 hover:bg-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Icon name="menu" />
        </button>
        <div className="ml-auto flex items-center gap-2">
          {showMonth && (
            <div className="flex items-center rounded border" aria-label="Competência">
              <button className="px-2 py-1.5 hover:bg-muted" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
                <Icon name="chevronLeft" size={15} />
              </button>
              <span className="min-w-[128px] text-center text-sm font-medium">{monthLabel(month)}</span>
              <button className="px-2 py-1.5 hover:bg-muted" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
                <Icon name="chevronRight" size={15} />
              </button>
            </div>
          )}
          <Notifications />
        </div>
      </header>
      <main className="print-full mx-auto max-w-6xl px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}

function Notifications() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: items = [] } = useQuery(() => api.listNotifications(user), [user.id]);
  const unread = items.filter((n) => !n.read);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative rounded border p-2 hover:bg-muted" aria-label={`Notificações (${unread.length} não lidas)`}>
        <Icon name="bell" size={16} />
        {unread.length > 0 && <span className="tabular absolute -right-1.5 -top-1.5 min-w-[18px] rounded-sm bg-brand px-1 text-center text-[11px] font-semibold text-white">{unread.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-[min(360px,calc(100vw-2rem))] rounded border bg-white shadow-md">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notificações</span>
            {unread.length > 0 && (
              <button className="text-xs text-primary underline" onClick={() => api.markNotificationsRead(user, unread.map((n) => n.id))}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  className={cx('block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted', !n.read && 'bg-[#f3f4fb]')}
                  onClick={() => {
                    api.markNotificationsRead(user, [n.id]);
                    setOpen(false);
                    if (n.scId) navigate(`/sc/ver?id=${n.scId}`);
                  }}
                >
                  <div className={cx(!n.read && 'font-medium')}>{n.text}</div>
                  <div className="text-xs text-muted-foreground">{dateTime(n.at)}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
