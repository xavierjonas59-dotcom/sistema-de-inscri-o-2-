import type { NewFile } from '@/services/DataService';

type DownloadsApi = { save: (o: { filename: string; data: Blob }) => Promise<unknown> };
let downloadsApi: Promise<DownloadsApi | null> | null = null;

/** No visualizador de demonstração (claude.ai) os downloads passam pelo recurso "downloads"; fora dele, download normal. */
function viewerDownloads(): Promise<DownloadsApi | null> {
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!c?.use) return Promise.resolve(null);
  return (downloadsApi ??= c.use('downloads').then((d) => (d as DownloadsApi | null) ?? null, () => null));
}

/** Entrega um arquivo ao usuário (download). */
export async function saveBlob(blob: Blob, filename: string) {
  const d = await viewerDownloads();
  if (d) {
    try {
      await d.save({ filename, data: blob });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'declined') return;
      throw new Error(code === 'rejected_extension' ? 'Formato de arquivo não permitido para download aqui.' : 'Não foi possível baixar o arquivo neste visualizador.');
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function saveDataUrl(dataUrl: string, filename: string) {
  await saveBlob(await (await fetch(dataUrl)).blob(), filename);
}

export function readFile(file: File): Promise<NewFile> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mimeType: file.type, size: file.size, url: String(r.result) });
    r.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    r.readAsDataURL(file);
  });
}
