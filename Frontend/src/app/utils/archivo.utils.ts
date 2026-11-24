export function descargarBlob(blob: Blob, nombreArchivo: string): void {
  const url = window.URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  window.URL.revokeObjectURL(url);
}

export async function leerMensajeErrorHttp(err: unknown, defecto = "Ocurrió un error inesperado"): Promise<string> {
  const httpErr = err as { error?: unknown; message?: string } | null;
  try {
    if (httpErr?.error instanceof Blob) {
      const texto = await httpErr.error.text();
      const parsed = JSON.parse(texto) as { mensaje?: string };
      if (parsed?.mensaje) return parsed.mensaje;
    }
  } catch {
    // Fallback al mensaje estándar si el Blob no contiene JSON.
  }
  const errorObj = httpErr?.error as { mensaje?: string } | undefined;
  return errorObj?.mensaje || httpErr?.message || defecto;
}

export function formatearTamanoArchivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
