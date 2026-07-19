import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useBuilding } from "../hooks/useBuilding";
import BuildingCanvas from "../components/BuildingCanvas";
import UnitDetailPanel from "../components/UnitDetailPanel";

export default function OwnerView() {
  const { profile, signOut } = useAuth();
  const { units, floorCount, loading } = useBuilding();
  const [selectedId, setSelectedId] = useState(null);
  const selected = units.find((u) => u.id === selectedId) || null;

  const total = units.length;
  const avg = total ? Math.round(units.reduce((s, u) => s + u.progress, 0) / total) : 0;
  const terminadas = units.filter((u) => u.progress >= 100).length;

  const porPiso = useMemo(() => {
    const map = new Map();
    units.forEach((u) => {
      if (!map.has(u.piso)) map.set(u.piso, []);
      map.get(u.piso).push(u.progress);
    });
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([piso, arr]) => ({
        piso,
        avg: Math.round(arr.reduce((s, p) => s + p, 0) / arr.length),
        count: arr.length,
      }));
  }, [units]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">🏢</div>
          <div>
            <h1>Gestión de Obra</h1>
            <p>Propietario · {profile?.nombre || ""} · vista general</p>
          </div>
        </div>
        <button onClick={signOut}>Salir</button>
      </header>

      <div className="layout">
        <aside className="panel controls">
          <h2>Resumen de obra</h2>
          <div className="stat-big" style={{ marginBottom: 14 }}>
            <div className="stat-num">{avg}%</div>
            <div className="stat-label">avance general</div>
          </div>
          <div className="stat-row">
            <div className="stat"><strong>{total}</strong><span>unidades</span></div>
            <div className="stat"><strong>{floorCount}</strong><span>pisos</span></div>
            <div className="stat"><strong>{terminadas}</strong><span>terminadas</span></div>
          </div>

          <h2 style={{ marginTop: 22 }}>Avance por piso</h2>
          <div className="floor-list">
            {porPiso.map((p) => (
              <div key={p.piso} className="floor-item">
                <span>Piso {p.piso}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, marginLeft: 12 }}>
                  <div className="progress-bar" style={{ flex: 1 }}>
                    <div style={{ width: `${p.avg}%`, background: "#5b8cff" }} />
                  </div>
                  <strong style={{ fontSize: 13, minWidth: 34, textAlign: "right" }}>{p.avg}%</strong>
                </div>
              </div>
            ))}
            {floorCount === 0 && <div className="empty">Aún no hay unidades.</div>}
          </div>
        </aside>

        <main className="stage panel">
          {loading && floorCount === 0 ? (
            <div className="empty" style={{ display: "grid", placeItems: "center", height: "100%" }}>Cargando edificio…</div>
          ) : (
            <BuildingCanvas units={units} floorCount={floorCount} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </main>

        <aside className="panel details">
          <h2>Unidad seleccionada</h2>
          {selected ? (
            <UnitDetailPanel unit={selected} editable={false} />
          ) : (
            <div className="empty">Haz click en un departamento para ver su detalle (solo lectura).</div>
          )}
        </aside>
      </div>
    </div>
  );
}
