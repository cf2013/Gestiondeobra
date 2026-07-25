import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Reparte `target` (entero) entre `pesos` proporcionalmente, devolviendo
// enteros que suman EXACTAMENTE target (método del mayor residuo).
function distribuir(pesos, target) {
  const n = pesos.length;
  if (n === 0) return [];
  const suma = pesos.reduce((s, v) => s + v, 0);
  const base = suma > 0 ? pesos.map((v) => (v / suma) * target) : pesos.map(() => target / n);
  const piso = base.map(Math.floor);
  let resto = target - piso.reduce((s, v) => s + v, 0);
  const orden = base
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...piso];
  for (let k = 0; k < resto; k++) out[orden[k % n].i]++;
  return out;
}

export default function CatalogManager({ onClose, onChanged }) {
  const [acts, setActs] = useState([]);
  const [mats, setMats] = useState([]);
  const [aNombre, setANombre] = useState("");
  const [aPeso, setAPeso] = useState("");
  const [mNombre, setMNombre] = useState("");
  const [mUnidad, setMUnidad] = useState("");
  const [err, setErr] = useState(null);
  const [preview, setPreview] = useState(null); // { nombre, peso, filas:[{id,nombre,actual,nuevo}], nueva }
  const [saving, setSaving] = useState(false);

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

  // Paso 1: abrir preview del reajuste (no guarda todavía)
  function pedirAgregar(e) {
    e.preventDefault();
    setErr(null);
    if (!aNombre.trim()) return;
    const W = Math.max(0, Math.min(100, Math.round(Number(aPeso) || 0)));
    if (acts.length === 0) {
      // Primera actividad: siempre 100 %
      setPreview({ nombre: aNombre.trim(), filas: [], nueva: 100 });
      return;
    }
    const target = 100 - W; // lo que se reparte entre las existentes
    const nuevos = distribuir(acts.map((a) => Number(a.peso)), target);
    const filas = acts.map((a, i) => ({
      id: a.id,
      nombre: a.nombre,
      actual: Number(a.peso),
      nuevo: nuevos[i],
    }));
    setPreview({ nombre: aNombre.trim(), filas, nueva: W });
  }

  // Paso 2: confirmar -> actualizar pesos existentes + insertar la nueva
  async function confirmarAgregar() {
    setSaving(true);
    setErr(null);
    try {
      if (preview.filas.length) {
        const updates = preview.filas.map((f) => ({ id: f.id, peso: f.nuevo }));
        const { error } = await supabase.from("actividades").upsert(updates, { onConflict: "id" });
        if (error) throw error;
      }
      const orden = (acts.reduce((m, a) => Math.max(m, a.orden), 0) || 0) + 1;
      const { error: e2 } = await supabase
        .from("actividades")
        .insert({ nombre: preview.nombre, peso: preview.nueva, orden });
      if (e2) throw e2;
      setANombre("");
      setAPeso("");
      setPreview(null);
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
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
    if (!window.confirm("¿Eliminar esta actividad? Se quitará de todas las unidades y los pesos restantes se reajustarán a 100%.")) return;
    setErr(null);
    const { error } = await supabase.from("actividades").delete().eq("id", id);
    if (error) return setErr(error.message);
    // Reajustar los restantes a 100 %
    const restantes = acts.filter((a) => a.id !== id);
    if (restantes.length) {
      const nuevos = distribuir(restantes.map((a) => Number(a.peso)), 100);
      const updates = restantes.map((a, i) => ({ id: a.id, peso: nuevos[i] }));
      await supabase.from("actividades").upsert(updates, { onConflict: "id" });
    }
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
            <form className="cat-form" onSubmit={pedirAgregar}>
              <input placeholder="Nueva actividad" value={aNombre} onChange={(e) => setANombre(e.target.value)} />
              <input type="number" min="0" max="100" step="any" placeholder="Peso %" value={aPeso} onChange={(e) => setAPeso(e.target.value)} style={{ maxWidth: 90 }} />
              <button className="btn-accent" type="submit">Agregar</button>
            </form>
            <p className="hint" style={{ marginTop: 8 }}>Al agregar, los pesos se reajustan automáticamente para sumar 100%. Verás una vista previa antes de guardar.</p>
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

        {/* Vista previa del reajuste de pesos */}
        {preview && (
          <div className="modal-overlay inner" onClick={() => !saving && setPreview(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
              <div className="modal-head">
                <h3 style={{ margin: 0 }}>Vista previa · reajuste a 100%</h3>
                <button onClick={() => !saving && setPreview(null)}>✕</button>
              </div>
              <p className="hint" style={{ marginTop: 0 }}>
                Al agregar <b>“{preview.nombre}”</b>{preview.filas.length ? " los pesos de las demás actividades se ajustan así:" : " (primera actividad):"}
              </p>
              <div className="preview-list">
                {preview.filas.map((f) => (
                  <div key={f.id} className="preview-row">
                    <span>{f.nombre}</span>
                    <span className="preview-change">
                      <span className="old">{f.actual}%</span>
                      <span className="arrow">→</span>
                      <span className={`new ${f.nuevo !== f.actual ? "chg" : ""}`}>{f.nuevo}%</span>
                    </span>
                  </div>
                ))}
                <div className="preview-row nueva">
                  <span>➕ {preview.nombre}</span>
                  <span className="preview-change">
                    <span className="new chg">{preview.nueva}%</span>
                  </span>
                </div>
              </div>
              <div className="preview-total">
                Total: <b>{preview.filas.reduce((s, f) => s + f.nuevo, 0) + preview.nueva}%</b>
              </div>
              <div className="preview-actions">
                <button onClick={() => setPreview(null)} disabled={saving}>Cancelar</button>
                <button className="btn-accent" onClick={confirmarAgregar} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
