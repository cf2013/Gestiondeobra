-- =====================================================================
-- 02 · Elección de rol en el registro protegida por CÓDIGO DE SUPERVISOR
-- Ejecutar en Supabase → SQL Editor (después de schema.sql). Idempotente.
-- =====================================================================

-- Config de la app: secretos server-side. Sin políticas RLS => ningún
-- cliente (anon/authenticated) puede leerla; solo funciones SECURITY DEFINER.
create table if not exists public.app_config (
  clave text primary key,
  valor text
);
alter table public.app_config enable row level security;

-- >>> CAMBIA 'OBRA-2026' por el código secreto que quieras usar <<<
insert into public.app_config(clave, valor) values ('codigo_supervisor', 'OBRA-2026')
on conflict (clave) do update set valor = excluded.valor;

-- Trigger de alta de usuario: lee el rol solicitado y valida el código.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rol       text := coalesce(new.raw_user_meta_data->>'rol_solicitado', 'propietario');
  v_codigo    text := new.raw_user_meta_data->>'codigo_supervisor';
  v_codigo_ok text;
  v_rol_final text := 'propietario';
begin
  if v_rol = 'supervisor' then
    select valor into v_codigo_ok from public.app_config where clave = 'codigo_supervisor';
    if v_codigo_ok is not null and v_codigo is not null and v_codigo = v_codigo_ok then
      v_rol_final := 'supervisor';
    end if;
  end if;

  insert into public.perfiles(id, nombre, rol)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', new.email), v_rol_final)
  on conflict (id) do nothing;
  return new;
end; $$;
