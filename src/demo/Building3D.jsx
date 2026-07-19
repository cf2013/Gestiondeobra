import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, Billboard, Text } from "@react-three/drei";

const GAP = 1.2; // separación entre centros en X/Z (planta)
const GAP_Y = 1.45; // separación vertical entre pisos
const SIZE = 1.0; // tamaño del bloque

function Unit({ position, color, label, selected, hovered, dimmed, onSelect, onHover, onUnhover }) {
  return (
    <group position={position}>
      <RoundedBox
        args={[SIZE, SIZE, SIZE]}
        radius={0.08}
        smoothness={4}
        scale={selected ? 1.14 : 1}
        onClick={(e) => {
          if (dimmed) return;
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          if (dimmed) return;
          e.stopPropagation();
          onHover();
        }}
        onPointerOut={onUnhover}
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={dimmed ? 0.12 : 1}
          emissive={selected ? color : hovered ? "#ffffff" : "#000000"}
          emissiveIntensity={selected ? 0.5 : hovered ? 0.15 : 0}
          metalness={0.15}
          roughness={0.5}
        />
      </RoundedBox>
      {!dimmed && (
        <Billboard position={[0, SIZE * 0.62, 0]}>
          <Text
            fontSize={0.3}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.022}
            outlineColor="#0c1330"
          >
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

export default function Building3D({ units, floorCount, focusFloor, selectedId, onSelect }) {
  const [hoveredId, setHoveredId] = useState(null);

  // Centrado vertical del edificio
  const offsetY = ((floorCount - 1) * GAP_Y) / 2;

  return (
    <Canvas
      shadows
      camera={{ position: [8, 6.5, 11], fov: 45 }}
      style={{ width: "100%", height: "100%", borderRadius: 16 }}
    >
      <color attach="background" args={["#0c1330"]} />
      <fog attach="fog" args={["#0c1330", 16, 34]} />

      <ambientLight intensity={0.55} />
      <directionalLight position={[7, 12, 7]} intensity={1.3} castShadow />
      <directionalLight position={[-6, 4, -5]} intensity={0.4} color="#8b5cff" />

      {/* Suelo */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -offsetY - 1.0, 0]} receiveShadow>
        <planeGeometry args={[48, 48]} />
        <meshStandardMaterial color="#0a0f24" />
      </mesh>
      <gridHelper args={[48, 48, "#26356a", "#182148"]} position={[0, -offsetY - 0.99, 0]} />

      <group>
        {units.map((u) => {
          // Cada planta se centra en su propio origen X/Z
          const offsetX = ((u.cols - 1) * GAP) / 2;
          const offsetZ = ((u.rows - 1) * GAP) / 2;
          const dimmed = focusFloor != null && u.floor !== focusFloor;
          return (
            <Unit
              key={u.id}
              position={[
                u.col * GAP - offsetX,
                u.floor * GAP_Y - offsetY,
                u.row * GAP - offsetZ,
              ]}
              color={u.color}
              label={u.label}
              selected={u.id === selectedId}
              hovered={u.id === hoveredId}
              dimmed={dimmed}
              onSelect={() => onSelect(u.id)}
              onHover={() => setHoveredId(u.id)}
              onUnhover={() => setHoveredId(null)}
            />
          );
        })}
      </group>

      <OrbitControls
        enablePan={false}
        minDistance={5}
        maxDistance={30}
        maxPolarAngle={Math.PI / 1.85}
      />
    </Canvas>
  );
}
