-- S08 TEST — contrôle lecture seule avant sauvegarde physique.
-- Exécuter avec rôle administrateur dans le projet TEST uniquement.
-- Aucun contenu privé n'est retourné : comptages par garage et par table.
-- owner_rows = total_rows requis pour que l'export propriétaire actuel
-- puisse couvrir les données opérationnelles sans accès aux données privées d'autrui.
WITH operational AS (
 SELECT garage_id,user_id,'garage_timer_sessions'::text AS source FROM public.garage_timer_sessions
 UNION ALL SELECT garage_id,user_id,'garage_calendar_notes' FROM public.garage_calendar_notes
 UNION ALL SELECT garage_id,user_id,'garage_schedule_events' FROM public.garage_schedule_events
), sources AS (
 SELECT unnest(ARRAY['garage_timer_sessions','garage_calendar_notes','garage_schedule_events']) AS source
)
SELECT g.id AS garage_id, s.source,
 count(o.user_id) AS total_rows,
 count(o.user_id) FILTER (
  WHERE EXISTS (SELECT 1 FROM public.garage_members m
   WHERE m.garage_id=g.id AND m.user_id=o.user_id AND m.role='owner')
 ) AS owner_rows,
 count(o.user_id) FILTER (
  WHERE NOT EXISTS (SELECT 1 FROM public.garage_members m
   WHERE m.garage_id=g.id AND m.user_id=o.user_id AND m.role='owner')
 ) AS other_member_rows
FROM public.garages g
CROSS JOIN sources s
LEFT JOIN operational o ON o.garage_id=g.id AND o.source=s.source
GROUP BY g.id,s.source
ORDER BY g.id,s.source;
