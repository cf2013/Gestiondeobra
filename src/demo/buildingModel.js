// Modelo compartido por los dos demos (3D y 2D).
// En el proyecto real esto vendrá de Supabase; aquí generamos avance
// pseudo-aleatorio pero determinista para que los colores sean estables.
//
// Ahora cada piso puede tener un número distinto de departamentos.
// floorUnitCounts es un arreglo: índice 0 = PISO 1 (el de más abajo).

// Avance 0..100 determinista a partir de piso/índice.
export function progressFor(floor, index) {
  return (floor * 928371 + index * 12345 + 7) % 100;
}

// Etiqueta tipo "101" = piso 1, depto 01. Piso 1 = el de más abajo (floor 0).
export function unitLabel(floor, index) {
  const pisoNum = floor + 1;
  return `${pisoNum}${String(index + 1).padStart(2, "0")}`;
}

// Escala de color por avance: rojo -> ámbar -> azul -> verde
export function colorForProgress(p) {
  if (p >= 80) return "#34d399"; // verde
  if (p >= 50) return "#5b8cff"; // azul (en curso avanzado)
  if (p >= 20) return "#fbbf24"; // ámbar
  return "#f87171"; // rojo (recién iniciado)
}

// Dado un número de deptos, calcula una rejilla lo más cuadrada posible
// para la planta (columnas en X, filas en Z / profundidad).
export function gridDims(count) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

// Construye todas las unidades a partir del arreglo de conteos por piso.
export function buildUnits(floorUnitCounts) {
  const units = [];
  floorUnitCounts.forEach((count, f) => {
    const { cols, rows } = gridDims(count);
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const p = progressFor(f, i);
      units.push({
        id: `${f}-${i}`,
        floor: f,
        index: i,
        col,
        row,
        cols,
        rows,
        label: unitLabel(f, i),
        progress: p,
        color: colorForProgress(p),
      });
    }
  });
  return units;
}
