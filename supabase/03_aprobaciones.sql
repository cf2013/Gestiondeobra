-- =====================================================================
-- 03 · Flujo de APROBACIÓN de avances del ejecutor
-- El ejecutor PROPONE (queda pendiente); el supervisor APRUEBA.
-- Solo lo aprobado entra a las tablas "verdad" (unidad_actividad,
-- registro_materiales) y por tanto afecta el avance y la vista del
-- propietario. Ejecutar en SQL Editor después de schema.sql. Idempotente.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tablas de propuestas ----------
create table if not exists public.avance_propuestas (
  id           uuid primary key default gen_random_uuid(),
  unidad_id    uuid not null references public.unidades(id) on delete cascade,
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  completada   boolean not null,
  nota         text,
  estado       text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  creado_at    timestamptz not null default now(),
  revisado_at  timestamptz,
  revisado_por uuid references auth.users(id)
);
-- Una sola propuesta PENDIENTE por (unidad, actividad)
create unique index if not exists avance_prop_pend_uniq
  on public.avance_propuestas(unidad_id, actividad_id) where estado = 'pendiente';

create table if not exists public.material_propuestas (
  id           uuid primary key default gen_random_uuid(),
  unidad_id    uuid not null references public.unidades(id) on delete cascade,
  material_id  uuid not null references public.materiales(id) on delete cascade,
  cantidad     numeric not null check (cantidad > 0),
  nota         text,
  estado       text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  creado_at    timestamptz not null default now(),
  revisado_at  timestamptz,
  revisado_por uuid references auth.users(id)
);

-- ---------- RLS: solo el supervisor gestiona las propuestas ----------
alter table public.avance_propuestas   enable row level security;
alter table public.material_propuestas enable row level security;

drop policy if exists avance_prop_sup on public.avance_propuestas;
create policy avance_prop_sup on public.avance_propuestas
  for all to authenticated using (public.es_supervisor()) with check (public.es_supervisor());

drop policy if exists material_prop_sup on public.material_propuestas;
create policy material_prop_sup on public.material_propuestas
  for all to authenticated using (public.es_supervisor()) with check (public.es_supervisor());

-- =====================================================================
-- RPC del ejecutor (QR) — ahora escriben PROPUESTAS, no la verdad
-- =====================================================================

-- Info del depto para la pantalla del ejecutor (con estado pendiente/aprobado)
create or replace function public.qr_unidad(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_unidad_id uuid; v json;
begin
  select id into v_unidad_id from unidades where qr_token = p_token;
  if v_unidad_id is null then raise exception 'QR no válido'; end if;

  select json_build_object(
    'unidad', (select row_to_json(x) from
      (select id, etiqueta, numero_piso, numero_en_piso, nombre from unidades where id = v_unidad_id) x),
    'actividades', (
      select coalesce(json_agg(json_build_object(
        'id', t.id, 'nombre', t.nombre, 'peso', t.peso,
        'aprobada', t.aprobada,
        'pendiente', t.pendiente,
        'completada', t.completada   -- valor efectivo a mostrar
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

-- Marcar/desmarcar actividad -> propuesta pendiente (upsert de la pendiente)
create or replace function public.qr_set_actividad(
  p_token uuid, p_actividad_id uuid, p_completada boolean, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_unidad_id uuid;
begin
  select id into v_unidad_id from unidades where qr_token = p_token;
  if v_unidad_id is null then raise exception 'QR no válido'; end if;
  insert into avance_propuestas(unidad_id, actividad_id, completada, nota, estado, creado_at)
  values (v_unidad_id, p_actividad_id, p_completada, p_nota, 'pendiente', now())
  on conflict (unidad_id, actividad_id) where (estado = 'pendiente')
  do update set completada = excluded.completada,
                nota = coalesce(excluded.nota, avance_propuestas.nota),
                creado_at = now();
end; $$;

-- Registrar material usado -> propuesta pendiente
create or replace function public.qr_registrar_material(
  p_token uuid, p_material_id uuid, p_cantidad numeric, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_unidad_id uuid;
begin
  select id into v_unidad_id from unidades where qr_token = p_token;
  if v_unidad_id is null then raise exception 'QR no válido'; end if;
  insert into material_propuestas(unidad_id, material_id, cantidad, nota)
  values (v_unidad_id, p_material_id, p_cantidad, p_nota);
end; $$;

-- El ejecutor ya NO agrega al catálogo: quitamos esas funciones.
revoke execute on function public.qr_agregar_actividad(uuid,text,numeric) from anon, authenticated;
revoke execute on function public.qr_agregar_material(uuid,text,text)     from anon, authenticated;
drop function if exists public.qr_agregar_actividad(uuid,text,numeric);
drop function if exists public.qr_agregar_material(uuid,text,text);

-- =====================================================================
-- RPC del supervisor — aprobar / rechazar
-- =====================================================================
create or replace function public.aprobar_avance(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.es_supervisor() then raise exception 'No autorizado'; end if;
  select * into r from avance_propuestas where id = p_id and estado = 'pendiente';
  if not found then return; end if;
  insert into unidad_actividad(unidad_id, actividad_id, completada, fecha, nota, actualizado_at)
  values (r.unidad_id, r.actividad_id, r.completada, current_date, r.nota, now())
  on conflict (unidad_id, actividad_id) do update
    set completada = excluded.completada, fecha = current_date,
        nota = coalesce(excluded.nota, unidad_actividad.nota), actualizado_at = now();
  update avance_propuestas set estado='aprobada', revisado_at=now(), revisado_por=auth.uid() where id = p_id;
end; $$;

create or replace function public.rechazar_avance(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_supervisor() then raise exception 'No autorizado'; end if;
  update avance_propuestas set estado='rechazada', revisado_at=now(), revisado_por=auth.uid()
  where id = p_id and estado = 'pendiente';
end; $$;

create or replace function public.aprobar_material(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.es_supervisor() then raise exception 'No autorizado'; end if;
  select * into r from material_propuestas where id = p_id and estado = 'pendiente';
  if not found then return; end if;
  insert into registro_materiales(unidad_id, material_id, cantidad, nota)
  values (r.unidad_id, r.material_id, r.cantidad, r.nota);
  update material_propuestas set estado='aprobada', revisado_at=now(), revisado_por=auth.uid() where id = p_id;
end; $$;

create or replace function public.rechazar_material(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_supervisor() then raise exception 'No autorizado'; end if;
  update material_propuestas set estado='rechazada', revisado_at=now(), revisado_por=auth.uid()
  where id = p_id and estado = 'pendiente';
end; $$;

grant execute on function public.aprobar_avance(uuid)   to authenticated;
grant execute on function public.rechazar_avance(uuid)  to authenticated;
grant execute on function public.aprobar_material(uuid) to authenticated;
grant execute on function public.rechazar_material(uuid) to authenticated;
