import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

export default function EjecutorHome() {
  const { profile, user, signOut } = useAuth();
  const [asigs, setAsigs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from("asignaciones")
        .select("unidad_id, unidades(etiqueta, numero_piso, qr_token)")
        .eq("ejecutor_id", user.id);
      if (active) {
        const rows = (data || [])
          .map((r) => r.unidades)
          .filter(Boolean)
          .sort((a, b) => a.numero_piso - b.numero_piso || a.etiqueta.localeCompare(b.etiqueta));
        setAsigs(rows);
        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [user.id]);

  return (
    <div className="ejec-wrap">
      <div className="ejec-card">
        <div className="ejec-head">
          <div className="logo">👷</div>
          <div>
            <div className="ejec-title">Hola, {profile?.nombre || "ejecutor"}</div>
            <div className="ejec-sub">Ejecutor de obra</div>
          </div>
        </div>

        <div className="ejec-note">
          📷 Escanea el <b>código QR</b> pegado en cada departamento para registrar tu avance.
          También puedes abrir directamente los deptos que te asignaron:
        </div>

        <h3>Mis departamentos</h3>
        {loading ? (
          <div className="empty">Cargando…</div>
        ) : asigs.length === 0 ? (
          <div className="empty">
            Aún no tienes departamentos asignados. Pídele al supervisor que te asigne.
          </div>
        ) : (
          <div className="ejec-list">
            {asigs.map((u) => (
              <Link key={u.qr_token} to={`/u/${u.qr_token}`} className="asig-link">
                <span>
                  <strong>Depto {u.etiqueta}</strong> · Piso {u.numero_piso}
                </span>
                <span className="asig-go">Abrir →</span>
              </Link>
            ))}
          </div>
        )}

        <div className="ejec-foot" style={{ marginTop: 18 }}>
          <button onClick={signOut}>Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}
