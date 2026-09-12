import React, { useState } from 'react';
import PublicLayout from '@/components/layout/PublicLayout';
import { supabase } from '@/lib/supabase';

type Step = 'form' | 'pix' | 'done';

const PIX_KEY = 'email@exemplo.com';
const BASE_PRICE = 30;
const CERTIFICATE_PRICE = 10;

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCurrency(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export default function Index() {
  const [step, setStep] = useState<Step>('form');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [church, setChurch] = useState('');
  const [wantsCertificate, setWantsCertificate] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [insertedId, setInsertedId] = useState<string | null>(null);

  const totalCents = (BASE_PRICE + (wantsCertificate ? CERTIFICATE_PRICE : 0)) * 100;

  const inputClass =
    'flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

  const btnPrimaryClass =
    'inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

  const btnSecondaryClass =
    'inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

  const validateCPF = (raw: string): boolean => {
    const cleanCpf = raw.replace(/\D/g, '');
    if (cleanCpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cleanCpf)) return false;
    let sum = 0;
    let remainder;
    for (let i = 1; i <= 9; i++) sum += parseInt(cleanCpf.substring(i - 1, i)) * (11 - i);
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCpf.substring(9, 10))) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum += parseInt(cleanCpf.substring(i - 1, i)) * (12 - i);
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCpf.substring(10, 11))) return false;
    return true;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim() || !email.trim()) {
      setErrorMsg('Preencha nome e e-mail.');
      return;
    }
    if (!validateCPF(cpf)) {
      setErrorMsg('CPF inválido. Informe um CPF válido.');
      return;
    }
    if (!church.trim()) {
      setErrorMsg('Informe sua Igreja ou Oficina.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.from('inscricoes').insert([
        {
          nome: name.trim(),
          email: email.trim(),
          telefone: phone.replace(/\D/g, '') || null,
          cpf: cpf.replace(/\D/g, ''),
          igreja_oficina: church.trim(),
          certificado: wantsCertificate,
          valor_centavos: totalCents,
          status: 'pendente'
        },
      ]).select().single();
      if (error) throw error;
      if (data) {
        setInsertedId(data.id);
      }
      setStep('pix');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyPix = async () => {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceipt(true);
    setErrorMsg('');
    try {
      const cpfDigits = cpf.replace(/\D/g, '');
      const fileName = `${cpfDigits}_${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('comprovantes')
        .upload(fileName, file, { upsert: false });
      if (uploadError) throw uploadError;

      if (insertedId) {
        const { error: updateError } = await supabase
          .from('inscricoes')
          .update({ comprovante_url: fileName })
          .eq('id', insertedId);
        if (updateError) throw updateError;
      }

      setStep('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao enviar comprovante');
    } finally {
      setUploadingReceipt(false);
    }
  };

  // ---------- STEP: FORM ----------
  if (step === 'form') {
    return (
      <PublicLayout>
        <form onSubmit={handleFormSubmit} className="space-y-5 rounded-lg border bg-card p-6 shadow">
          <h2 className="text-xl font-semibold">Formulário de Inscrição</h2>

          {errorMsg && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{errorMsg}</div>
          )}

          {/* Nome */}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium leading-none">
              Nome completo *
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              required
              autoComplete="name"
              className={inputClass}
            />
          </div>

          {/* E-mail */}
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium leading-none">
              E-mail *
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>

          {/* Telefone */}
          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium leading-none">
              Telefone
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(00) 00000-0000"
              autoComplete="tel"
              className={inputClass}
            />
          </div>

          {/* CPF */}
          <div className="space-y-2">
            <label htmlFor="cpf" className="text-sm font-medium leading-none">
              CPF *
            </label>
            <input
              id="cpf"
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              placeholder="000.000.000-00"
              required
              inputMode="numeric"
              className={inputClass}
            />
          </div>

          {/* Igreja / Oficina */}
          <div className="space-y-2">
            <label htmlFor="church" className="text-sm font-medium leading-none">
              Igreja / Oficina *
            </label>
            <input
              id="church"
              value={church}
              onChange={(e) => setChurch(e.target.value)}
              placeholder="Nome da sua igreja ou oficina"
              required
              className={inputClass}
            />
          </div>

          {/* Certificado */}
          <div className="flex items-start gap-3 rounded-md border p-4">
            <input
              id="certificate"
              type="checkbox"
              checked={wantsCertificate}
              onChange={(e) => setWantsCertificate(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            <label htmlFor="certificate" className="text-sm leading-snug">
              <span className="font-medium">Desejo receber certificado</span>
              <br />
              <span className="text-muted-foreground">
                Adiciona {formatCurrency(CERTIFICATE_PRICE * 100)} ao valor da inscrição
              </span>
            </label>
          </div>

          {/* Valor total */}
          <div className="rounded-md bg-muted p-4 text-center">
            <p className="text-sm text-muted-foreground">Valor total</p>
            <p className="text-2xl font-bold">{formatCurrency(totalCents)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Inscrição: {formatCurrency(BASE_PRICE * 100)}
              {wantsCertificate ? ` + Certificado: ${formatCurrency(CERTIFICATE_PRICE * 100)}` : ''}
            </p>
          </div>

          <button type="submit" disabled={submitting} className={btnPrimaryClass}>
            {submitting ? 'Enviando...' : 'Continuar para Pagamento'}
          </button>
        </form>
      </PublicLayout>
    );
  }

  // ---------- STEP: PIX ----------
  if (step === 'pix') {
    return (
      <PublicLayout>
        <div className="space-y-6 rounded-lg border bg-card p-6 shadow">
          <h2 className="text-xl font-semibold text-center">Pagamento via Pix</h2>

          {errorMsg && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{errorMsg}</div>
          )}

          {/* Resumo */}
          <div className="space-y-2 rounded-md border p-4 text-sm">
            <p>
              <span className="font-medium">Nome:</span> {name}
            </p>
            <p>
              <span className="font-medium">E-mail:</span> {email}
            </p>
            {phone && (
              <p>
                <span className="font-medium">Telefone:</span> {phone}
              </p>
            )}
            <p>
              <span className="font-medium">CPF:</span> {cpf}
            </p>
            <p>
              <span className="font-medium">Igreja / Oficina:</span> {church}
            </p>
            <p>
              <span className="font-medium">Certificado:</span> {wantsCertificate ? 'Sim' : 'Não'}
            </p>
            <hr className="my-2" />
            <p className="text-base font-bold">
              Total: {formatCurrency(totalCents)}
            </p>
          </div>

          {/* QR Code mockado */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/40 bg-muted">
              <div className="text-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mx-auto mb-2 text-muted-foreground"
                >
                  <rect x="2" y="2" width="6" height="6" rx="1" />
                  <rect x="16" y="2" width="6" height="6" rx="1" />
                  <rect x="2" y="16" width="6" height="6" rx="1" />
                  <path d="M10 2h1v4h-1zM2 10h4v1H2zM10 10h4v4h-4zM18 10h4v1h-4zM10 18h1v4h-1zM18 16h4v6h-6v-4" />
                </svg>
                <span className="text-xs text-muted-foreground">QR Code Pix</span>
              </div>
            </div>

            {/* Chave Pix */}
            <div className="w-full space-y-2">
              <p className="text-center text-sm text-muted-foreground">Ou copie a chave Pix:</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={PIX_KEY}
                  className={inputClass + ' flex-1 text-center font-mono'}
                />
                <button
                  type="button"
                  onClick={handleCopyPix}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>

          {/* Upload comprovante */}
          <div className="space-y-2">
            <p className="text-center text-sm font-medium">Envie o comprovante de pagamento</p>
            <label
              htmlFor="receipt"
              className={btnPrimaryClass + (uploadingReceipt ? ' pointer-events-none opacity-50' : ' cursor-pointer')}
            >
              {uploadingReceipt ? 'Enviando...' : 'Selecionar comprovante'}
            </label>
            <input
              id="receipt"
              type="file"
              accept="image/*,.pdf"
              onChange={handleUploadReceipt}
              disabled={uploadingReceipt}
              className="hidden"
            />
          </div>

          <button type="button" onClick={() => setStep('form')} className={btnSecondaryClass}>
            Voltar e editar dados
          </button>
        </div>
      </PublicLayout>
    );
  }

  // ---------- STEP: DONE ----------
  return (
    <PublicLayout>
      <div className="rounded-lg border bg-card p-6 text-center shadow">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-600"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-semibold">Inscrição realizada!</h2>
        <p className="text-muted-foreground">
          Seu comprovante foi enviado com sucesso. Aguarde a confirmação do pagamento.
        </p>
        <div className="mt-6 space-y-2 rounded-md border p-4 text-left text-sm">
          <p>
            <span className="font-medium">Nome:</span> {name}
          </p>
          <p>
            <span className="font-medium">E-mail:</span> {email}
          </p>
          <p>
            <span className="font-medium">CPF:</span> {cpf}
          </p>
          <p>
            <span className="font-medium">Igreja / Oficina:</span> {church}
          </p>
          <p>
            <span className="font-medium">Certificado:</span> {wantsCertificate ? 'Sim' : 'Não'}
          </p>
          <p className="font-bold">
            Total pago: {formatCurrency(totalCents)}
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
