/**
 * Ilustração decorativa da tela de entrada: a Solicitação de Compras em miniatura, fiel à planilha
 * (faixas #002060, itens, total, 4 campos de assinatura), inclinada em perspectiva, com a assinatura
 * e o selo "Aprovada". Feita em HTML/CSS (sem imagem): nítida em qualquer tela e leve.
 * O papel continua branco no tema escuro, como um documento de verdade.
 */
const NAVY = '#002060';

function Band({ cols }: { cols: string[] }) {
  return (
    <div className="flex text-[7px] font-bold uppercase tracking-wide text-white" style={{ background: NAVY }}>
      {cols.map((c, i) => (
        <div key={i} className="flex-1 border-r border-white/20 px-1.5 py-[3px] last:border-0">{c}</div>
      ))}
    </div>
  );
}

const Signature = ({ d }: { d: string }) => (
  <svg viewBox="0 0 120 40" className="absolute -top-3 left-1/2 h-9 w-24 -translate-x-1/2" aria-hidden="true">
    <path d={d} fill="none" stroke="#1c2878" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ScIllustration() {
  return (
    <div aria-hidden="true" className="pointer-events-none select-none" style={{ perspective: '1400px' }}>
      <div className="relative w-[430px]" style={{ transform: 'rotateX(22deg) rotateY(-20deg) rotateZ(5deg)', transformStyle: 'preserve-3d' }}>
        {/* folhas de baixo (pilha) */}
        <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-md bg-white/70 shadow-[0_2px_10px_rgba(0,0,0,0.08)] dark:bg-white/20" />
        <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-md bg-white/90 dark:bg-white/40" />
        {/* folha principal */}
        <div className="relative overflow-hidden rounded-md bg-white text-[#1D1D1F] shadow-[0_30px_60px_-20px_rgba(16,24,64,0.35),0_8px_20px_-8px_rgba(16,24,64,0.2)] ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-black/10 px-3 py-2">
            <span className="text-[11px] font-extrabold italic tracking-tight" style={{ color: '#28309a' }}>AM</span>
            <span className="text-[10px] font-bold tracking-wide">SOLICITAÇÃO DE COMPRAS</span>
            <span className="text-[7px] font-semibold text-black/60">SC-2026-0007</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-2 border-b border-black/10 px-2 py-1.5 text-[7px]">
            <span><b>FORNECEDOR:</b> Oficina Mecânica</span>
            <span><b>DATA:</b> 13/11/2026</span>
          </div>
          <Band cols={['Forma de pagamento', 'Rateio C. C.', 'Parcela']} />
          <div className="grid grid-cols-3 border-b border-black/10 text-[7px]">
            <div className="space-y-[3px] border-r border-black/10 px-1.5 py-1.5">
              {['Boleto', 'Boleto parcelado', 'PIX', 'Transferência'].map((t, i) => (
                <div key={t} className="flex items-center gap-1">
                  <span className="grid h-[7px] w-[7px] place-items-center border border-black/60 text-[6px] leading-none">{i === 0 ? '×' : ''}</span>
                  {t.toUpperCase()}
                </div>
              ))}
            </div>
            <div className="border-r border-black/10 px-1.5 py-1.5">
              <div className="flex justify-between"><span>220102 - LOGÍSTICA</span><span>100%</span></div>
            </div>
            <div className="space-y-[3px] px-1.5 py-1.5">
              <div>1º 28/11/2026</div>
              <div className="h-[3px] w-10 rounded bg-black/10" />
              <div className="h-[3px] w-8 rounded bg-black/10" />
            </div>
          </div>
          <div className="px-2 pt-1 text-[6.5px] font-bold" style={{ background: '#DBE5F1' }}>DADOS DA NOTA FISCAL:</div>
          <div className="py-[2px] text-center text-[6.5px] font-bold text-white" style={{ background: NAVY }}>NATUREZA DA COMPRA</div>
          <div className="border-b border-black/10 py-1 text-center text-[7px]">51105010 - Manutenção e reparos</div>
          <div className="flex text-[6.5px] font-bold" style={{ background: '#B8CCE4' }}>
            {['DESCRIÇÃO', 'QTD', 'VALOR UND', 'VALOR TOTAL'].map((c, i) => (
              <div key={c} className={i === 0 ? 'flex-[2.2] px-1.5 py-[3px]' : 'flex-1 px-1 py-[3px] text-center'}>{c}</div>
            ))}
          </div>
          {[
            ['Troca de pneus', '6', '2.100,00', '12.600,00'],
            ['Alinhamento', '1', '100,00', '100,00'],
            ['', '', '', ''],
          ].map((r, i) => (
            <div key={i} className="flex h-[13px] border-b border-black/10 text-[7px]">
              <div className="flex-[2.2] border-r border-black/10 px-1.5 leading-[13px]">{r[0]}</div>
              <div className="flex-1 border-r border-black/10 text-center leading-[13px]">{r[1]}</div>
              <div className="flex-1 border-r border-black/10 pr-1 text-right leading-[13px]">{r[2] && `R$ ${r[2]}`}</div>
              <div className="flex-1 pr-1 text-right font-bold leading-[13px]">{r[3] ? `R$ ${r[3]}` : 'R$ -'}</div>
            </div>
          ))}
          <div className="flex items-center justify-between px-2 py-1" style={{ background: '#B8CCE4' }}>
            <span className="text-[10px] font-bold">TOTAL GERAL</span>
            <span className="text-[11px] font-bold">R$ 12.700,00</span>
          </div>
          <div className="grid grid-cols-4 text-[6px] text-black/70">
            {['SOLICITANTE', 'CONFERENTE', 'AUTORIZAÇÃO DE COMPRA', 'AUTORIZAÇÃO DE PAGAMENTO'].map((t, i) => (
              <div key={t} className="relative border-r border-black/10 px-1 pb-1.5 pt-1 text-center last:border-0">
                {t}
                <div className="relative mx-auto mt-5 w-4/5 border-t border-black/50">
                  {i === 2 && <Signature d="M6 30 C14 8, 20 8, 22 26 S30 6, 36 24 S46 12, 52 22 S64 30, 80 14 S104 10, 116 18" />}
                  {i === 3 && <Signature d="M4 26 C10 4, 18 6, 20 24 C22 34, 28 10, 34 22 C38 30, 44 8, 50 20 C56 30, 70 12, 86 16 C98 18, 108 8, 116 12" />}
                </div>
                {i >= 2 && <div className="mt-[2px] text-[5px] text-black/50">Assinado eletronicamente</div>}
              </div>
            ))}
          </div>
          <div className="h-1.5" style={{ background: NAVY }} />
        </div>
        {/* selo */}
        <div
          className="absolute right-6 top-[46%] rounded-md border-[2.5px] border-[#17694F] px-3 py-1 text-[17px] font-extrabold uppercase tracking-[0.12em] text-[#17694F] opacity-90"
          style={{ transform: 'rotate(-14deg) translateZ(30px)', background: 'rgba(227,244,236,0.85)' }}
        >
          Aprovada
        </div>
      </div>
    </div>
  );
}
