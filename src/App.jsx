import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import Login from "./pages/Login";
import SupervisorDashboard from "./pages/SupervisorDashboard";
import OwnerView from "./pages/OwnerView";
import EjecutorQR from "./pages/EjecutorQR";
import EjecutorHome from "./pages/EjecutorHome";
import "./App.css";

function Loader({ label = "Cargando…" }) {
  return (
    <div className="fullscreen-center">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

// Requiere sesión iniciada; enruta según rol.
function Home() {
  const { loading, session, role } = useAuth();
  if (loading) return <Loader />;
  if (!session) return <Navigate to="/login" replace />;
  if (role === "supervisor") return <SupervisorDashboard />;
  if (role === "ejecutor") return <EjecutorHome />;
  return <OwnerView />; // propietario (y default)
}

export default function App() {
  return (
    <Routes>
      {/* Pantalla pública del ejecutor (escaneo de QR) */}
      <Route path="/u/:token" element={<EjecutorQR />} />
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
