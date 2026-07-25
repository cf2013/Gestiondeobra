import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

export default function EjecutoresManager({ onClose }) {
  const { user } = useAuth();
  const [ejecutores, setEjecutores] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [selId, setSelId] = useState(null);
  const [asigIds, setAsigIds] = useState(new Set());
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const loadEjecutores = useCallback(async () => {
    const { data } = await supabase
      .from("perfiles")
      .select("id, nombre, email")
      .eq("rol", "ejecutor")
      .order("nombre");
    setEjecutores(data || []);
  }, []);

  useEffect(() => {
    loadEjecutores();
    supabase
      .from("unidades")
      .select("id, etiqueta, numero_piso, numero_en_piso")
      .order("numero_piso")
      .order("numero_en_piso")
      .then(({ data }) => setUnidades(data || []));
  }, [loadEjecutores]);

  // Asignaciones del ejecutor seleccionado
  useEffect(() => {
    if (!selId) {
      setAsigIds(new Set());
      return;
    }
    supabase
      .from("asignaciones")
      .select("unidad_id")
      .eq("ejecutor_id", selId)
      .then(({ data }) => setAsigIds(new Set((data || []).map((r) => r.unidad_id))));
  }, [selId]);

  const porPiso = useMemo(() => {
    const map = new Map();
    unidades.forEach((u) => {
      if (!map.has(u.numero_piso)) map.set(u.numero_piso, []);
      map.get(u.numero_piso).push(u);
    });
    return [...map.entries()].sort((a, b) => b[0] - a[0]); // pisos altos arriba
  }, [unidades]);

  async function crear(e) {
    e.preventDefault();
    setMsg(null);
    if (!email.trim() || !password) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("crear-ejecutor", {
        body: { nombre: nombre.trim(), email: email.trim(), password },
      });
      if (error) throw new Error(await parseFnError(error));
      if (data?.error) throw new Error(data.error);
      setMsg({ type: "ok", text: `Cuenta creada para ${email.trim()}.` });
      setNombre("");
      setEmail("");
      setPassword("");
      await loadEjecutores();
    } catch (err) {
      setMsg({ type: "err", text: err.message || "No se pudo crear la cuenta." });
    } finally {
      setBusy(false);
    }
  }

  async function toggleAsig(unidad) {
    if (!selId) return;
    const asignado = asigIds.has(unidad.id);
    // Optimista
    setAsigIds((prev) => {
      const next = new Set(prev);
      asignado ? next.delete(unidad.id) : next.add(unidad.id);
      return next;
    });
    if (asignado) {
      await supabase.from("asignaciones").delete().eq("ejecutor_id", selId).eq("unidad_id", unidad.id);
    } else {
      await supabase.from("asignaciones").insert({
        ejecutor_id: selId,
        unidad_id: unidad.id,
        creado_por: user.id,
      });
    }
  }

  const selected = ejecutores.find((e) => e.id === selId) || null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>👷 Ejecutores</h3>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="ejec-manager">
          {/* Columna izquierda: crear + lista */}
          <section>
            <h4>Nuevo ejecutor</h4>
            <form className="cat-form col" onSubmit={crear}>
              <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <input type="email" required placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input
                type="text"
                required
                placeholder="Contraseña temporal (mín. 6)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
              />
              <button className="btn-accent" type="submit" disabled={busy}>
                {busy ? "Creando…" : "Crear cuenta"}
              </button>
            </form>
            {msg && <div className={`auth-msg ${msg.type}`}>{msg.text}</div>}
            <p className="hint" style={{ marginTop: 8 }}>
              Comparte el correo y la contraseña con el ejecutor; podrá entrar de inmediato.
            </p>

            <h4 style={{ marginTop: 16 }}>Cuentas ({ejecutores.length})</h4>
            <div className="cat-list">
              {ejecutores.map((e) => (
                <button
                  key={e.id}
                  className={`ejec-pick ${selId === e.id ? "active" : ""}`}
                  onClick={() => setSelId(e.id)}
                >
                  <strong>{e.nombre || e.email}</strong>
                  <span className="muted">{e.email}</span>
                </button>
              ))}
              {ejecutores.length === 0 && <div className="empty">Aún no hay ejecutores.</div>}
            </div>
          </section>

          {/* Columna derecha: asignación de unidades */}
          <section>
            <h4>
              Unidades asignadas
              {selected && <span className="hint-inline"> · {selected.nombre || selected.email}</span>}
            </h4>
            {!selected ? (
              <div className="empty">Selecciona un ejecutor para asignarle departamentos.</div>
            ) : unidades.length === 0 ? (
              <div className="empty">No hay unidades creadas todavía.</div>
            ) : (
              <div className="asig-floors">
                {porPiso.map(([piso, us]) => (
                  <div key={piso} className="asig-floor">
                    <div className="asig-floor-label">Piso {piso}</div>
                    <div className="asig-units">
                      {us.map((u) => (
                        <label key={u.id} className={`asig-chip ${asigIds.has(u.id) ? "on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={asigIds.has(u.id)}
                            onChange={() => toggleAsig(u)}
                          />
                          {u.etiqueta}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// Los errores de functions.invoke traen el cuerpo en context.response
async function parseFnError(error) {
  try {
    const body = await error.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    /* ignore */
  }
  return error.message || "Error al invocar la función";
}
