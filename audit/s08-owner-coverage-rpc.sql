-- S08 / TEST uniquement. Migration à réviser avant exécution.
-- RPC de comptage seulement : n'expose aucune note privée, aucun token, aucun contenu.
-- Nécessaire car RLS masque au propriétaire les lignes privées d'autres membres.
begin;
create or replace function public.backup_garage_operational_coverage(p_garage_id uuid)
returns table(table_name text,total_rows bigint,owner_rows bigint,other_rows bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
 if caller is null or p_garage_id is null or not exists (
  select 1 from public.garage_members gm
  where gm.garage_id=p_garage_id and gm.user_id=caller and gm.role='owner'
 ) then
  raise exception 'Accès refusé' using errcode='42501';
 end if;
 return query
 select 'garage_timer_sessions'::text,count(*)::bigint,
        count(*) filter(where t.user_id=caller)::bigint,
        count(*) filter(where t.user_id<>caller)::bigint
 from public.garage_timer_sessions t where t.garage_id=p_garage_id
 union all
 select 'garage_calendar_notes'::text,count(*)::bigint,
        count(*) filter(where t.user_id=caller)::bigint,
        count(*) filter(where t.user_id<>caller)::bigint
 from public.garage_calendar_notes t where t.garage_id=p_garage_id
 union all
 select 'garage_schedule_events'::text,count(*)::bigint,
        count(*) filter(where t.user_id=caller)::bigint,
        count(*) filter(where t.user_id<>caller)::bigint
 from public.garage_schedule_events t where t.garage_id=p_garage_id;
end;
$$;
revoke all on function public.backup_garage_operational_coverage(uuid) from public,anon;
grant execute on function public.backup_garage_operational_coverage(uuid) to authenticated;
commit;
-- Ne jamais déduire qu'un backup est complet de ces seuls compteurs.
-- Ne jamais sauvegarder les notes privées d'autrui sans décision explicite.
