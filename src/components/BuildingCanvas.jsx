import { useState } from "react";
import Building3D from "../demo/Building3D";
import Building2D from "../demo/Building2D";

// Visualización reutilizable (supervisor y propietario).
// units, floorCount vienen de layoutUnits(). selectedId/onSelect los maneja el padre.
export default function BuildingCanvas({ units, floorCount, selectedId, onSelect }) {
  const [view, setView] = useState("3d");
  const [focusFloor, setFocusFloor] = useState(null);

  const floorsTopDown = [...Array(floorCount).keys()].reverse();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="canvas-toolbar">
        <div className="view-toggle">
          <button className={view === "3d" ? "active" : ""} onClick={() => setView("3d")}>🧊 3D</button>
          <button className={view === "2d" ? "active" : ""} onClick={() => setView("2d")}>📐 Planta</button>
        </div>
        <div className="floor-filter">
          <button className={focusFloor == null ? "active" : ""} onClick={() => setFocusFloor(null)}>Todos</button>
          {floorsTopDown.map((f) => (
            <button key={f} className={focusFloor === f ? "active" : ""} onClick={() => setFocusFloor(f)}>
              P{f + 1}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {floorCount === 0 ? (
          <div className="empty" style={{ display: "grid", placeItems: "center", height: "100%" }}>
            Aún no hay unidades. Usa “+1 piso” para empezar a construir el edificio.
          </div>
        ) : view === "3d" ? (
          <Building3D units={units} floorCount={floorCount} focusFloor={focusFloor} selectedId={selectedId} onSelect={onSelect} />
        ) : (
          <Building2D units={units} floorCount={floorCount} focusFloor={focusFloor} selectedId={selectedId} onSelect={onSelect} />
        )}
      </div>
    </div>
  );
}
