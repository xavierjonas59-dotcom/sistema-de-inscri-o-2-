import { useState } from 'react';
import { useQuery, useSession, useUser } from '@/app/session';
import { money, monthLabel } from '@/domain/format';
import { SC_STATUS, scSummary, scTotal } from '@/domain/sc';
import type { ScStatus } from '@/domain/types';
import { api } from '@/services/api';
import { Button, Card, PageHeader, Select, Tabs } from '@/components/ui/primitives';
import { navigate } from '@/app/session';
import { useLookups } from '../shared/lookups';
import { ScTable } from './ScTable';

type Scope = 'acao' | 'setor' | 'diretoria' | 'mes' | 'todas';

/** Lista de SCs. O que cada perfil enxerga é decidido no serviço. */
export default function ScList({ approvals = false }: { approvals?: boolean }) {
  const user = useUser();
  const { month } = useSession();
  const lk = useLookups();
  const isDir = user.role === 'DIRETORIA';
  const hasAction = user.role === 'GESTOR' || isDir;
  const [scope, setScope] = useState<Scope>(approvals || hasAction ? 'acao' : 'mes');
  const [status, setStatus] = useState<ScStatus | ''>('');
  const [sectorId, setSectorId] = useState('');

  const { data: all = [] } = useQuery(() => api.listRequests(user), [user.id]);
  // Gestor: SCs do setor aguardando aprovação. Diretor: SCs que aguardam a SUA liberação.
  const actionItems = user.role === 'GESTOR'
    ? all.filter((r) => r.status === 'AGUARDANDO_GESTOR')
    : isDir ? all.filter((r) => r.status === 'AGUARDANDO_DIRETORIA' && r.assignedDirectorId === user.id) : [];
  const sectorItems = isDir && user.sectorId ? all.filter((r) => r.status === 'AGUARDANDO_GESTOR' && r.sectorId === user.sectorId) : [];
  const directorItems = isDir ? all.filter((r) => r.status === 'AGUARDANDO_DIRETORIA') : [];
  const base = { acao: actionItems, setor: sectorItems, diretoria: directorItems, mes: all.filter((r) => r.month === month), todas: all }[scope];
  const items = base
    .filter((r) => (!status || r.status === status) && (!sectorId || r.sectorId === sectorId))
    .sort((a, b) => (['acao', 'setor', 'diretoria'].includes(scope) ? a.createdAt.localeCompare(b.createdAt) : 0));
  const total = items.reduce((s, r) => s + scTotal(r), 0);

  const title = approvals ? 'Aprovações' : user.role === 'FUNCIONARIO' ? 'Minhas solicitações' : user.role === 'GESTOR' ? 'Solicitações do setor' : 'Solicitações de Compras';
  const tabs: { value: Scope; label: string; count?: number }[] = [
    ...(hasAction ? [{ value: 'acao' as Scope, label: isDir ? 'Aguardando minha liberação' : 'Aguardando minha aprovação', count: actionItems.length }] : []),
    ...(isDir && user.sectorId ? [{ value: 'setor' as Scope, label: `Aprovação do setor ${lk.sector(user.sectorId)}`, count: sectorItems.length }] : []),
    ...(isDir ? [{ value: 'diretoria' as Scope, label: 'Todas na diretoria', count: directorItems.length }] : []),
    { value: 'mes', label: monthLabel(month) },
    { value: 'todas', label: 'Todas' },
  ];

  return (
    <>
      <PageHeader
        title={title}
        description={scSummary(items)}
        actions={user.role === 'FUNCIONARIO' || user.role === 'GESTOR' || (isDir && user.sectorId) ? <Button icon="plus" onClick={() => navigate('/sc/nova')}>Nova SC</Button> : undefined}
      />
      <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
        <Tabs<Scope> value={scope} onChange={setScope} items={tabs} />
        <div className="flex gap-2">
          {isDir && (
            <Select className="h-8 w-auto text-xs" value={sectorId} onChange={(e) => setSectorId(e.target.value)} aria-label="Filtrar setor">
              <option value="">Todos os setores</option>
              {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          {(scope === 'mes' || scope === 'todas') && (
            <Select className="h-8 w-auto text-xs" value={status} onChange={(e) => setStatus(e.target.value as ScStatus | '')} aria-label="Filtrar status">
              <option value="">Todos os status</option>
              {Object.entries(SC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          )}
        </div>
      </div>
      <Card>
        <ScTable items={items} showSector={isDir} showDirector={isDir && scope === 'diretoria'} empty={scope === 'acao' ? 'Nenhuma SC aguardando a sua decisão.' : 'Nenhuma solicitação encontrada.'} />
      </Card>
    </>
  );
}
