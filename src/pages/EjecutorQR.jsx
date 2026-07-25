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
    // recargar cuando cambia la sesión (p. ej. tras iniciar sesión)
  }, [load, session?.user?.id]);

  const puedeEditar = !!data?.puede_editar;

  async function guardar(fn) {
    setSaving(true);
    setError(null);
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

  const irALogin = () =>
    navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);

  if (loading) return <div className="fullscreen-center"><div className="spinner" /><p>Cargando…</p></div>;
  if (error && !data?.unidad)
    return (
      <div className="fullscreen-center">
        <div className="qr-error">
          <div style={{ fontSize: 40 }}>🚫</div>
          <p>QR no válido o depto no encontrado.</p>
        </div>
      </div>
    );
  if (!data?.unidad)
    return (
      <div className="fullscreen-center">
        <div className="qr-error">
          <div style={{ fontSize: 40 }}>🚫</div>
          <p>QR no válido o depto no encontrado.</p>
        </div>
      </div>
    );

  const acts = data.actividades || [];
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
          <div>
            <div className="ejec-title">Depto {data.unidad.etiqueta}</div>
            <div className="ejec-sub">Piso {data.unidad.numero_piso}</div>
          </div>
        </div>

        <div className="progress-wrap">
          <div className="progress-bar big">
            <div style={{ width: `${pct}%`, background: color }} />
          </div>
          <span>{pct}% aprobado {saving && "· guardando…"}</span>
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
            📋 Lo que marques aquí se envía como <b>propuesta</b>. El supervisor debe dar el visto bueno
            para que cuente en el avance oficial.
          </div>
        )}

        {error && <div className="auth-msg err">{error}</div>}

        <h3>Actividades</h3>
        <div className="ejec-list">
          {acts.map((a) => (
            <label
              key={a.id}
              className={`act-row big ${a.pendiente ? "pend" : ""} ${!puedeEditar ? "readonly" : ""}`}
            >
              <input
                type="checkbox"
                checked={a.completada}
                disabled={!puedeEditar || saving}
                onChange={() => toggleAct(a)}
              />
              <span>{a.nombre}</span>
              {a.pendiente && <span className="tag-pend">⏳ pendiente</span>}
              <span className="peso-badge">{a.peso}%</span>
            </label>
          ))}
        </div>

        <h3>Materiales usados</h3>
        <div className="ejec-list">
          {materiales.length === 0 && <div className="empty">Aún nada.</div>}
          {materiales.map((m) => (
            <div key={m.id} className={`mat ${m.pendiente ? "pend" : ""}`}>
              {m.material} · {m.cantidad} {m.unidad_medida || ""}
              {m.pendiente ? <span className="tag-pend">⏳ pendiente</span> : <span className="mat-fecha">{m.fecha}</span>}
            </div>
          ))}
        </div>

        {puedeEditar && (
          <form className="mat-form" onSubmit={registrarMat}>
            <select value={matId} onChange={(e) => setMatId(e.target.value)}>
              <option value="">Material…</option>
              {(data.materiales_catalogo || []).map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
            <input type="number" min="0" step="any" placeholder="Cant." value={cant} onChange={(e) => setCant(e.target.value)} />
            <button className="btn-accent" type="submit" disabled={saving}>Registrar</button>
          </form>
        )}

        {puedeEditar && hayPendientes && (
          <div className="ejec-foot">Tienes cambios <b>pendientes de aprobación</b> del supervisor.</div>
        )}
      </div>
    </div>
  );
}
