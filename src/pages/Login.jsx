import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function Login() {
  const { session, signIn, signUp } = useAuth();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/";
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("propietario"); // rol solicitado en registro
  const [codigo, setCodigo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (session) return <Navigate to={redirect} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) throw error;
      } else {
        const meta = {
          nombre,
          rol_solicitado: rol,
          codigo_supervisor: rol === "supervisor" ? codigo : undefined,
        };
        const { data, error } = await signUp(email, password, meta);
        if (error) throw error;
        if (!data.session) {
          setMsg({ type: "ok", text: "Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión." });
          setMode("signin");
        }
      }
    } catch (err) {
      setMsg({ type: "err", text: err.message || "Ocurrió un error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card panel">
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="logo">🏗️</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Gestión de Obra</h1>
            <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: 13 }}>
              {mode === "signin" ? "Inicia sesión" : "Crea tu cuenta"}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === "signup" && (
            <label>
              Nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" />
            </label>
          )}
          <label>
            Correo
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" />
          </label>
          <label>
            Contraseña
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} />
          </label>

          {mode === "signup" && (
            <>
              <label>
                Tipo de cuenta
                <div className="role-toggle">
                  <button
                    type="button"
                    className={rol === "propietario" ? "active" : ""}
                    onClick={() => setRol("propietario")}
                  >
                    🏢 Propietario
                  </button>
                  <button
                    type="button"
                    className={rol === "supervisor" ? "active" : ""}
                    onClick={() => setRol("supervisor")}
                  >
                    🏗️ Supervisor
                  </button>
                </div>
              </label>
              {rol === "supervisor" && (
                <label>
                  Código de supervisor
                  <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="Código proporcionado por la obra"
                  />
                  <span className="field-hint">
                    Sin el código correcto, la cuenta se creará como Propietario.
                  </span>
                </label>
              )}
              <p className="field-hint" style={{ margin: 0 }}>
                Las cuentas de <b>ejecutor</b> las crea el supervisor desde su panel; no se registran aquí.
              </p>
            </>
          )}

          {msg && <div className={`auth-msg ${msg.type}`}>{msg.text}</div>}

          <button className="btn-accent" disabled={busy} type="submit">
            {busy ? "…" : mode === "signin" ? "Entrar" : "Registrarme"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "signin" ? (
            <>¿No tienes cuenta?{" "}
              <button className="linklike" onClick={() => { setMode("signup"); setMsg(null); }}>Regístrate</button>
            </>
          ) : (
            <>¿Ya tienes cuenta?{" "}
              <button className="linklike" onClick={() => { setMode("signin"); setMsg(null); }}>Inicia sesión</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
