import { useEffect, useRef, useState } from 'react';
import { useUser } from '@/app/session';
import { dateTime } from '@/domain/format';
import { ROLE_LABEL } from '@/domain/sc';
import { api } from '@/services/api';
import { useToast } from '@/components/ui/overlay';
import { Button, Card, CardHeader, PageHeader, Tabs, cx } from '@/components/ui/primitives';
import { errMsg } from './shared/lookups';

const INK = '#1c2878';

/** Recorta a área com traço e devolve PNG com fundo transparente. */
function trimToPng(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 20) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return null;
  const pad = 6;
  const w = maxX - minX + 1 + pad * 2;
  const h = maxY - minY + 1 + pad * 2;
  const out = document.createElement('canvas');
  const scale = Math.min(1, 600 / w);
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  out.getContext('2d')!.drawImage(canvas, minX - pad, minY - pad, w, h, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/**
 * Foto/scan da assinatura em papel → PNG transparente.
 * Pixels claros (papel) viram transparentes; o traço é mantido com a cor original.
 */
async function photoToSignature(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      i.src = url;
    });
    const scale = Math.min(1, 1400 / img.width);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    // Limiar a partir do brilho médio do papel.
    let sum = 0;
    for (let i = 0; i < d.data.length; i += 16) sum += (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
    const paper = sum / (d.data.length / 16);
    const threshold = paper - 45;
    for (let i = 0; i < d.data.length; i += 4) {
      const lum = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
      if (lum > threshold) d.data[i + 3] = 0;
      else d.data[i + 3] = Math.min(255, Math.round(((threshold - lum) / 40) * 255));
    }
    ctx.putImageData(d, 0, 0);
    const png = trimToPng(c);
    if (!png) throw new Error('Não encontramos o traço da assinatura na imagem. Use papel branco e boa iluminação.');
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function DrawPad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
  }, []);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    onChange(null);
  };
  return (
    <div>
      <canvas
        ref={ref}
        className="h-44 w-full touch-none rounded border border-dashed border-input bg-white"
        aria-label="Área para desenhar a assinatura"
        onPointerDown={(e) => {
          drawing.current = true;
          last.current = pos(e);
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const p = pos(e);
          const ctx = ref.current!.getContext('2d')!;
          ctx.beginPath();
          ctx.moveTo(last.current!.x, last.current!.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
        }}
        onPointerUp={() => {
          drawing.current = false;
          onChange(trimToPng(ref.current!));
        }}
      />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>Assine com o dedo ou o mouse.</span>
        <button className="text-primary underline" onClick={clear}>Limpar</button>
      </div>
    </div>
  );
}

function SignaturePreview({ src, name, cargo }: { src: string | null; name: string; cargo: string }) {
  return (
    <div className="rounded border bg-white">
      <div className="bg-brand px-3 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-white">Autorização de pagamento</div>
      <div className="flex flex-col items-center px-4 pb-3 pt-4 text-center text-xs">
        <div className="flex h-16 items-end">{src ? <img src={src} alt="Prévia da assinatura" className="max-h-16 max-w-[260px] object-contain" /> : <span className="text-muted-foreground">Sem assinatura</span>}</div>
        <div className="mt-1 w-64 border-t border-foreground/60" />
        <div className="mt-1 font-semibold">{name}</div>
        <div className="text-muted-foreground">{cargo}</div>
        <div className="text-muted-foreground">Assinado eletronicamente em dd/mm/aaaa às hh:mm</div>
        <div className="text-muted-foreground">Cód. verificação: XXXX-XXXX</div>
      </div>
    </div>
  );
}

export default function Profile() {
  const user = useUser();
  const toast = useToast();
  const [mode, setMode] = useState<'foto' | 'desenhar'>('foto');
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSign = user.role === 'GESTOR' || user.role === 'DIRETORIA';
  const slot = user.role === 'DIRETORIA' ? 'Autorização de Pagamento' : 'Autorização de Compra';

  const save = async (value: string | null) => {
    setBusy(true);
    try {
      await api.setMySignature(user, value);
      setDraft(null);
      toast('success', value ? 'Assinatura salva.' : 'Assinatura removida.');
    } catch (e) {
      toast('error', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Meu perfil" description={`${user.name} · ${ROLE_LABEL[user.role]} · ${user.cargo || 'sem cargo'} · ${user.email}`} />
      {!canSign ? (
        <p className="text-sm text-muted-foreground">O seu perfil não assina solicitações.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Cadastrar assinatura" subtitle={`Usada somente na ${slot}, depois de você confirmar a senha.`} />
            <div className="space-y-4 p-4">
              <Tabs value={mode} onChange={(m) => { setMode(m); setDraft(null); }} items={[{ value: 'foto', label: 'Enviar foto' }, { value: 'desenhar', label: 'Desenhar na tela' }]} />
              {mode === 'foto' ? (
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">Assine com caneta azul ou preta numa folha branca, tire uma foto bem iluminada e envie. O fundo do papel é removido automaticamente. PNG com fundo transparente também é aceito.</p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="block w-full text-sm"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        setDraft(await photoToSignature(f));
                      } catch (err) {
                        toast('error', errMsg(err));
                      }
                    }}
                  />
                </div>
              ) : (
                <DrawPad onChange={setDraft} />
              )}
              <div className="flex gap-2">
                <Button disabled={!draft || busy} onClick={() => save(draft)}>Salvar esta assinatura</Button>
                {user.signature && <Button variant="ghost" disabled={busy} onClick={() => save(null)}>Remover assinatura atual</Button>}
              </div>
            </div>
          </Card>
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{draft ? 'Prévia da nova assinatura' : 'Assinatura atual'}</div>
            <SignaturePreview src={draft ?? user.signature?.dataUrl ?? null} name={user.name} cargo={user.cargo} />
            {user.signature && !draft && <p className="text-xs text-muted-foreground">Atualizada em {dateTime(user.signature.updatedAt)}.</p>}
            <div className={cx('rounded border bg-white p-3 text-xs text-muted-foreground')}>
              Cada aplicação registra data, hora, IP, usuário e um código (hash) do conteúdo da SC. Se a SC for alterada depois, a assinatura deixa de valer e precisa ser refeita.
              A assinatura com certificado (gov.br, ZapSign, Clicksign ou D4Sign) fica para a fase 2.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
