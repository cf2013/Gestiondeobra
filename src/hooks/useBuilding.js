import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { layoutUnits } from "../lib/buildingLayout";

// Carga las unidades + su avance ponderado y las deja listas para render.
export function useBuilding() {
  const [data, setData] = useState({ units: [], floorCount: 0, pisos: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [uRes, aRes] = await Promise.all([
      supabase.from("unidades").select("*"),
      supabase.from("unidad_avance").select("unidad_id, avance"),
    ]);
    if (uRes.error) {
      setError(uRes.error.message);
      setLoading(false);
      return;
    }
    const map = {};
    (aRes.data || []).forEach((a) => {
      map[a.unidad_id] = a.avance;
    });
    setData(layoutUnits(uRes.data || [], map));
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...data, loading, error, reload };
}
