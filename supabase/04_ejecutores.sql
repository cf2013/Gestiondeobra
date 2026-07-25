-- =====================================================================
-- 04 · Cuentas de EJECUTOR + asignación a unidades
--
-- Cambio: el ejecutor ahora necesita CUENTA para registrar avances.
--   * El supervisor crea las cuentas (Edge Function `crear-ejecutor`,
--     usa service_role — ver supabase/functions/crear-ejecutor).
--   * El supervisor ASIGNA ejecutores a unidades (tabla `asignaciones`).
--   * El ejecutor sigue entrando por el QR del depto, pero ahora debe
--     estar logueado y estar asignado a esa unidad para registrar.
--   * La pantalla del QR sigue siendo PÚBLICA para solo-lectura.
--
-- Ejecutar en SQL Editor DESPUÉS de schema.sql, 02 y 03. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El rol 'ejecutor' pasa a ser válido en perfiles + columna email
-- ---------------------------------------------------------------------
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles
  add constraint perfiles_rol_check check (rol in ('supervisor','propietario','ejecutor'));

alter table public.perfiles add column if not exists email text;

-- Backfill del email para perfiles ya existentes
update public.perfiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is null;

-- ---------------------------------------------------------------------
-- 2. Trigger de alta: guardar también el email (rol sigue igual;
--    'ejecutor' NUNCA se auto-asigna por metadata — lo pone la Edge
--    Function con service_role, así nadie se registra como ejecutor).
-- ---------------------------------------------------------------------
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

  insert into public.perfiles(id, nombre, email, rol)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', new.email), new.email, v_rol_final)
  on conflict (id) do nothing;
  return new;
end; $$;

-- ---------------------------------------------------------------------
-- 3. Asignaciones ejecutor -> unidad
-- ---------------------------------------------------------------------
create table if not exists public.asignaciones (
  id          uuid primary key default gen_random_uuid(),
  ejecutor_id uuid not null references public.perfiles(id) on delete cascade,
  unidad_id   uuid not null references public.unidades(id) on delete cascade,
  creado_at   timestamptz not null default now(),
  creado_por  uuid references public.perfiles(id),
  unique (ejecutor_id, unidad_id)
);

alter table public.asignaciones enable row level security;

-- El supervisor gestiona todas las asignaciones
drop policy if exists asignaciones_sup on public.asignaciones;
create policy asignaciones_sup on public.asignaciones
  for all to authenticated
  using (public.es_supervisor()) with check (public.es_supervisor());

-- El ejecutor puede LEER sus propias asignaciones
drop policy if exists asignaciones_own on public.asignaciones;
create policy asignaciones_own on public.asignaciones
  for select to authenticated
  using (ejecutor_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. Helper: ¿el usuario actual está asignado a esta unidad?
-- ---------------------------------------------------------------------
create or replace function public.esta_asignado(p_unidad_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.asignaciones
    where unidad_id = p_unidad_id and ejecutor_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- 5. Atribuir cada propuesta a quién la envió
-- ---------------------------------------------------------------------
alter table public.avance_propuestas
  add column if not exists creado_por uuid references public.perfiles(id);
alter table public.material_propuestas
  add column if not exists creado_por uuid references public.perfiles(id);

-- ---------------------------------------------------------------------
-- 6. QR: lectura pública, pero registrar exige login + asignación
-- ---------------------------------------------------------------------

-- Info del depto (sigue pública). Ahora expone `puede_editar` según el
-- usuario que llama: supervisor o ejecutor asignado -> true; anónimo -> false.
create or replace function public.qr_unidad(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_unidad_id uuid; v json;
begin
  select id into v_unidad_id from unidades where qr_token = p_token;
  if v_unidad_id is null then raise exception 'QR no válido'; end if;

  select json_build_object(
    'unidad', (select row_to_json(x) from
      (select id, etiqueta, numero_piso, numero_en_piso, nombre from unidades where id = v_unidad_id) x),
    'puede_editar', (
      auth.uid() is not null and (public.es_supervisor() or public.esta_asignado(v_unidad_id))
    ),
    'actividades', (
      select coalesce(json_agg(json_build_object(
        'id', t.id, 'nombre', t.nombre, 'peso', t.peso,
        'aprobada', t.aprobada,
        'pendiente', t.pendiente,
        'completada', t.completada
      ) order by t.orden, t.nombre), '[]'::json)
      from (
        select a.id, a.nombre, a.peso, a.orden,
          coalesce(ua.completada, false) as aprobada,
          (ap.id is not null) as pendiente,
          coalesce(ap.completada, coalesce(ua.completada, false)) as completada
        from actividades a
        left join unidad_actividad ua
          on ua.actividad_id = a.id and ua.unidad_id = v_unidad_id
        left join avance_propuestas ap
          on ap.actividad_id = a.id and ap.unidad_id = v_unidad_id and ap.estado = 'pendiente'
      ) t
    ),
    'materiales_catalogo', (
      select coalesce(json_agg(json_build_object(
        'id', id, 'nombre', nombre, 'unidad_medida', unidad_medida) order by nombre), '[]'::json)
      from materiales
    ),
    'materiales_usados', (
      select coalesce(json_agg(json_build_object(
        'id', rm.id, 'material', m.nombre, 'cantidad', rm.cantidad,
        'unidad_medida', m.unidad_medida, 'fecha', rm.fecha, 'pendiente', false
      ) order by rm.fecha desc), '[]'::json)
      from registro_materiales rm join materiales m on m.id = rm.material_id
      where rm.unidad_id = v_unidad_id
    ),
    'materiales_pendientes', (
      select coalesce(json_agg(json_build_object(
        'id', mp.id, 'material', m.nombre, 'cantidad', mp.cantidad,
        'unidad_medida', m.unidad_medida, 'fecha', mp.creado_at::date, 'pendiente', true
      ) order by mp.creado_at desc), '[]'::json)
      from material_propuestas mp join materiales m on m.id = mp.material_id
      where mp.unidad_id = v_unidad_id and mp.estado = 'pendiente'
    )
  ) into v;
  return v;
end; $$;

-- Marcar/desmarcar actividad -> propuesta pendiente.
-- Requiere estar logueado y (ser supervisor o estar asignado a la unidad).
create or replace function public.qr_set_actividad(
  p_token uuid, p_actividad_id uuid, p_completada boolean, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_unidad_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión para registrar'; end if;
  select id into v_unidad_id from unidades where qr_token = p_token;
  if v_unidad_id is null then raise exception 'QR no válido'; end if;
  if not (public.es_supervisor() or public.esta_asignado(v_unidad_id)) then
    raise exception 'No estás asignado a este departamento';
  end if;

  insert into avance_propuestas(unidad_id, actividad_id, completada, nota, estado, creado_at, creado_por)
  values (v_unidad_id, p_actividad_id, p_completada, p_nota, 'pendiente', now(), auth.uid())
  on conflict (unidad_id, actividad_id) where (estado = 'pendiente')
  do update set completada = excluded.completada,
                nota = coalesce(excluded.nota, avance_propuestas.nota),
                creado_at = now(),
                creado_por = auth.uid();
end; $$;

-- Registrar material usado -> propuesta pendiente (mismas reglas).
create or replace function public.qr_registrar_material(
  p_token uuid, p_material_id uuid, p_cantidad numeric, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_unidad_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión para registrar'; end if;
  select id into v_unidad_id from unidades where qr_token = p_token;
  if v_unidad_id is null then raise exception 'QR no válido'; end if;
  if not (public.es_supervisor() or public.esta_asignado(v_unidad_id)) then
    raise exception 'No estás asignado a este departamento';
  end if;

  insert into material_propuestas(unidad_id, material_id, cantidad, nota, creado_por)
  values (v_unidad_id, p_material_id, p_cantidad, p_nota, auth.uid());
end; $$;

-- Permisos: leer QR sigue público; escribir ya NO es para anon.
grant execute on function public.qr_unidad(uuid) to anon, authenticated;
revoke execute on function public.qr_set_actividad(uuid,uuid,boolean,text)     from anon;
revoke execute on function public.qr_registrar_material(uuid,uuid,numeric,text) from anon;
grant  execute on function public.qr_set_actividad(uuid,uuid,boolean,text)     to authenticated;
grant  execute on function public.qr_registrar_material(uuid,uuid,numeric,text) to authenticated;
