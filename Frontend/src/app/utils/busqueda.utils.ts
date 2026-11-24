/**
 * Utilidades de búsqueda tolerante:
 * Ignoran tildes/diacríticos, mayúsculas, espacios adicionales y caracteres especiales
 * (puntos, guiones, símbolos, etc.) para que cualquier consulta encuentre coincidencias.
 */

export function normalizarTextoBusqueda(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function soloAlfanumerico(valor: unknown): string {
  return normalizarTextoBusqueda(valor).replace(/\s+/g, "");
}

export function coincideBusqueda(campos: Array<unknown>, consulta: string): boolean {
  const qNorm = normalizarTextoBusqueda(consulta);
  const qCompacto = qNorm.replace(/\s+/g, "");
  // Si solo contiene espacios o signos raros, no restringe resultados.
  if (!qCompacto) return true;

  const textoCompleto = campos.map(normalizarTextoBusqueda).join(" ");
  const textoCompacto = textoCompleto.replace(/\s+/g, "");

  // 1) Coincidencia compacta sin espacios ni signos (ej. "1.234.567-890" o "CO-9845 123")
  if (textoCompacto.includes(qCompacto)) return true;

  // 2) Coincidencia por tokens independientes (ej. "jose osorio" o "gestion  humana")
  const tokens = qNorm.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => textoCompleto.includes(t));
}
