import { useMemo, type ComponentType } from 'react';
import { SessionProvider, useHashPath, useSession } from '@/app/session';
import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/overlay';
import { EmptyState } from '@/components/ui/primitives';
import type { Role } from '@/domain/types';
import CategoriesAdmin from '@/pages/admin/Categories';
import SectorsAdmin from '@/pages/admin/Sectors';
import UsersAdmin from '@/pages/admin/Users';
import Approvals from '@/pages/diretoria/Approvals';
import DiretoriaDashboard from '@/pages/diretoria/Dashboard';
import Reports from '@/pages/diretoria/Reports';
import GestorDashboard from '@/pages/gestor/Dashboard';
import Login from '@/pages/Login';
import ExpensesPage from '@/pages/shared/ExpensesPage';
import TransfersPage from '@/pages/shared/TransfersPage';

type Page = ComponentType<{ query: URLSearchParams }>;

/** Tabela de rotas por perfil: uma rota fora do perfil simplesmente não existe para ele. */
const routes: Record<Role, Record<string, Page>> = {
  GESTOR: {
    '/': GestorDashboard,
    '/despesas': ExpensesPage,
    '/transferencias': TransfersPage,
  },
  DIRETORIA: {
    '/': DiretoriaDashboard,
    '/aprovacoes': Approvals,
    '/despesas': ExpensesPage,
    '/transferencias': TransfersPage,
    '/relatorios': Reports,
    '/admin/setores': SectorsAdmin,
    '/admin/naturezas': CategoriesAdmin,
    '/admin/usuarios': UsersAdmin,
  },
};

function Router() {
  const { user, loading } = useSession();
  const full = useHashPath();
  const [path, search] = full.split('?');
  const query = useMemo(() => new URLSearchParams(search), [search]);

  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando…</div>;
  if (!user) return <Login />;

  const Page = routes[user.role][path];
  return (
    <AppShell path={path}>
      {Page ? (
        <Page key={user.id} query={query} />
      ) : (
        <EmptyState icon="alert" title="Página não encontrada ou sem permissão">
          <a href="#/" className="text-primary underline">Voltar ao início</a>
        </EmptyState>
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <Router />
      </SessionProvider>
    </ToastProvider>
  );
}
