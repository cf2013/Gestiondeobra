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

const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

export default function CatalogManager({ onClose, onChanged }) {
  const [acts, setActs] = useState([]);
  const [mats, setMats] = useState([]);
  const [aNombre, setANombre] = useState("");
  const [aPeso, setAPeso] = useState("");
  const [mNombre, setMNombre] = useState("");
  const [mUnidad, setMUnidad] = useState("");
  const [err, setErr] = useState(null);
  // preview unificado: { tipo:'add'|'edit', nombre?, filas:[{id,nombre,actual,nuevo}], nueva? }
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({}); // peso en edición (borrador) por actividad

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

  // Sincroniza el borrador con los pesos guardados (al cargar y tras guardar)
  useEffect(() => {
    const m = {};
    acts.forEach((a) => (m[a.id] = Number(a.peso)));
    setDraft(m);
  }, [acts]);

  const pesoDe = (a) => (draft[a.id] ?? Number(a.peso));
  const totalDraft = acts.reduce((s, a) => s + pesoDe(a), 0);
  const dirty = acts.some((a) => pesoDe(a) !== Number(a.peso));

  function setPeso(id, valor) {
    setDraft((prev) => ({ ...prev, [id]: clamp(valor) }));
  }

  // ---- AGREGAR: preview con las existentes reescaladas (usa el borrador) ----
  function pedirAgregar(e) {
    e.preventDefault();
    setErr(null);
    if (!aNombre.trim()) return;
    const W = clamp(aPeso);
    if (acts.length === 0) {
      setPreview({ tipo: "add", nombre: aNombre.trim(), filas: [], nueva: 100 });
      return;
    }
    const nuevos = distribuir(acts.map((a) => pesoDe(a)), 100 - W);
    const filas = acts.map((a, i) => ({
      id: a.id,
      nombre: a.nombre,
      actual: Number(a.peso),
      nuevo: nuevos[i],
    }));
    setPreview({ tipo: "add", nombre: aNombre.trim(), filas, nueva: W });
  }

  // ---- GUARDAR PESOS: normaliza todo el borrador a 100% y abre preview ----
  function pedirGuardarPesos() {
    if (!dirty) return;
    setErr(null);
    const nuevos = distribuir(acts.map((a) => pesoDe(a)), 100);
    const filas = acts.map((a, i) => ({
      id: a.id,
      nombre: a.nombre,
      actual: Number(a.peso),
      nuevo: nuevos[i],
    }));
    setPreview({ tipo: "edit", filas });
  }

  const cancelarPreview = () => !saving && setPreview(null); // conserva el borrador

  // ---- CONFIRMAR: sirve para add y edit ----
  async function confirmarPreview() {
    setSaving(true);
    setErr(null);
    try {
      // update por fila (un upsert nulificaría `nombre` NOT NULL en el INSERT)
      const cambiadas = preview.filas.filter((f) => f.nuevo !== f.actual);
      const res = await Promise.all(
        cambiadas.map((f) => supabase.from("actividades").update({ peso: f.nuevo }).eq("id", f.id))
      );
      const failed = res.find((r) => r.error);
      if (failed) throw failed.error;

      if (preview.tipo === "add") {
        const orden = (acts.reduce((m, a) => Math.max(m, a.orden), 0) || 0) + 1;
        const { error: e2 } = await supabase
          .from("actividades")
          .insert({ nombre: preview.nombre, peso: preview.nueva, orden });
        if (e2) throw e2;
        setANombre("");
        setAPeso("");
      }
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
    const restantes = acts.filter((a) => a.id !== id);
    if (restantes.length) {
      const nuevos = distribuir(restantes.map((a) => Number(a.peso)), 100);
      await Promise.all(
        restantes.map((a, i) =>
          nuevos[i] !== Number(a.peso)
            ? supabase.from("actividades").update({ peso: nuevos[i] }).eq("id", a.id)
            : Promise.resolve()
        )
      );
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

  const totalOk = totalDraft === 100;

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
            <h4>
              Actividades{" "}
              <span className={`hint-inline ${!totalOk ? "warn" : ""}`}>total: {totalDraft}%</span>
            </h4>
            <div className="cat-list">
              {acts.map((a) => {
                const val = pesoDe(a);
                return (
                  <div key={a.id} className="cat-act">
                    <div className="cat-act-head">
                      <span className="cat-act-name">{a.nombre}</span>
                      <input
                        type="number"
                        className="peso-input"
                        min="0"
                        max="100"
                        value={val}
                        onChange={(e) => setPeso(a.id, e.target.value)}
                      />
                      <span className="pct-sign">%</span>
                      <button className="del" onClick={() => delAct(a.id)}>✕</button>
                    </div>
                    <input
                      type="range"
                      className="slider"
                      min="0"
                      max="100"
                      step="1"
                      value={val}
                      style={{ "--fill": `${val}%` }}
                      onChange={(e) => setPeso(a.id, e.target.value)}
                    />
                  </div>
                );
              })}
              {acts.length === 0 && <div className="empty">Sin actividades todavía.</div>}
            </div>

            {acts.length > 0 && (
              <div className="cat-save-row">
                <span className="hint">
                  {dirty ? "Cambios sin guardar" : "Sin cambios"}
                  {dirty && !totalOk && ` · se reajustará a 100%`}
                </span>
                <button className="btn-accent" disabled={!dirty} onClick={pedirGuardarPesos}>
                  Guardar pesos
                </button>
              </div>
            )}

            <form className="cat-form" onSubmit={pedirAgregar}>
              <input placeholder="Nueva actividad" value={aNombre} onChange={(e) => setANombre(e.target.value)} />
              <input type="number" min="0" max="100" step="any" placeholder="Peso %" value={aPeso} onChange={(e) => setAPeso(e.target.value)} style={{ maxWidth: 90 }} />
              <button className="btn-accent" type="submit">Agregar</button>
            </form>
            <p className="hint" style={{ marginTop: 8 }}>Ajusta los pesos con el slider o escribiéndolos; al pulsar <b>Guardar pesos</b> verás la vista previa reajustada a 100% antes de confirmar.</p>
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

        {/* Vista previa del reajuste de pesos (compartida add/edit) */}
        {preview && (
          <div className="modal-overlay inner" onClick={cancelarPreview}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
              <div className="modal-head">
                <h3 style={{ margin: 0 }}>Vista previa · reajuste a 100%</h3>
                <button onClick={cancelarPreview}>✕</button>
              </div>
              <p className="hint" style={{ marginTop: 0 }}>
                {preview.tipo === "add"
                  ? preview.filas.length
                    ? <>Al agregar <b>“{preview.nombre}”</b> los pesos quedan así:</>
                    : <>Primera actividad <b>“{preview.nombre}”</b>:</>
                  : <>Los pesos se guardarán reajustados a 100%:</>}
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
                {preview.tipo === "add" && (
                  <div className="preview-row nueva">
                    <span>➕ {preview.nombre}</span>
                    <span className="preview-change">
                      <span className="new chg">{preview.nueva}%</span>
                    </span>
                  </div>
                )}
              </div>
              <div className="preview-total">
                Total: <b>{preview.filas.reduce((s, f) => s + f.nuevo, 0) + (preview.tipo === "add" ? preview.nueva : 0)}%</b>
              </div>
              <div className="preview-actions">
                <button onClick={cancelarPreview} disabled={saving}>Cancelar</button>
                <button className="btn-accent" onClick={confirmarPreview} disabled={saving}>
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
