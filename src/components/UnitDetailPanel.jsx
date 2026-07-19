import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { colorForProgress } from "../lib/buildingLayout";

const today = () => new Date().toISOString().slice(0, 10);

export default function UnitDetailPanel({ unit, editable, onChanged, onQR }) {
  const [acts, setActs] = useState([]);
  const [mats, setMats] = useState([]);
  const [reg, setReg] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matId, setMatId] = useState("");
  const [cant, setCant] = useState("");

  async function load() {
    setLoading(true);
    const [a, ua, m, r] = await Promise.all([
      supabase.from("actividades").select("*").order("orden"),
      supabase.from("unidad_actividad").select("actividad_id, completada").eq("unidad_id", unit.id),
      supabase.from("materiales").select("*").order("nombre"),
      supabase
        .from("registro_materiales")
        .select("id, cantidad, fecha, materiales(nombre, unidad_medida)")
        .eq("unidad_id", unit.id)
        .order("fecha", { ascending: false }),
    ]);
    const done = {};
    (ua.data || []).forEach((x) => (done[x.actividad_id] = x.completada));
    setActs((a.data || []).map((x) => ({ ...x, completada: !!done[x.id] })));
    setMats(m.data || []);
    setReg(r.data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit.id]);

  async function toggle(act) {
    if (!editable) return;
    const completada = !act.completada;
    setActs((prev) => prev.map((x) => (x.id === act.id ? { ...x, completada } : x)));
    await supabase
      .from("unidad_actividad")
      .upsert(
        { unidad_id: unit.id, actividad_id: act.id, completada, fecha: today() },
        { onConflict: "unidad_id,actividad_id" }
      );
    onChanged?.();
  }

  async function registrarMaterial(e) {
    e.preventDefault();
    if (!matId || !cant) return;
    await supabase.from("registro_materiales").insert({
      unidad_id: unit.id,
      material_id: matId,
      cantidad: Number(cant),
    });
    setMatId("");
    setCant("");
    load();
  }

  const totalPeso = acts.reduce((s, a) => s + Number(a.peso), 0);
  const donePeso = acts.filter((a) => a.completada).reduce((s, a) => s + Number(a.peso), 0);
  const pct = totalPeso ? Math.round((donePeso / totalPeso) * 100) : 0;
  const color = colorForProgress(pct);

  return (
    <div className="unit-card">
      <div className="unit-big" style={{ color }}>Depto {unit.label}</div>
      <div className="unit-sub">Piso {unit.piso}{unit.nombre ? ` · ${unit.nombre}` : ""}</div>

      <div className="progress-wrap">
        <div className="progress-bar">
          <div style={{ width: `${pct}%`, background: color }} />
        </div>
        <span>{pct}% de avance (ponderado)</span>
      </div>

      {loading ? (
        <div className="empty">Cargando…</div>
      ) : (
        <>
          <div className="mock-list">
            <div className="mock-title">Actividades {editable && <span className="hint-inline">(marca las hechas)</span>}</div>
            {acts.length === 0 && <div className="empty">Sin actividades en el catálogo.</div>}
            {acts.map((a) => (
              <label key={a.id} className={`act-row ${!editable ? "ro" : ""}`}>
                <input type="checkbox" checked={a.completada} disabled={!editable} onChange={() => toggle(a)} />
                <span>{a.nombre}</span>
                <span className="peso-badge">{a.peso}%</span>
              </label>
            ))}
          </div>

          <div className="mock-list">
            <div className="mock-title">Materiales usados</div>
            {reg.length === 0 && <div className="empty">Aún no se registran materiales.</div>}
            {reg.map((r) => (
              <div key={r.id} className="mat">
                {r.materiales?.nombre} · {r.cantidad} {r.materiales?.unidad_medida || ""}
                <span className="mat-fecha">{r.fecha}</span>
              </div>
            ))}

            {editable && (
              <form className="mat-form" onSubmit={registrarMaterial}>
                <select value={matId} onChange={(e) => setMatId(e.target.value)}>
                  <option value="">Material…</option>
                  {mats.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Cant."
                  value={cant}
                  onChange={(e) => setCant(e.target.value)}
                />
                <button className="btn-accent" type="submit">+</button>
              </form>
            )}
          </div>

          {editable && (
            <button className="btn-accent qr-btn" onClick={() => onQR(unit)}>📱 Generar / imprimir QR</button>
          )}
        </>
      )}
    </div>
  );
}
