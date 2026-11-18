import { useEffect, useState } from 'react';
import { useQuery, useSession, useUser } from '@/app/session';
import { monthLabel } from '@/domain/format';
import { TRANSFER_STATUS } from '@/domain/labels';
import type { Transfer, TransferStatus } from '@/domain/types';
import { api } from '@/services/api';
import { Button, Card, PageHeader, Select, Tabs } from '@/components/ui/primitives';
import { useLookups } from './lookups';
import { NewTransferModal, TransferDetailModal, TransferTable } from './transfers';

type Tab = 'recebidos' | 'enviados';

export default function TransfersPage({ query }: { query: URLSearchParams }) {
  const user = useUser();
  const { month } = useSession();
  const lk = useLookups();
  const isDir = user.role === 'DIRETORIA';
  const [tab, setTab] = useState<Tab>('recebidos');
  const [status, setStatus] = useState<TransferStatus | ''>('');
  const [sectorId, setSectorId] = useState('');
  const [creating, setCreating] = useState(query.get('novo') === '1');
  const [open, setOpen] = useState<Transfer | null>(null);
  useEffect(() => {
    if (query.get('novo') === '1') setCreating(true);
  }, [query]);

  const { data: all = [] } = useQuery(
    () => api.listTransfers(user, { status: status || undefined, sectorId: sectorId || undefined }),
    [status, sectorId],
  );
  const received = all.filter((t) => t.grantingSectorId === user.sectorId);
  const sent = all.filter((t) => t.requestingSectorId === user.sectorId);
  const awaitingMe = received.filter((t) => t.status === 'PENDENTE_CEDENTE').length;

  return (
    <>
      <PageHeader
        title="Transferências de limite"
        description={
          isDir
            ? 'Todos os pedidos de empréstimo de teto entre setores'
            : 'Peça limite emprestado a outro setor ou analise pedidos feitos ao seu setor'
        }
        actions={!isDir && <Button icon="plus" onClick={() => setCreating(true)}>Pedir limite emprestado</Button>}
      />
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        {!isDir && (
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              { value: 'recebidos', label: 'Pedidos ao meu setor', count: awaitingMe || undefined },
              { value: 'enviados', label: 'Meus pedidos' },
            ]}
          />
        )}
        {isDir && (
          <Select className="w-auto" value={sectorId} onChange={(e) => setSectorId(e.target.value)} aria-label="Filtrar setor">
            <option value="">Todos os setores</option>
            {lk.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as TransferStatus | '')} aria-label="Filtrar status">
          <option value="">Todos os status</option>
          {Object.entries(TRANSFER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      <Card>
        <TransferTable
          items={isDir ? all : tab === 'recebidos' ? received : sent}
          onOpen={setOpen}
          empty={!isDir && tab === 'recebidos' ? 'Nenhum pedido recebido pelo seu setor.' : 'Nenhuma transferência encontrada.'}
        />
      </Card>
      {!isDir && (
        <NewTransferModal
          open={creating}
          month={month}
          onClose={() => {
            setCreating(false);
            if (query.get('novo')) window.location.hash = '#/transferencias';
          }}
        />
      )}
      <TransferDetailModal transfer={open} onClose={() => setOpen(null)} />
      {!isDir && <p className="mt-3 text-xs text-muted-foreground">Novos pedidos valem para a competência selecionada no topo ({monthLabel(month)}).</p>}
    </>
  );
}
