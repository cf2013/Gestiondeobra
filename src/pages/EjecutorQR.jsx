import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { colorForProgress } from "../lib/buildingLayout";

export default function EjecutorQR() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nuevaAct, setNuevaAct] = useState("");
  const [matId, setMatId] = useState("");
  const [cant, setCant] = useState("");
  const [nuevoMat, setNuevoMat] = useState("");
  const [nuevoMatU, setNuevoMatU] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: res, error } = await supabase.rpc("qr_unidad", { p_token: token });
    if (error) setError(error.message);
    else setData(res);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function guardar(fn) {
    setSaving(true);
    const { error } = await fn();
    if (error) setError(error.message);
    await load();
    setSaving(false);
  }

  const toggleAct = (a) =>
    guardar(() =>
      supabase.rpc("qr_set_actividad", {
        p_token: token,
        p_actividad_id: a.id,
        p_completada: !a.completada,
      })
    );

  const addAct = (e) => {
    e.preventDefault();
    if (!nuevaAct.trim()) return;
    guardar(() =>
      supabase.rpc("qr_agregar_actividad", { p_token: token, p_nombre: nuevaAct.trim(), p_peso: 1 })
    ).then(() => setNuevaAct(""));
  };

  const registrarMat = (e) => {
    e.preventDefault();
    if (!matId || !cant) return;
    guardar(() =>
      supabase.rpc("qr_registrar_material", {
        p_token: token,
        p_material_id: matId,
        p_cantidad: Number(cant),
      })
    ).then(() => {
      setMatId("");
      setCant("");
    });
  };

  const addMat = (e) => {
    e.preventDefault();
    if (!nuevoMat.trim()) return;
    guardar(() =>
      supabase.rpc("qr_agregar_material", {
        p_token: token,
        p_nombre: nuevoMat.trim(),
        p_unidad_medida: nuevoMatU.trim() || null,
      })
    ).then(() => {
      setNuevoMat("");
      setNuevoMatU("");
    });
  };

  if (loading) return <div className="fullscreen-center"><div className="spinner" /><p>Cargando…</p></div>;
  if (error || !data?.unidad)
    return (
      <div className="fullscreen-center">
        <div className="qr-error">
          <div style={{ fontSize: 40 }}>🚫</div>
          <p>QR no válido o depto no encontrado.</p>
        </div>
      </div>
    );

  const acts = data.actividades || [];
  const total = acts.reduce((s, a) => s + Number(a.peso), 0);
  const done = acts.filter((a) => a.completada).reduce((s, a) => s + Number(a.peso), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const color = colorForProgress(pct);

  return (
    <div className="ejec-wrap">
      <div className="ejec-card">
        <div className="ejec-head">
          <div className="logo">🏗️</div>
          <div>
            <div className="ejec-title">Depto {data.unidad.etiqueta}</div>
            <div className="ejec-sub">Piso {data.unidad.numero_piso}</div>
          </div>
        </div>

        <div className="progress-wrap">
          <div className="progress-bar big">
            <div style={{ width: `${pct}%`, background: color }} />
          </div>
          <span>{pct}% de avance {saving && "· guardando…"}</span>
        </div>

        <h3>Actividades de hoy</h3>
        <div className="ejec-list">
          {acts.map((a) => (
            <label key={a.id} className="act-row big">
              <input type="checkbox" checked={a.completada} onChange={() => toggleAct(a)} />
              <span>{a.nombre}</span>
              <span className="peso-badge">{a.peso}%</span>
            </label>
          ))}
        </div>
        <form className="ejec-add" onSubmit={addAct}>
          <input placeholder="Nueva actividad…" value={nuevaAct} onChange={(e) => setNuevaAct(e.target.value)} />
          <button className="btn-accent" type="submit">+</button>
        </form>

        <h3>Materiales usados</h3>
        <div className="ejec-list">
          {(data.materiales_usados || []).map((m) => (
            <div key={m.id} className="mat">
              {m.material} · {m.cantidad} {m.unidad_medida || ""}
              <span className="mat-fecha">{m.fecha}</span>
            </div>
          ))}
          {(data.materiales_usados || []).length === 0 && <div className="empty">Aún nada.</div>}
        </div>

        <form className="mat-form" onSubmit={registrarMat}>
          <select value={matId} onChange={(e) => setMatId(e.target.value)}>
            <option value="">Material…</option>
            {(data.materiales_catalogo || []).map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
          <input type="number" min="0" step="any" placeholder="Cant." value={cant} onChange={(e) => setCant(e.target.value)} />
          <button className="btn-accent" type="submit">Registrar</button>
        </form>

        <form className="ejec-add" onSubmit={addMat}>
          <input placeholder="Nuevo material…" value={nuevoMat} onChange={(e) => setNuevoMat(e.target.value)} />
          <input placeholder="Unidad" value={nuevoMatU} onChange={(e) => setNuevoMatU(e.target.value)} style={{ maxWidth: 90 }} />
          <button className="btn-accent" type="submit">+</button>
        </form>
      </div>
    </div>
  );
}
