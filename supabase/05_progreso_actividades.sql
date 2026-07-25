-- =====================================================================
-- 05 · Avance PARCIAL por actividad (slider 0–100 %)
--
-- Antes: unidad_actividad.completada (booleano hecho/no hecho).
-- Ahora: se agrega `progreso` (0..100). El avance de la unidad pasa a ser
--        ponderado por progreso parcial:
--            avance = Σ(peso_i · progreso_i) / Σ(peso)  (en %).
-- `completada` se conserva (= progreso >= 100) para el flujo del ejecutor
-- (que sigue proponiendo hecho/no hecho) y compatibilidad.
--
-- Ejecutar en SQL Editor DESPUÉS de 01/02/03/04. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columna progreso + backfill desde completada
-- ---------------------------------------------------------------------
alter table public.unidad_actividad
  add column if not exists progreso int not null default 0 check (progreso between 0 and 100);

update public.unidad_actividad set progreso = 100 where completada and progreso = 0;

-- ---------------------------------------------------------------------
-- 2. Vista de avance ponderada por progreso parcial
-- ---------------------------------------------------------------------
create or replace view public.unidad_avance as
select
  u.id             as unidad_id,
  u.etiqueta,
  u.numero_piso,
  u.numero_en_piso,
  coalesce(
    round(
      coalesce(sum(a.peso * coalesce(ua.progreso, 0)), 0)
      / nullif((select sum(peso) from public.actividades), 0)
    ), 0
  )::int as avance
from public.unidades u
left join public.unidad_actividad ua on ua.unidad_id = u.id
left join public.actividades a on a.id = ua.actividad_id
group by u.id;

alter view public.unidad_avance set (security_invoker = on);

-- ---------------------------------------------------------------------
-- 3. Al aprobar un avance del ejecutor, fijar también progreso (0/100)
-- ---------------------------------------------------------------------
create or replace function public.aprobar_avance(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.es_supervisor() then raise exception 'No autorizado'; end if;
  select * into r from avance_propuestas where id = p_id and estado = 'pendiente';
  if not found then return; end if;
  insert into unidad_actividad(unidad_id, actividad_id, completada, progreso, fecha, nota, actualizado_at)
  values (r.unidad_id, r.actividad_id, r.completada, case when r.completada then 100 else 0 end,
          current_date, r.nota, now())
  on conflict (unidad_id, actividad_id) do update
    set completada = excluded.completada,
        progreso   = excluded.progreso,
        fecha      = current_date,
        nota       = coalesce(excluded.nota, unidad_actividad.nota),
        actualizado_at = now();
  update avance_propuestas set estado='aprobada', revisado_at=now(), revisado_por=auth.uid() where id = p_id;
end; $$;

-- ---------------------------------------------------------------------
-- 4. qr_unidad: devolver el avance oficial (parcial) para el ejecutor
--    (se re-crea completa; añade el campo 'avance').
-- ---------------------------------------------------------------------
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
    'avance', (
      select coalesce(round(
        coalesce(sum(a.peso * coalesce(ua.progreso, 0)), 0)
        / nullif((select sum(peso) from actividades), 0)), 0)::int
      from actividades a
      left join unidad_actividad ua on ua.actividad_id = a.id and ua.unidad_id = v_unidad_id
    ),
    'actividades', (
      select coalesce(json_agg(json_build_object(
        'id', t.id, 'nombre', t.nombre, 'peso', t.peso,
        'aprobada', t.aprobada,
        'progreso', t.progreso,
        'pendiente', t.pendiente,
        'completada', t.completada
      ) order by t.orden, t.nombre), '[]'::json)
      from (
        select a.id, a.nombre, a.peso, a.orden,
          coalesce(ua.completada, false) as aprobada,
          coalesce(ua.progreso, 0)       as progreso,
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
