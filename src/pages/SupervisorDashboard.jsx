import { useMemo, useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { useBuilding } from "../hooks/useBuilding";
import BuildingCanvas from "../components/BuildingCanvas";
import UnitDetailPanel from "../components/UnitDetailPanel";
import QRModal from "../components/QRModal";
import CatalogManager from "../components/CatalogManager";
import ReviewPanel from "../components/ReviewPanel";

const etiqueta = (piso, n) => `${piso}${String(n).padStart(2, "0")}`;
const DEFAULT_UNITS = 4;

export default function SupervisorDashboard() {
  const { profile, signOut } = useAuth();
  const { units, floorCount, pisos, loading, reload } = useBuilding();
  const [selectedId, setSelectedId] = useState(null);
  const [qrUnit, setQrUnit] = useState(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [pendCount, setPendCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const selected = units.find((u) => u.id === selectedId) || null;

  // Contador de propuestas pendientes de revisión
  const loadPend = useCallback(async () => {
    const [a, m] = await Promise.all([
      supabase.from("avance_propuestas").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
      supabase.from("material_propuestas").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    ]);
    setPendCount((a.count || 0) + (m.count || 0));
  }, []);

  useEffect(() => {
    loadPend();
  }, [loadPend]);

  // Pisos de arriba hacia abajo con su conteo
  const floors = useMemo(() => {
    const map = new Map();
    units.forEach((u) => map.set(u.piso, (map.get(u.piso) || 0) + 1));
    return [...pisos].sort((a, b) => b - a).map((p) => ({ piso: p, count: map.get(p) || 0 }));
  }, [units, pisos]);

  async function run(fn) {
    setBusy(true);
    await fn();
    await reload();
    setBusy(false);
  }

  const addFloor = () =>
    run(async () => {
      const nextPiso = pisos.length ? Math.max(...pisos) + 1 : 1;
      const rows = Array.from({ length: DEFAULT_UNITS }, (_, i) => ({
        numero_piso: nextPiso,
        numero_en_piso: i + 1,
        etiqueta: etiqueta(nextPiso, i + 1),
      }));
      await supabase.from("unidades").insert(rows);
    });

  const removeFloor = () =>
    run(async () => {
      if (!pisos.length) return;
      const top = Math.max(...pisos);
      if (!window.confirm(`¿Eliminar el piso ${top} completo con sus deptos?`)) return;
      await supabase.from("unidades").delete().eq("numero_piso", top);
      if (selected?.piso === top) setSelectedId(null);
    });

  const addUnit = (piso) =>
    run(async () => {
      const inFloor = units.filter((u) => u.piso === piso);
      const nextN = inFloor.length ? Math.max(...inFloor.map((u) => u.numero_en_piso)) + 1 : 1;
      await supabase.from("unidades").insert({
        numero_piso: piso,
        numero_en_piso: nextN,
        etiqueta: etiqueta(piso, nextN),
      });
    });

  const removeUnit = (piso) =>
    run(async () => {
      const inFloor = units
        .filter((u) => u.piso === piso)
        .sort((a, b) => b.numero_en_piso - a.numero_en_piso);
      if (!inFloor.length) return;
      const target = inFloor[0];
      if (!window.confirm(`¿Eliminar depto ${target.label}? Se borrará su avance y materiales.`)) return;
      await supabase.from("unidades").delete().eq("id", target.id);
      if (selected?.id === target.id) setSelectedId(null);
    });

  const total = units.length;
  const avgAvance = total ? Math.round(units.reduce((s, u) => s + u.progress, 0) / total) : 0;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">🏗️</div>
          <div>
            <h1>Gestión de Obra</h1>
            <p>Supervisor · {profile?.nombre || ""}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="pill">Avance obra: {avgAvance}%</span>
          <button className={pendCount > 0 ? "btn-review" : ""} onClick={() => setShowReview(true)}>
            🔎 Revisión {pendCount > 0 && <span className="count-badge">{pendCount}</span>}
          </button>
          <button onClick={() => setShowCatalog(true)}>🗂️ Catálogos</button>
          <button onClick={signOut}>Salir</button>
        </div>
      </header>

      <div className="layout">
        <aside className="panel controls">
          <h2>Estructura {busy && <span className="hint-inline">guardando…</span>}</h2>

          <div className="control-row">
            <span>Pisos ({floorCount})</span>
            <div className="stepper">
              <button onClick={removeFloor} disabled={busy || !floorCount}>−1</button>
              <button className="btn-accent" onClick={addFloor} disabled={busy}>+1 piso</button>
            </div>
          </div>

          <div className="floor-list">
            {floors.map(({ piso, count }) => (
              <div key={piso} className="floor-item">
                <span>Piso {piso}</span>
                <div className="stepper small">
                  <button onClick={() => removeUnit(piso)} disabled={busy}>−</button>
                  <strong>{count}</strong>
                  <button onClick={() => addUnit(piso)} disabled={busy}>+</button>
                </div>
              </div>
            ))}
            {floorCount === 0 && <div className="empty">Sin pisos. Pulsa “+1 piso”.</div>}
          </div>

          <div className="total pill">Total: {total} unidades</div>

          <h2 style={{ marginTop: 22 }}>Leyenda</h2>
          <ul className="legend">
            <li><span style={{ background: "#f87171" }} /> 0–20%</li>
            <li><span style={{ background: "#fbbf24" }} /> 20–50%</li>
            <li><span style={{ background: "#5b8cff" }} /> 50–80%</li>
            <li><span style={{ background: "#34d399" }} /> 80–100%</li>
          </ul>

          <div className="hint">
            Crea pisos y deptos, genera el QR de cada uno para imprimirlo y colocarlo físicamente.
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
            <UnitDetailPanel unit={selected} editable onChanged={reload} onQR={setQrUnit} />
          ) : (
            <div className="empty">Haz click en un departamento para ver y editar su detalle.</div>
          )}
        </aside>
      </div>

      {qrUnit && <QRModal unit={qrUnit} onClose={() => setQrUnit(null)} />}
      {showCatalog && <CatalogManager onClose={() => setShowCatalog(false)} onChanged={reload} />}
      {showReview && (
        <ReviewPanel
          onClose={() => setShowReview(false)}
          onChanged={() => {
            loadPend();
            reload();
          }}
        />
      )}
    </div>
  );
}
