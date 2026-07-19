-- =====================================================================
-- GESTIÓN DE OBRA — Esquema de base de datos (una sola obra)
-- Ejecutar en Supabase → SQL Editor. Es idempotente: se puede correr
-- varias veces sin romper nada.
--
-- Roles:
--   supervisor   -> crea unidades, QRs, catálogos, reportes (CRUD total)
--   propietario  -> solo lectura de todo el edificio
--   ejecutor     -> SIN cuenta; entra escaneando el QR de un depto y
--                   registra avance/materiales mediante funciones RPC
--                   (nunca accede a las tablas directamente).
-- Avance: ponderado por peso de actividad.
-- =====================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- =====================================================================
-- 1. TABLAS
-- =====================================================================

-- Perfiles de usuarios autenticados (supervisor / propietario)
create table if not exists public.perfiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  nombre   text,
  rol      text not null default 'propietario' check (rol in ('supervisor','propietario')),
  creado_at timestamptz not null default now()
);

-- Unidades (departamentos)
create table if not exists public.unidades (
  id             uuid primary key default gen_random_uuid(),
  numero_piso    int  not null,               -- 1 = piso de más abajo
  numero_en_piso int  not null,               -- posición dentro del piso
  etiqueta       text not null,               -- ej. "101"
  nombre         text,                         -- nombre opcional
  qr_token       uuid not null unique default gen_random_uuid(),
  creado_at      timestamptz not null default now(),
  unique (numero_piso, numero_en_piso)
);

-- Catálogo de actividades (con peso para el avance ponderado)
create table if not exists public.actividades (
  id       uuid primary key default gen_random_uuid(),
  nombre   text not null unique,
  peso     numeric not null default 1 check (peso >= 0),
  orden    int not null default 0,
  creado_at timestamptz not null default now()
);

-- Estado de cada actividad por unidad
create table if not exists public.unidad_actividad (
  id            uuid primary key default gen_random_uuid(),
  unidad_id     uuid not null references public.unidades(id) on delete cascade,
  actividad_id  uuid not null references public.actividades(id) on delete cascade,
  completada    boolean not null default false,
  fecha         date,
  nota          text,
  actualizado_at timestamptz not null default now(),
  unique (unidad_id, actividad_id)
);

-- Catálogo de materiales
create table if not exists public.materiales (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null unique,
  unidad_medida text,
  creado_at     timestamptz not null default now()
);

-- Registro de materiales usados por unidad
create table if not exists public.registro_materiales (
  id          uuid primary key default gen_random_uuid(),
  unidad_id   uuid not null references public.unidades(id) on delete cascade,
  material_id uuid not null references public.materiales(id) on delete cascade,
  cantidad    numeric not null check (cantidad > 0),
  fecha       date not null default current_date,
  nota        text,
  creado_at   timestamptz not null default now()
);

-- =====================================================================
-- 2. VISTA: avance ponderado por unidad
--    avance = (suma de pesos completados / suma total de pesos) * 100
-- =====================================================================
create or replace view public.unidad_avance as
select
  u.id             as unidad_id,
  u.etiqueta,
  u.numero_piso,
  u.numero_en_piso,
  coalesce(
    round(
      coalesce(sum(a.peso) filter (where ua.completada), 0)
      / nullif((select sum(peso) from public.actividades), 0) * 100
    ), 0
  )::int as avance
from public.unidades u
left join public.unidad_actividad ua on ua.unidad_id = u.id
left join public.actividades a on a.id = ua.actividad_id
group by u.id;

-- La vista respeta la RLS de las tablas base (no expone datos a anon).
alter view public.unidad_avance set (security_invoker = on);

-- =====================================================================
-- 3. HELPER: ¿el usuario actual es supervisor?
-- =====================================================================
create or replace function public.es_supervisor()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'supervisor');
$$;

-- =====================================================================
-- 4. RLS (Row Level Security) para usuarios autenticados
-- =====================================================================
alter table public.perfiles            enable row level security;
alter table public.unidades            enable row level security;
alter table public.actividades         enable row level security;
alter table public.unidad_actividad    enable row level security;
alter table public.materiales          enable row level security;
alter table public.registro_materiales enable row level security;

-- perfiles ------------------------------------------------------------
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_supervisor());

drop policy if exists perfiles_update_own on public.perfiles;
create policy perfiles_update_own on public.perfiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists perfiles_update_sup on public.perfiles;
create policy perfiles_update_sup on public.perfiles
  for update to authenticated
  using (public.es_supervisor()) with check (public.es_supervisor());

-- Macro simple: SELECT para cualquier autenticado, ESCRITURA solo supervisor
-- unidades ------------------------------------------------------------
drop policy if exists unidades_select on public.unidades;
create policy unidades_select on public.unidades
  for select to authenticated using (true);
drop policy if exists unidades_write on public.unidades;
create policy unidades_write on public.unidades
  for all to authenticated
  using (public.es_supervisor()) with check (public.es_supervisor());

-- actividades ---------------------------------------------------------
drop policy if exists actividades_select on public.actividades;
create policy actividades_select on public.actividades
  for select to authenticated using (true);
drop policy if exists actividades_write on public.actividades;
create policy actividades_write on public.actividades
  for all to authenticated
  using (public.es_supervisor()) with check (public.es_supervisor());

-- unidad_actividad ----------------------------------------------------
drop policy if exists unidad_actividad_select on public.unidad_actividad;
create policy unidad_actividad_select on public.unidad_actividad
  for select to authenticated using (true);
drop policy if exists unidad_actividad_write on public.unidad_actividad;
create policy unidad_actividad_write on public.unidad_actividad
  for all to authenticated
  using (public.es_supervisor()) with check (public.es_supervisor());

-- materiales ----------------------------------------------------------
drop policy if exists materiales_select on public.materiales;
create policy materiales_select on public.materiales
  for select to authenticated using (true);
drop policy if exists materiales_write on public.materiales;
create policy materiales_write on public.materiales
  for all to authenticated
  using (public.es_supervisor()) with check (public.es_supervisor());

-- registro_materiales -------------------------------------------------
drop policy if exists registro_materiales_select on public.registro_materiales;
create policy registro_materiales_select on public.registro_materiales
  for select to authenticated using (true);
drop policy if exists registro_materiales_write on public.registro_materiales;
create policy registro_materiales_write on public.registro_materiales
  for all to authenticated
  using (public.es_supervisor()) with check (public.es_supervisor());

-- =====================================================================
-- 5. FLUJO QR (ejecutor anónimo) — funciones RPC security definer.
--    Validan el token del depto y hacen la escritura de forma acotada.
-- =====================================================================

-- Devuelve toda la info del depto para la pantalla del ejecutor.
create or replace function public.qr_unidad(p_token uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare v_unidad_id uuid; v json;
begin
  select id into v_unidad_id from unidades where qr_token = p_token;
  if v_unidad_id is null then raise exception 'QR no válido'; end if;

  select json_build_object(
    'unidad', (select row_to_json(x) from
      (select id, etiqueta, numero_piso, numero_en_piso, nombre
         from unidades where id = v_unidad_id) x),
    'actividades', (
      select coalesce(json_agg(json_build_object(
        'id', a.id, 'nombre', a.nombre, 'peso', a.peso,
        'completada', coalesce(ua.completada, false), 'fecha', ua.fecha
      ) order by a.orden, a.nombre), '[]'::json)
      from actividades a
      left join unidad_actividad ua
        on ua.actividad_id = a.id and ua.unidad_id = v_unidad_id
    ),
    'materiales_catalogo', (
      select coalesce(json_agg(json_build_object(
        'id', id, 'nombre', nombre, 'unidad_medida', unidad_medida
      ) order by nombre), '[]'::json) from materiales
    ),
    'materiales_usados', (
      select coalesce(json_agg(json_build_object(
        'id', rm.id, 'material', m.nombre, 'cantidad', rm.cantidad,
        'unidad_medida', m.unidad_medida, 'fecha', rm.fecha
      ) order by rm.fecha desc), '[]'::json)
      from registro_materiales rm
      join materiales m on m.id = rm.material_id
      where rm.unidad_id = v_unidad_id
    )
  ) into v;
  return v;
end; $$;

-- Marca/desmarca una actividad de la unidad.
create or replace function public.qr_set_actividad(
  p_token uuid, p_actividad_id uuid, p_completada boolean, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_unidad_id uuid;
begin
  select id into v_unidad_id from unidades where qr_token = p_token;
  if v_unidad_id is null then raise exception 'QR no válido'; end if;
  insert into unidad_actividad(unidad_id, actividad_id, completada, fecha, nota, actualizado_at)
  values (v_unidad_id, p_actividad_id, p_completada, current_date, p_nota, now())
  on conflict (unidad_id, actividad_id) do update
    set completada = excluded.completada,
        fecha = current_date,
        nota = coalesce(excluded.nota, unidad_actividad.nota),
        actualizado_at = now();
end; $$;

-- Agrega una actividad nueva al catálogo (o devuelve la existente).
create or replace function public.qr_agregar_actividad(
  p_token uuid, p_nombre text, p_peso numeric default 1)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_unidad_id uuid; v_id uuid;
begin
  select id into v_unidad_id from unidades where qr_token = p_token;
  if v_unidad_id is null then raise exception 'QR no válido'; end if;
  insert into actividades(nombre, peso) values (trim(p_nombre), coalesce(p_peso, 1))
  on conflict (nombre) do update set nombre = excluded.nombre
  returning id into v_id;
  return v_id;
end; $$;

-- Registra material usado en la unidad.
create or replace function public.qr_registrar_material(
  p_token uuid, p_material_id uuid, p_cantidad numeric, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_unidad_id uuid;
begin
  select id into v_unidad_id from unidades where qr_token = p_token;
  if v_unidad_id is null then raise exception 'QR no válido'; end if;
  insert into registro_materiales(unidad_id, material_id, cantidad, nota)
  values (v_unidad_id, p_material_id, p_cantidad, p_nota);
end; $$;

-- Agrega un material nuevo al catálogo (o devuelve el existente).
create or replace function public.qr_agregar_material(
  p_token uuid, p_nombre text, p_unidad_medida text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_unidad_id uuid; v_id uuid;
begin
  select id into v_unidad_id from unidades where qr_token = p_token;
  if v_unidad_id is null then raise exception 'QR no válido'; end if;
  insert into materiales(nombre, unidad_medida) values (trim(p_nombre), p_unidad_medida)
  on conflict (nombre) do update set unidad_medida = coalesce(excluded.unidad_medida, materiales.unidad_medida)
  returning id into v_id;
  return v_id;
end; $$;

-- Permisos de ejecución para el flujo QR
grant execute on function public.qr_unidad(uuid)                         to anon, authenticated;
grant execute on function public.qr_set_actividad(uuid,uuid,boolean,text) to anon, authenticated;
grant execute on function public.qr_agregar_actividad(uuid,text,numeric)  to anon, authenticated;
grant execute on function public.qr_registrar_material(uuid,uuid,numeric,text) to anon, authenticated;
grant execute on function public.qr_agregar_material(uuid,text,text)      to anon, authenticated;

-- =====================================================================
-- 6. TRIGGER: crear perfil al registrarse, con rol elegido + código
-- =====================================================================

-- Config de la app: secretos server-side (sin RLS de acceso a clientes).
create table if not exists public.app_config (
  clave text primary key,
  valor text
);
alter table public.app_config enable row level security;

-- >>> CAMBIA 'OBRA-2026' por tu código secreto de supervisor <<<
insert into public.app_config(clave, valor) values ('codigo_supervisor', 'OBRA-2026')
on conflict (clave) do update set valor = excluded.valor;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 7. DATOS SEMILLA (catálogos por defecto; pesos suman 100)
-- =====================================================================
insert into public.actividades(nombre, peso, orden) values
  ('Cimentación',                 15, 1),
  ('Estructura / obra gruesa',    25, 2),
  ('Instalación eléctrica',       12, 3),
  ('Instalación hidrosanitaria',  12, 4),
  ('Muros y tabiques',            10, 5),
  ('Acabados / pisos',            14, 6),
  ('Pintura',                      8, 7),
  ('Carpintería y detalles',       4, 8)
on conflict (nombre) do nothing;

insert into public.materiales(nombre, unidad_medida) values
  ('Cemento',   'sacos'),
  ('Arena',     'm³'),
  ('Varilla',   'piezas'),
  ('Cable THW', 'm'),
  ('Tubo PVC',  'm'),
  ('Pintura',   'litros')
on conflict (nombre) do nothing;

-- =====================================================================
-- 8. (MANUAL) Asignar el rol de supervisor a tu usuario
--    Primero regístrate en la app con tu correo, LUEGO corre esto una vez
--    cambiando el email por el tuyo:
--
--   update public.perfiles set rol = 'supervisor'
--   where id = (select id from auth.users where email = 'TU-CORREO@ejemplo.com');
-- =====================================================================
