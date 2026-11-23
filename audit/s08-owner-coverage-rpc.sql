-- S08 : lecture administrative TEST uniquement (NE PAS déployer comme RPC publique).
-- La version antérieure proposait SECURITY DEFINER dans public :
-- retirée avant déploiement afin de ne pas créer de point d'accès privilégié.
-- À exécuter seulement depuis SQL Editor avec autorisation administrative.
-- Le résultat contient uniquement des compteurs, jamais le contenu privé.
select g.id as garage_id, x.table_name, x.total_rows, x.owner_rows,
       x.total_rows-x.owner_rows as other_rows
from public.garages g
cross join lateral (
 select 'garage_timer_sessions'::text as table_name,count(*)::bigint total_rows,
        count(*) filter(where exists(
          select 1 from public.garage_members m
          where m.garage_id=g.id and m.user_id=t.user_id and m.role='owner'
        ))::bigint owner_rows
 from public.garage_timer_sessions t where t.garage_id=g.id
 union all
 select 'garage_calendar_notes',count(*)::bigint,
        count(*) filter(where exists(
          select 1 from public.garage_members m
          where m.garage_id=g.id and m.user_id=t.user_id and m.role='owner'
        ))::bigint
 from public.garage_calendar_notes t where t.garage_id=g.id
 union all
 select 'garage_schedule_events',count(*)::bigint,
        count(*) filter(where exists(
          select 1 from public.garage_members m
          where m.garage_id=g.id and m.user_id=t.user_id and m.role='owner'
        ))::bigint
 from public.garage_schedule_events t where t.garage_id=g.id
) x
order by g.id,x.table_name;
-- Aucune fonction créée, aucune permission modifiée.
