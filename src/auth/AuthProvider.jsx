import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sesión de Supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Perfil (rol) del usuario actual
  useEffect(() => {
    let active = true;
    async function load() {
      if (!session?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from("perfiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();
      if (active) {
        setProfile(data);
        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [session]);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.rol ?? null,
    loading,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    // meta: { nombre, rol_solicitado, codigo_supervisor }
    signUp: (email, password, meta) =>
      supabase.auth.signUp({ email, password, options: { data: meta } }),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
