import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { colorForProgress } from "../lib/buildingLayout";

export default function EjecutorQR() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [matId, setMatId] = useState("");
  const [cant, setCant] = useState("");
  const [saving, setSaving] = useState(false);
  // Borrador local: solo se envía al pulsar "Guardar"
  const [edits, setEdits] = useState({}); // actividad_id -> completada (solo las cambiadas)
  const [pendingMats, setPendingMats] = useState([]); // materiales por enviar

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
    // al cambiar de unidad o de sesión, descartar el borrador
    setEdits({});
    setPendingMats([]);
  }, [load, session?.user?.id]);

  const puedeEditar = !!data?.puede_editar;

  // Estado efectivo (servidor + borrador) de una actividad
  const estaCompleta = (a) => (a.id in edits ? edits[a.id] : a.completada);

  function toggleAct(a) {
    const server = a.completada;
    const next = !estaCompleta(a);
    setEdits((prev) => {
      const n = { ...prev };
      if (next === server) delete n[a.id];
      else n[a.id] = next;
      return n;
    });
  }

  function agregarMaterial(e) {
    e.preventDefault();
    if (!matId || !cant) return;
    const m = (data.materiales_catalogo || []).find((x) => String(x.id) === String(matId));
    setPendingMats((prev) => [
      ...prev,
      {
        tempId: Date.now() + Math.random(),
        material_id: matId,
        nombre: m?.nombre || "Material",
        unidad_medida: m?.unidad_medida || "",
        cantidad: Number(cant),
      },
    ]);
    setMatId("");
    setCant("");
  }

  const quitarPendiente = (tempId) =>
    setPendingMats((prev) => prev.filter((m) => m.tempId !== tempId));

  const acts = data?.actividades || [];
  const cambiadas = acts.filter((a) => a.id in edits && edits[a.id] !== a.completada);
  const dirty = cambiadas.length > 0 || pendingMats.length > 0;
  const totalCambios = cambiadas.length + pendingMats.length;

  async function guardar() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      for (const a of cambiadas) {
        const { error } = await supabase.rpc("qr_set_actividad", {
          p_token: token,
          p_actividad_id: a.id,
          p_completada: edits[a.id],
        });
        if (error) throw error;
      }
      for (const m of pendingMats) {
        const { error } = await supabase.rpc("qr_registrar_material", {
          p_token: token,
          p_material_id: m.material_id,
          p_cantidad: m.cantidad,
        });
        if (error) throw error;
      }
      setEdits({});
      setPendingMats([]);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const irALogin = () =>
    navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading) return <div className="fullscreen-center"><div className="spinner" /><p>Cargando…</p></div>;
  if ((error && !data?.unidad) || !data?.unidad)
    return (
      <div className="fullscreen-center">
        <div className="qr-error">
          <div style={{ fontSize: 40 }}>🚫</div>
          <p>QR no válido o depto no encontrado.</p>
        </div>
      </div>
    );

  // Avance oficial (ponderado por progreso parcial) calculado en el backend
  const pct = Number(data.avance || 0);
  const color = colorForProgress(pct);
  const materiales = [...(data.materiales_pendientes || []), ...(data.materiales_usados || [])];
  const hayPendientes = acts.some((a) => a.pendiente) || (data.materiales_pendientes || []).length > 0;

  return (
    <div className="ejec-wrap">
      <div className="ejec-card">
        <div className="ejec-head">
          <div className="logo">🏗️</div>
          <div style={{ flex: 1 }}>
            <div className="ejec-title">Depto {data.unidad.etiqueta}</div>
            <div className="ejec-sub">Piso {data.unidad.numero_piso}</div>
          </div>
          {session && (
            <button className="btn-ghost ejec-logout" onClick={cerrarSesion}>
              Salir
            </button>
          )}
        </div>

        <div className="progress-wrap">
          <div className="progress-bar big">
            <div style={{ width: `${pct}%`, background: color }} />
          </div>
          <span>{pct}% aprobado</span>
        </div>

        {/* Aviso según el estado de sesión / asignación */}
        {!session ? (
          <div className="ejec-note warn">
            🔒 Estás viendo el avance en <b>solo lectura</b>. Inicia sesión como ejecutor para registrar.
            <button className="btn-accent" style={{ marginTop: 10 }} onClick={irALogin}>
              Iniciar sesión para registrar
            </button>
          </div>
        ) : !puedeEditar ? (
          <div className="ejec-note warn">
            ⚠️ No estás asignado a este departamento. Solo puedes ver el avance.
            Pídele al supervisor que te asigne.
          </div>
        ) : (
          <div className="ejec-note">
            📋 Lo que marques aquí se envía como <b>propuesta</b> al pulsar <b>Guardar</b>. El supervisor
            debe dar el visto bueno para que cuente en el avance oficial.
          </div>
        )}

        {error && <div className="auth-msg err">{error}</div>}

        <h3>Actividades</h3>
        <div className="ejec-list">
          {acts.map((a) => {
            const completa = estaCompleta(a);
            const cambiada = a.id in edits && edits[a.id] !== a.completada;
            return (
              <label
                key={a.id}
                className={`act-row big ${a.pendiente ? "pend" : ""} ${cambiada ? "edited" : ""} ${!puedeEditar ? "readonly" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={completa}
                  disabled={!puedeEditar || saving}
                  onChange={() => toggleAct(a)}
                />
                <span>{a.nombre}</span>
                {cambiada && <span className="tag-edit">✎ sin guardar</span>}
                {!cambiada && a.pendiente && <span className="tag-pend">⏳ pendiente</span>}
                <span className="peso-badge">{a.peso}%</span>
              </label>
            );
          })}
        </div>

        <h3>Materiales usados</h3>
        <div className="ejec-list">
          {materiales.length === 0 && pendingMats.length === 0 && <div className="empty">Aún nada.</div>}
          {materiales.map((m) => (
            <div key={m.id} className={`mat ${m.pendiente ? "pend" : ""}`}>
              {m.material} · {m.cantidad} {m.unidad_medida || ""}
              {m.pendiente ? <span className="tag-pend">⏳ pendiente</span> : <span className="mat-fecha">{m.fecha}</span>}
            </div>
          ))}
          {pendingMats.map((m) => (
            <div key={m.tempId} className="mat porenviar">
              {m.nombre} · {m.cantidad} {m.unidad_medida || ""}
              <span className="tag-edit">✎ sin guardar</span>
              <button className="mat-quitar" onClick={() => quitarPendiente(m.tempId)} disabled={saving}>✕</button>
            </div>
          ))}
        </div>

        {puedeEditar && (
          <form className="mat-form" onSubmit={agregarMaterial}>
            <select value={matId} onChange={(e) => setMatId(e.target.value)}>
              <option value="">Material…</option>
              {(data.materiales_catalogo || []).map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
            <input type="number" min="0" step="any" placeholder="Cant." value={cant} onChange={(e) => setCant(e.target.value)} />
            <button className="btn-accent" type="submit" disabled={saving}>Añadir</button>
          </form>
        )}

        {puedeEditar && (
          <div className="ejec-save-bar">
            <span className="hint">
              {dirty ? `${totalCambios} cambio${totalCambios === 1 ? "" : "s"} sin guardar` : "Sin cambios pendientes"}
            </span>
            <button className="btn-accent" onClick={guardar} disabled={!dirty || saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}

        {puedeEditar && hayPendientes && (
          <div className="ejec-foot">Tienes cambios <b>pendientes de aprobación</b> del supervisor.</div>
        )}
      </div>
    </div>
  );
}
