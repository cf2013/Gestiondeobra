import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

export default function ReviewPanel({ onClose, onChanged }) {
  const [avances, setAvances] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, m] = await Promise.all([
      supabase
        .from("avance_propuestas")
        .select("id, completada, creado_at, unidades(etiqueta, numero_piso), actividades(nombre, peso), perfiles:creado_por(nombre)")
        .eq("estado", "pendiente")
        .order("creado_at"),
      supabase
        .from("material_propuestas")
        .select("id, cantidad, creado_at, unidades(etiqueta, numero_piso), materiales(nombre, unidad_medida), perfiles:creado_por(nombre)")
        .eq("estado", "pendiente")
        .order("creado_at"),
    ]);
    setAvances(a.data || []);
    setMateriales(m.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(rpc, id) {
    setBusy(true);
    await supabase.rpc(rpc, { p_id: id });
    await load();
    onChanged?.();
    setBusy(false);
  }

  async function aprobarTodo() {
    setBusy(true);
    for (const a of avances) await supabase.rpc("aprobar_avance", { p_id: a.id });
    for (const m of materiales) await supabase.rpc("aprobar_material", { p_id: m.id });
    await load();
    onChanged?.();
    setBusy(false);
  }

  const totalPend = avances.length + materiales.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>Revisión de avances {totalPend > 0 && <span className="count-badge">{totalPend}</span>}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            {totalPend > 0 && <button className="btn-accent" disabled={busy} onClick={aprobarTodo}>✓ Aprobar todo</button>}
            <button onClick={onClose}>✕</button>
          </div>
        </div>

        {loading ? (
          <div className="empty">Cargando…</div>
        ) : totalPend === 0 ? (
          <div className="empty" style={{ padding: 20, textAlign: "center" }}>
            🎉 No hay nada pendiente de revisar.
          </div>
        ) : (
          <div className="review-grid">
            <section>
              <h4>Actividades ({avances.length})</h4>
              <div className="cat-list">
                {avances.map((a) => (
                  <div key={a.id} className="review-item">
                    <div className="review-info">
                      <strong>Depto {a.unidades?.etiqueta}</strong>
                      <span>{a.actividades?.nombre}</span>
                      <span className={`tag ${a.completada ? "ok" : "bad"}`}>
                        {a.completada ? "marcar hecha" : "desmarcar"} · {a.actividades?.peso}%
                      </span>
                      {a.perfiles?.nombre && <span className="review-by">👷 {a.perfiles.nombre}</span>}
                    </div>
                    <div className="review-actions">
                      <button className="ok-btn" disabled={busy} onClick={() => act("aprobar_avance", a.id)}>✓</button>
                      <button className="bad-btn" disabled={busy} onClick={() => act("rechazar_avance", a.id)}>✕</button>
                    </div>
                  </div>
                ))}
                {avances.length === 0 && <div className="empty">Sin actividades pendientes.</div>}
              </div>
            </section>

            <section>
              <h4>Materiales ({materiales.length})</h4>
              <div className="cat-list">
                {materiales.map((m) => (
                  <div key={m.id} className="review-item">
                    <div className="review-info">
                      <strong>Depto {m.unidades?.etiqueta}</strong>
                      <span>{m.materiales?.nombre} · {m.cantidad} {m.materiales?.unidad_medida || ""}</span>
                      {m.perfiles?.nombre && <span className="review-by">👷 {m.perfiles.nombre}</span>}
                    </div>
                    <div className="review-actions">
                      <button className="ok-btn" disabled={busy} onClick={() => act("aprobar_material", m.id)}>✓</button>
                      <button className="bad-btn" disabled={busy} onClick={() => act("rechazar_material", m.id)}>✕</button>
                    </div>
                  </div>
                ))}
                {materiales.length === 0 && <div className="empty">Sin materiales pendientes.</div>}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
