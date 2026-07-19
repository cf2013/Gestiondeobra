// Convierte las filas de la tabla `unidades` (+ mapa de avance) en las
// "unidades de render" que consumen los componentes 3D/2D.

export function gridDims(count) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

export function colorForProgress(p) {
  if (p >= 80) return "#34d399";
  if (p >= 50) return "#5b8cff";
  if (p >= 20) return "#fbbf24";
  return "#f87171";
}

// unidades: filas de la tabla. avanceMap: { [unidad_id]: number }
export function layoutUnits(unidades, avanceMap = {}) {
  const byPiso = new Map();
  unidades.forEach((u) => {
    if (!byPiso.has(u.numero_piso)) byPiso.set(u.numero_piso, []);
    byPiso.get(u.numero_piso).push(u);
  });

  const pisos = [...byPiso.keys()].sort((a, b) => a - b); // 1 = abajo
  const units = [];

  pisos.forEach((piso, f) => {
    const arr = byPiso.get(piso).sort((a, b) => a.numero_en_piso - b.numero_en_piso);
    const { cols, rows } = gridDims(arr.length);
    arr.forEach((u, i) => {
      const progress = avanceMap[u.id] ?? 0;
      units.push({
        id: u.id,
        piso,
        floor: f, // índice desde abajo (0)
        index: i,
        col: i % cols,
        row: Math.floor(i / cols),
        cols,
        rows,
        label: u.etiqueta,
        nombre: u.nombre,
        qr_token: u.qr_token,
        numero_en_piso: u.numero_en_piso,
        progress,
        color: colorForProgress(progress),
      });
    });
  });

  return { units, floorCount: pisos.length, pisos };
}
