// =====================================================================
// Edge Function: crear-ejecutor
// El SUPERVISOR (autenticado) crea una cuenta de ejecutor.
// Usa la service_role key (secreta, disponible solo aquí en el servidor)
// para dar de alta el usuario y forzar su rol a 'ejecutor'.
//
// Deploy:
//   supabase functions deploy crear-ejecutor
// o pegar este código en Dashboard → Edge Functions → New function.
// No requiere secrets manuales: SUPABASE_URL, SUPABASE_ANON_KEY y
// SUPABASE_SERVICE_ROLE_KEY ya vienen inyectadas en el runtime.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // 1) Verificar que quien llama es SUPERVISOR (con su propio JWT)
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: esSup, error: eSup } = await caller.rpc("es_supervisor");
    if (eSup) throw eSup;
    if (!esSup) return json({ error: "No autorizado" }, 403);

    // 2) Datos del nuevo ejecutor
    const { email, password, nombre } = await req.json().catch(() => ({}));
    if (!email || !password) return json({ error: "email y contraseña son obligatorios" }, 400);
    if (String(password).length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);

    // 3) Alta con service_role (email ya confirmado para que pueda entrar)
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: created, error: eCreate } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: nombre || email },
    });
    if (eCreate) throw eCreate;

    const uid = created.user!.id;

    // 4) Forzar rol 'ejecutor' (el trigger lo creó como propietario)
    const { error: eUpd } = await admin
      .from("perfiles")
      .update({ rol: "ejecutor", nombre: nombre || email, email })
      .eq("id", uid);
    if (eUpd) throw eUpd;

    return json({ ok: true, id: uid, email });
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return json({ error: msg }, 400);
  }
});
