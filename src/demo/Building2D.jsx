import { useRef } from "react";

// Dibuja la planta de un piso (vista superior) como rejilla de deptos.
function FloorPlate({ floorUnits, cols, rows, tile, selectedId, onSelect, big }) {
  const gap = 6;
  const pad = 12;
  const w = pad * 2 + cols * tile + (cols - 1) * gap;
  const h = pad * 2 + rows * tile + (rows - 1) * gap;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <rect x={2} y={2} width={w - 4} height={h - 4} rx={12} fill="#111a34" stroke="#26356a" />
      {floorUnits.map((u) => {
        const x = pad + u.col * (tile + gap);
        const y = pad + u.row * (tile + gap);
        const isSel = u.id === selectedId;
        return (
          <g key={u.id} onClick={() => onSelect(u.id)} style={{ cursor: "pointer" }}>
            <rect
              x={x}
              y={y}
              width={tile}
              height={tile}
              rx={8}
              fill={u.color}
              fillOpacity={0.92}
              stroke={isSel ? "#ffffff" : "#0c1330"}
              strokeWidth={isSel ? 3 : 1.5}
            />
            <text
              x={x + tile / 2}
              y={y + tile / 2 + (big ? 2 : 1)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={big ? 16 : 13}
              fontWeight="700"
              fill="#0c1330"
            >
              {u.label}
            </text>
            {big && (
              <>
                <rect x={x + 8} y={y + tile - 12} width={tile - 16} height={5} rx={2.5} fill="#0c1330" fillOpacity={0.45} />
                <rect x={x + 8} y={y + tile - 12} width={(tile - 16) * (u.progress / 100)} height={5} rx={2.5} fill="#fff" fillOpacity={0.85} />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Contenedor con scroll y arrastre del mouse (pan). Un click simple no
// desplaza, así que la selección de unidades sigue funcionando.
function PanArea({ children }) {
  const ref = useRef(null);
  const drag = useRef({ active: false, x: 0, y: 0, sl: 0, st: 0 });

  const onDown = (e) => {
    const el = ref.current;
    drag.current = { active: true, x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
  };
  const onMove = (e) => {
    if (!drag.current.active) return;
    const el = ref.current;
    el.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
    el.scrollTop = drag.current.st - (e.clientY - drag.current.y);
  };
  const stop = () => {
    drag.current.active = false;
  };

  return (
    <div
      ref={ref}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={stop}
      onMouseLeave={stop}
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      {children}
    </div>
  );
}

export default function Building2D({ units, floorCount, focusFloor, selectedId, onSelect }) {
  // Agrupar unidades por piso
  const byFloor = [];
  for (let f = 0; f < floorCount; f++) byFloor.push([]);
  units.forEach((u) => byFloor[u.floor].push(u));

  const dims = (arr) => ({ cols: arr[0]?.cols || 1, rows: arr[0]?.rows || 1 });

  // --- Vista de un solo piso: planta grande ---
  if (focusFloor != null) {
    const arr = byFloor[focusFloor] || [];
    const { cols, rows } = dims(arr);
    return (
      <PanArea>
        <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: 20 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 12, fontWeight: 700, fontSize: 18 }}>
              Piso {focusFloor + 1} · planta ({arr.length} deptos)
            </div>
            <div style={{ filter: "drop-shadow(0 20px 30px rgba(0,0,0,.4))" }}>
              <FloorPlate
                floorUnits={arr}
                cols={cols}
                rows={rows}
                tile={74}
                big
                selectedId={selectedId}
                onSelect={onSelect}
              />
            </div>
          </div>
        </div>
      </PanArea>
    );
  }

  // --- Todas las plantas: de frente, apiladas verticalmente (Piso 1 abajo) ---
  return (
    <PanArea>
      <div
        style={{
          minHeight: "100%",
          display: "flex",
          flexDirection: "column-reverse", // Piso 1 al fondo
          alignItems: "center",
          gap: 22,
          padding: 24,
        }}
      >
        {byFloor.map((arr, f) => {
          const { cols, rows } = dims(arr);
          return (
            <div key={f} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>
                Piso {f + 1} · {arr.length} deptos
              </div>
              <FloorPlate
                floorUnits={arr}
                cols={cols}
                rows={rows}
                tile={52}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            </div>
          );
        })}
      </div>
    </PanArea>
  );
}
