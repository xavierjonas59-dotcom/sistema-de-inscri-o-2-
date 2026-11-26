import { useEffect, useState } from 'react';
import { readFile, saveBlob, saveDataUrl } from '@/app/files';
import { navigate, useQuery, useUser } from '@/app/session';
import { date, dateTime, money } from '@/domain/format';
import { CANCELLABLE, FLOW, contentHash, itemTotal, paymentLabel, scTotal } from '@/domain/sc';
import type { AppliedSignature, AttachmentKind, PurchaseRequest } from '@/domain/types';
import { buildPackagePdf, buildScPdf } from '@/pdf/scPdf';
import { api, requestContext } from '@/services/api';
import { ALLOWED_ATTACHMENT_TYPES, ATTACHMENT_LABEL } from '@/services/LocalDataService';
import { Icon } from '@/components/ui/icons';
import { Modal, useToast } from '@/components/ui/overlay';
import { Button, Card, CardHeader, EmptyState, Field, Input, Select, Table, Td, Textarea, Th, cx } from '@/components/ui/primitives';
import { errMsg, useLookups } from '../shared/lookups';
import { ScStatusTag } from './ScTable';
import { SignModal, limitLabel } from './SignModal';

export default function ScDetail({ query }: { query: URLSearchParams }) {
  const user = useUser();
  const id = query.get('id') ?? '';
  const { data: sc, error } = useQuery(() => api.getRequest(user, id), [id]);
  if (error) return <EmptyState title={error}><a className="text-primary underline" href="#/sc">Voltar para a lista</a></EmptyState>;
  if (!sc) return null;
  return <Detail sc={sc} />;
}

function Detail({ sc }: { sc: PurchaseRequest }) {
  const user = useUser();
  const toast = useToast();
  const lk = useLookups();
  const [modal, setModal] = useState<null | 'return' | 'reject' | 'signCompra' | 'signPagamento' | 'paid' | 'forward'>(null);
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    contentHash(sc).then(setHash);
  }, [sc]);

  const isRequester = sc.requesterId === user.id;
  /** Aprovador do setor: gestor do setor ou diretor responsável pelo setor. */
  const isManager = (user.role === 'GESTOR' || user.role === 'DIRETORIA') && !!user.sectorId && user.sectorId === sc.sectorId;
  const isAssignedDirector = user.role === 'DIRETORIA' && sc.assignedDirectorId === user.id;
  const myLimit = user.role === 'DIRETORIA' ? user.paymentLimit : null;
  const s = sc.status;
  const total = scTotal(sc);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast('success', ok);
    } catch (e) {
      toast('error', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const printSc = () =>
    run(async () => {
      const doc = await buildScPdf(sc, lk.pdfNames(sc));
      await saveBlob(doc.output('blob'), `${sc.number}.pdf`);
    }, 'PDF da Solicitação gerado.');
  const printPackage = () =>
    run(async () => {
      const bytes = await buildPackagePdf(sc, lk.pdfNames(sc));
      await saveBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${sc.number}-pacote.pdf`);
    }, 'Pacote gerado: Solicitação + NF + boletos + comprovantes.');

  const actions: React.ReactNode[] = [];
  if (isRequester && (s === 'RASCUNHO' || s === 'DEVOLVIDA'))
    actions.push(<Button key="edit" onClick={() => navigate(`/sc/editar?id=${sc.id}`)}>{s === 'DEVOLVIDA' ? 'Ajustar e reenviar' : 'Editar e enviar'}</Button>);
  if (isManager && s === 'AGUARDANDO_GESTOR') {
    actions.push(
      <Button key="ret" variant="secondary" onClick={() => setModal('return')}>Devolver</Button>,
      <Button key="rej" variant="danger" onClick={() => setModal('reject')}>Reprovar</Button>,
      <Button key="edit" variant="secondary" icon="pencil" onClick={() => navigate(`/sc/editar?id=${sc.id}`)}>Editar</Button>,
      <Button key="ok" onClick={() => setModal('signCompra')}>Aprovar, assinar e escolher diretor</Button>,
    );
  }
  if (isManager && s === 'AGUARDANDO_DIRETORIA')
    actions.push(<Button key="edit" variant="secondary" icon="pencil" onClick={() => navigate(`/sc/editar?id=${sc.id}`)}>Editar</Button>);
  const overLimit = myLimit !== null && total > myLimit;
  if (isAssignedDirector && s === 'AGUARDANDO_DIRETORIA')
    actions.push(
      <Button key="rej" variant="danger" onClick={() => setModal('reject')}>Reprovar</Button>,
      <Button key="fw" variant="secondary" onClick={() => setModal('forward')}>Encaminhar para outro diretor</Button>,
      <Button key="ok" disabled={overLimit} title={overLimit ? `Acima do seu limite de ${money(myLimit!)}` : ''} onClick={() => setModal('signPagamento')}>
        Liberar pagamento e assinar
      </Button>,
    );
  if (user.role === 'FINANCEIRO' && s === 'ENVIADA_FINANCEIRO') actions.push(<Button key="paid" onClick={() => setModal('paid')}>Marcar como paga</Button>);
  if ((isRequester || isManager) && CANCELLABLE.includes(s))
    actions.unshift(
      <Button key="cancel" variant="ghost" disabled={busy} onClick={() => run(() => api.cancel(user, sc.id), `${sc.number} cancelada.`)}>Cancelar SC</Button>,
    );

  const flowIndex = FLOW.findIndex((f) => f.status.includes(s));
  const ended = s === 'REPROVADA' || s === 'CANCELADA';

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-[22px] font-semibold leading-tight">
            {sc.number} <ScStatusTag sc={sc} />
          </h1>
          <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:flex">
            <div><dt className="text-xs text-muted-foreground">Setor</dt><dd>{lk.sector(sc.sectorId)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Solicitante</dt><dd>{sc.requesterName}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Data</dt><dd className="tabular">{date(sc.date + 'T12:00')}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Total</dt><dd className="tabular font-semibold">{money(total)}</dd></div>
          </dl>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="secondary" icon="printer" onClick={printSc} disabled={busy}>Imprimir / Baixar PDF</Button>
          {user.role === 'FINANCEIRO' && <Button variant="secondary" icon="download" onClick={printPackage} disabled={busy}>Imprimir pacote</Button>}
        </div>
      </div>

      {!ended && (
        <ol className="mb-4 flex flex-wrap gap-x-1 gap-y-2 text-xs">
          {FLOW.map((f, i) => (
            <li key={f.label} className="flex items-center gap-1">
              <span className={cx('rounded-full px-2.5 py-1', i < flowIndex ? 'bg-info-soft text-brand' : i === flowIndex ? 'bg-brand font-semibold text-white' : 'bg-muted text-muted-foreground')}>{f.label}</span>
              {i < FLOW.length - 1 && <span className="text-muted-foreground">›</span>}
            </li>
          ))}
        </ol>
      )}

      {sc.returnReason && s === 'DEVOLVIDA' && <Notice tone="critical">Devolvida para ajuste: {sc.returnReason}</Notice>}
      {sc.rejectReason && s === 'REPROVADA' && <Notice tone="critical">Reprovada: {sc.rejectReason}</Notice>}
      {s === 'AGUARDANDO_NF' && (isRequester || isManager) && <Notice tone="info">Aprovada pela Diretoria. Anexe a nota fiscal (obrigatória), boletos e comprovantes e envie para pagamento.</Notice>}
      {s === 'AGUARDANDO_DIRETORIA' && (
        <Notice tone="info">
          Aguardando liberação de pagamento de <strong>{sc.assignedDirectorName}</strong>.
          {isAssignedDirector && overLimit && ` O valor passa do seu limite (${money(myLimit!)}): encaminhe para outro diretor.`}
        </Notice>
      )}
      {sc.paidAt && <Notice tone="good">Paga em {sc.paidAt.split('-').reverse().join('/')}.</Notice>}

      {actions.length > 0 && <div className="no-print mb-4 flex flex-wrap justify-end gap-2 rounded border bg-card p-3">{actions}</div>}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <ScView sc={sc} />
          <Signatures sc={sc} hash={hash} />
          {sc.changes.length > 0 && <Changes sc={sc} />}
          <Attachments sc={sc} canEdit={isRequester || isManager} />
        </div>
        <Card className="h-fit">
          <CardHeader title="Linha do tempo" />
          <ol className="space-y-3 p-4">
            {[...sc.timeline].reverse().map((t, i) => (
              <li key={i} className="border-l-2 border-info-line pl-3">
                <div className="text-sm font-medium">{t.action}</div>
                <div className="text-xs text-muted-foreground">{t.userName}, {dateTime(t.at)}</div>
                {t.note && <div className="mt-0.5 text-xs text-muted-foreground">{t.note}</div>}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <ReasonModal
        open={modal === 'return' || modal === 'reject'}
        title={modal === 'return' ? `Devolver ${sc.number} para ajuste` : `Reprovar ${sc.number}`}
        hint={modal === 'return' ? 'A SC volta para o solicitante corrigir.' : 'A SC é encerrada e o valor não ocupa o saldo do setor.'}
        confirm={modal === 'return' ? 'Devolver' : 'Reprovar'}
        onClose={() => setModal(null)}
        onConfirm={async (reason) => {
          if (modal === 'return') await api.returnForAdjustment(user, sc.id, reason);
          else await api.reject(user, sc.id, reason);
          toast('success', modal === 'return' ? 'SC devolvida ao solicitante.' : 'SC reprovada.');
        }}
      />
      <SignModal
        open={modal === 'signCompra' || modal === 'signPagamento'}
        onClose={() => setModal(null)}
        slotLabel={modal === 'signPagamento' ? 'Autorização de Pagamento' : 'Autorização de Compra'}
        number={sc.number}
        total={total}
        chooseDirector={modal === 'signCompra'}
        onConfirm={async (password, directorId) => {
          if (modal === 'signPagamento') await api.directorApprove(user, sc.id, password, requestContext());
          else await api.managerApprove(user, sc.id, password, requestContext(), directorId);
          toast('success', modal === 'signPagamento' ? 'Pagamento liberado. O valor passou de reservado para consumido.' : 'Aprovada e enviada ao diretor escolhido. O valor foi reservado no saldo do setor.');
        }}
      />
      <ForwardModal open={modal === 'forward'} sc={sc} onClose={() => setModal(null)} />
      <PaidModal open={modal === 'paid'} sc={sc} onClose={() => setModal(null)} />
    </>
  );
}

function Notice({ tone, children }: { tone: 'critical' | 'info' | 'good'; children: React.ReactNode }) {
  const cls = { critical: 'border-danger-line bg-danger-soft text-danger', info: 'border-info-line bg-info-soft text-brand', good: 'border-ok-line bg-ok-soft text-ok' }[tone];
  return <div className={cx('mb-3 rounded border px-4 py-2.5 text-sm', cls)}>{children}</div>;
}

const Band = ({ children, tall }: { children: React.ReactNode; tall?: boolean }) => (
  <div className={cx('flex items-center bg-sheet px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white', tall && 'min-h-[38px] leading-tight')}>{children}</div>
);

/** Visualização da SC na mesma ordem de blocos do modelo impresso. */
function ScView({ sc }: { sc: PurchaseRequest }) {
  const lk = useLookups();
  return (
    <Card className="overflow-hidden text-sm">
      <div className="grid gap-x-6 gap-y-1 p-3 sm:grid-cols-[1fr_auto_auto]">
        <div><span className="text-xs font-semibold text-muted-foreground">FORNECEDOR: </span>{sc.supplierName || '—'}</div>
        <div><span className="text-xs font-semibold text-muted-foreground">CÓDIGO: </span>{sc.supplierCode || '—'}</div>
        <div><span className="text-xs font-semibold text-muted-foreground">DATA: </span>{date(sc.date + 'T12:00')}</div>
        <div className="sm:col-span-3"><span className="text-xs font-semibold text-muted-foreground">CONTATO: </span>{sc.contact || '—'}</div>
      </div>
      <div className="grid border-t sm:grid-cols-3 sm:divide-x">
        <div>
          <Band>Forma de pagamento</Band>
          <div className="p-3">{paymentLabel(sc.paymentMethod)}</div>
        </div>
        <div>
          <Band>Rateio C. C.</Band>
          <div className="space-y-0.5 p-3">
            {sc.apportionment.length ? sc.apportionment.map((a) => (
              <div key={a.costCenterId} className="flex justify-between gap-2"><span>{lk.costCenter(a.costCenterId)}</span><span className="tabular">{a.percent.toLocaleString('pt-BR')}%</span></div>
            )) : '—'}
          </div>
        </div>
        <div>
          <Band>Parcelas ({sc.installments.length || 'à vista'})</Band>
          <div className="grid grid-cols-2 gap-0.5 p-3 tabular">
            {sc.installments.map((p, i) => <span key={i}>{i + 1}ª {p.dueDate ? p.dueDate.split('-').reverse().join('/') : '—'}</span>)}
            {!sc.installments.length && <span>—</span>}
          </div>
        </div>
      </div>
      <Band>Dados da nota fiscal</Band>
      <div className="p-3">{sc.invoiceInfo || '—'}</div>
      <Band>Natureza da compra</Band>
      <div className="p-3">{lk.nature(sc.natureId)}</div>
      <Table min={620}>
        <thead>
          <tr className="[&>th]:bg-sheet [&>th]:text-white">
            <Th>Descrição</Th><Th right>Quantidade</Th><Th right>Valor und</Th><Th right>Descontos</Th><Th right>Acréscimos</Th><Th right>Valor total</Th>
          </tr>
        </thead>
        <tbody>
          {sc.items.map((it, i) => (
            <tr key={i}>
              <Td>{it.description}</Td>
              <Td right>{it.quantity.toLocaleString('pt-BR')}</Td>
              <Td right>{money(it.unitPrice)}</Td>
              <Td right>{it.discount ? money(it.discount) : '-'}</Td>
              <Td right>{it.surcharge ? money(it.surcharge) : '-'}</Td>
              <Td right className="font-medium">{money(itemTotal(it))}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Band>Dados bancários</Band>
      <div className="grid gap-x-6 gap-y-1 p-3 sm:grid-cols-4">
        <span><span className="text-xs font-semibold text-muted-foreground">Banco: </span>{sc.bankData.bank || '—'}</span>
        <span><span className="text-xs font-semibold text-muted-foreground">Agência/DV: </span>{sc.bankData.agency || '—'}</span>
        <span><span className="text-xs font-semibold text-muted-foreground">Conta/DV: </span>{sc.bankData.account || '—'}</span>
        <span className="break-all"><span className="text-xs font-semibold text-muted-foreground">PIX: </span>{sc.bankData.pix || '—'}</span>
      </div>
      <div className="flex justify-between bg-sheet px-3 py-2 font-semibold text-white">
        <span className="text-xs uppercase tracking-wide">Total geral</span>
        <span className="tabular">{money(scTotal(sc))}</span>
      </div>
      {sc.notes && <div className="border-t p-3 text-muted-foreground"><span className="text-xs font-semibold">Observações: </span>{sc.notes}</div>}
    </Card>
  );
}

function Signatures({ sc, hash }: { sc: PurchaseRequest; hash: string }) {
  const box = (title: string, s?: AppliedSignature, pending?: string) => {
    const valid = s && !s.invalidatedAt && (!hash || s.contentHash === hash);
    return (
      <div className="flex flex-col border-t sm:border-l sm:border-t-0 first:border-0">
        <Band tall>{title}</Band>
        <div className="flex flex-1 flex-col items-center justify-end px-2 pb-2 pt-3 text-center text-xs">
          {s && valid && <img src={s.imageDataUrl} alt={`Assinatura de ${s.name}`} className="h-12 max-w-full object-contain dark:rounded dark:bg-white dark:px-1.5 dark:py-0.5" />}
          <div className="mt-1 w-4/5 border-t border-foreground/50" />
          {s ? (
            <>
              <div className="mt-1 font-semibold">{s.name}</div>
              <div className="text-muted-foreground">{s.cargo}</div>
              {valid ? (
                <div className="text-muted-foreground">Assinado eletronicamente em {dateTime(s.signedAt)}<br />Cód. {s.code}</div>
              ) : (
                <div className="font-semibold text-danger">Assinatura invalidada: conteúdo alterado</div>
              )}
            </>
          ) : (
            <div className="mt-1 text-muted-foreground">{pending ?? ' '}</div>
          )}
        </div>
      </div>
    );
  };
  return (
    <Card className="overflow-hidden">
      <div className="grid sm:grid-cols-4">
        <div className="flex flex-col">
          <Band tall>Solicitante</Band>
          <div className="flex flex-1 flex-col items-center justify-end px-2 pb-2 pt-3 text-center text-xs">
            <div className="w-4/5 border-t border-foreground/50" />
            <div className="mt-1 font-semibold">{sc.requesterName}</div>
            {sc.submittedAt ? <div className="text-muted-foreground">Enviado eletronicamente em {dateTime(sc.submittedAt)}</div> : <div className="text-muted-foreground">Ainda não enviada</div>}
          </div>
        </div>
        <div className="flex flex-col border-t sm:border-l sm:border-t-0">
          <Band tall>Conferente</Band>
          <div className="flex flex-1 flex-col items-center justify-end px-2 pb-2 pt-10 text-center text-xs">
            <div className="w-4/5 border-t border-foreground/50" />
            <div className="mt-1 text-muted-foreground">Assinatura manual no impresso</div>
          </div>
        </div>
        {box('Autorização de Compra', sc.signatures.COMPRA, 'Gestor do setor')}
        {box('Autorização de Pagamento', sc.signatures.PAGAMENTO, sc.assignedDirectorName ? `Aguardando ${sc.assignedDirectorName}` : 'Diretoria')}
      </div>
    </Card>
  );
}

function Changes({ sc }: { sc: PurchaseRequest }) {
  return (
    <Card>
      <CardHeader title="Alterações feitas após o envio" subtitle="Campo, valor anterior e novo valor" />
      <Table min={620}>
        <thead><tr><Th>Campo</Th><Th>Antes</Th><Th>Depois</Th><Th>Por</Th><Th>Quando</Th></tr></thead>
        <tbody>
          {[...sc.changes].sort((a, b) => b.at.localeCompare(a.at)).map((c, i) => (
            <tr key={i}>
              <Td className="font-medium">{c.field}</Td>
              <Td className="text-muted-foreground line-through decoration-danger/50">{c.before}</Td>
              <Td>{c.after}</Td>
              <Td>{c.userName}</Td>
              <Td className="whitespace-nowrap text-muted-foreground">{dateTime(c.at)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function Attachments({ sc, canEdit }: { sc: PurchaseRequest; canEdit: boolean }) {
  const user = useUser();
  const toast = useToast();
  const docsPhase = sc.status === 'AGUARDANDO_NF';
  const quotePhase = ['RASCUNHO', 'DEVOLVIDA', 'AGUARDANDO_GESTOR'].includes(sc.status);
  const kinds: AttachmentKind[] = docsPhase ? ['NF', 'BOLETO', 'COMPROVANTE', 'PDF_ASSINADO'] : quotePhase ? ['ORCAMENTO'] : [];
  const [kind, setKind] = useState<AttachmentKind>(kinds[0] ?? 'NF');
  useEffect(() => setKind(kinds[0] ?? 'NF'), [sc.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasNf = sc.attachments.some((a) => a.kind === 'NF');
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      await api.addAttachment(user, sc.id, kind, await readFile(file));
      toast('success', `${ATTACHMENT_LABEL[kind][0].toUpperCase()}${ATTACHMENT_LABEL[kind].slice(1)} anexado(a).`);
    } catch (e) {
      toast('error', errMsg(e));
    }
  };

  return (
    <Card>
      <CardHeader
        title="Anexos"
        subtitle={docsPhase ? 'Nota fiscal, boletos e comprovantes (PDF, JPG ou PNG, até 5 MB)' : undefined}
        action={
          canEdit && docsPhase ? (
            <Button disabled={!hasNf} title={hasNf ? '' : 'Anexe a nota fiscal primeiro'} onClick={() => api.sendToFinance(user, sc.id).then(() => toast('success', 'Enviada ao financeiro.'), (e) => toast('error', errMsg(e)))}>
              Enviar para pagamento
            </Button>
          ) : undefined
        }
      />
      {sc.attachments.length ? (
        <ul className="divide-y">
          {sc.attachments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <span className="w-44 shrink-0 text-sm text-muted-foreground first-letter:uppercase">{ATTACHMENT_LABEL[a.kind]}</span>
              <button className="min-w-0 flex-1 truncate text-left text-primary hover:underline" onClick={() => saveDataUrl(a.url, a.name)}>{a.name}</button>
              <span className="text-xs text-muted-foreground">Enviado por {a.uploadedByName} em {dateTime(a.uploadedAt)}</span>
              {canEdit && (a.kind === 'ORCAMENTO' ? quotePhase : docsPhase) && (
                <button className="text-muted-foreground hover:text-danger" aria-label={`Remover ${a.name}`} onClick={() => api.removeAttachment(user, sc.id, a.id).catch((e) => toast('error', errMsg(e)))}>
                  <Icon name="trash" size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground">Nenhum anexo.</p>
      )}
      {canEdit && kinds.length > 0 && (
        <div className="no-print flex flex-wrap items-end gap-2 border-t bg-muted/40 px-4 py-3">
          <Field label="Tipo" className="w-52">
            <Select value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)}>
              {kinds.map((k) => <option key={k} value={k}>{ATTACHMENT_LABEL[k][0].toUpperCase() + ATTACHMENT_LABEL[k].slice(1)}</option>)}
            </Select>
          </Field>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-input bg-card px-3 text-sm font-medium hover:bg-muted">
            <Icon name="upload" size={15} /> Escolher arquivo
            <input type="file" className="sr-only" accept={ALLOWED_ATTACHMENT_TYPES.join(',')} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {docsPhase && !hasNf && <span className="text-xs text-warn">A nota fiscal é obrigatória para enviar ao financeiro.</span>}
          {kind === 'PDF_ASSINADO' && <span className="text-xs text-muted-foreground">Preparado para a fase 2: PDF baixado, assinado no gov.br e anexado de volta.</span>}
        </div>
      )}
    </Card>
  );
}

function ReasonModal({ open, title, hint, confirm, onClose, onConfirm }: { open: boolean; title: string; hint: string; confirm: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setReason(''), [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={hint}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            variant="danger"
            disabled={busy || !reason.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason);
                onClose();
              } catch (e) {
                toast('error', errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <Field label="Motivo (obrigatório)">
        <Textarea id="reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}

function PaidModal({ open, sc, onClose }: { open: boolean; sc: PurchaseRequest; onClose: () => void }) {
  const user = useUser();
  const toast = useToast();
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Marcar ${sc.number} como paga`}
      description={money(scTotal(sc))}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={busy || !file || !paidAt}
            onClick={async () => {
              setBusy(true);
              try {
                await api.markPaid(user, sc.id, paidAt, await readFile(file!));
                toast('success', `${sc.number} marcada como paga.`);
                onClose();
              } catch (e) {
                toast('error', errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar pagamento
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Data do pagamento"><Input id="paid-at" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
        <Field label="Comprovante de pagamento (PDF, JPG ou PNG)">
          <input type="file" accept={ALLOWED_ATTACHMENT_TYPES.join(',')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
        </Field>
      </div>
    </Modal>
  );
}

function ForwardModal({ open, sc, onClose }: { open: boolean; sc: PurchaseRequest; onClose: () => void }) {
  const user = useUser();
  const toast = useToast();
  const total = scTotal(sc);
  const [directorId, setDirectorId] = useState('');
  const [note, setNote] = useState('');
  const { data: directors = [] } = useQuery(() => api.listDirectors(user), [open]);
  const options = directors.filter((d) => d.id !== user.id && (d.paymentLimit === null || total <= d.paymentLimit));
  useEffect(() => {
    setDirectorId('');
    setNote('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Encaminhar ${sc.number}`}
      description={`Outro diretor libera o pagamento de ${money(total)}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!directorId}
            onClick={async () => {
              try {
                await api.forwardToDirector(user, sc.id, directorId, note);
                toast('success', 'Encaminhada.');
                onClose();
              } catch (e) {
                toast('error', errMsg(e));
              }
            }}
          >
            Encaminhar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Diretor">
          <Select id="fw-director" value={directorId} onChange={(e) => setDirectorId(e.target.value)}>
            <option value="">Selecione…</option>
            {options.map((d) => <option key={d.id} value={d.id}>{d.name}, {d.cargo.toLowerCase()} ({limitLabel(d.paymentLimit)})</option>)}
          </Select>
        </Field>
        <Field label="Observação (opcional)"><Input id="fw-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
