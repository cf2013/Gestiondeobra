import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function CatalogManager({ onClose, onChanged }) {
  const [acts, setActs] = useState([]);
  const [mats, setMats] = useState([]);
  const [aNombre, setANombre] = useState("");
  const [aPeso, setAPeso] = useState("");
  const [mNombre, setMNombre] = useState("");
  const [mUnidad, setMUnidad] = useState("");
  const [err, setErr] = useState(null);

  async function load() {
    const [a, m] = await Promise.all([
      supabase.from("actividades").select("*").order("orden"),
      supabase.from("materiales").select("*").order("nombre"),
    ]);
    setActs(a.data || []);
    setMats(m.data || []);
  }
  useEffect(() => {
    load();
  }, []);

  const totalPeso = acts.reduce((s, a) => s + Number(a.peso), 0);

  async function addAct(e) {
    e.preventDefault();
    setErr(null);
    if (!aNombre.trim()) return;
    const orden = (acts.reduce((m, a) => Math.max(m, a.orden), 0) || 0) + 1;
    const { error } = await supabase
      .from("actividades")
      .insert({ nombre: aNombre.trim(), peso: Number(aPeso) || 1, orden });
    if (error) return setErr(error.message);
    setANombre("");
    setAPeso("");
    await load();
    onChanged?.();
  }

  async function addMat(e) {
    e.preventDefault();
    setErr(null);
    if (!mNombre.trim()) return;
    const { error } = await supabase
      .from("materiales")
      .insert({ nombre: mNombre.trim(), unidad_medida: mUnidad.trim() || null });
    if (error) return setErr(error.message);
    setMNombre("");
    setMUnidad("");
    await load();
    onChanged?.();
  }

  async function delAct(id) {
    if (!window.confirm("¿Eliminar esta actividad del catálogo? Se quitará de todas las unidades.")) return;
    await supabase.from("actividades").delete().eq("id", id);
    await load();
    onChanged?.();
  }

  async function delMat(id) {
    if (!window.confirm("¿Eliminar este material del catálogo?")) return;
    await supabase.from("materiales").delete().eq("id", id);
    await load();
    onChanged?.();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>Catálogos</h3>
          <button onClick={onClose}>✕</button>
        </div>

        {err && <div className="auth-msg err">{err}</div>}

        <div className="catalog-grid">
          <section>
            <h4>Actividades <span className="hint-inline">peso total: {totalPeso}%</span></h4>
            <div className="cat-list">
              {acts.map((a) => (
                <div key={a.id} className="cat-item">
                  <span>{a.nombre}</span>
                  <span className="peso-badge">{a.peso}%</span>
                  <button className="del" onClick={() => delAct(a.id)}>✕</button>
                </div>
              ))}
            </div>
            <form className="cat-form" onSubmit={addAct}>
              <input placeholder="Nueva actividad" value={aNombre} onChange={(e) => setANombre(e.target.value)} />
              <input type="number" min="0" step="any" placeholder="Peso %" value={aPeso} onChange={(e) => setAPeso(e.target.value)} style={{ maxWidth: 90 }} />
              <button className="btn-accent" type="submit">Agregar</button>
            </form>
            <p className="hint" style={{ marginTop: 8 }}>El avance de cada depto se calcula con estos pesos. Idealmente suman 100%.</p>
          </section>

          <section>
            <h4>Materiales</h4>
            <div className="cat-list">
              {mats.map((m) => (
                <div key={m.id} className="cat-item">
                  <span>{m.nombre}</span>
                  <span className="peso-badge">{m.unidad_medida || "—"}</span>
                  <button className="del" onClick={() => delMat(m.id)}>✕</button>
                </div>
              ))}
            </div>
            <form className="cat-form" onSubmit={addMat}>
              <input placeholder="Nuevo material" value={mNombre} onChange={(e) => setMNombre(e.target.value)} />
              <input placeholder="Unidad (sacos, m…)" value={mUnidad} onChange={(e) => setMUnidad(e.target.value)} style={{ maxWidth: 130 }} />
              <button className="btn-accent" type="submit">Agregar</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
