-- S08 : verification READ ONLY des BT en cours avant activation atomique.
-- Execute sur Supabase TEST uniquement. Aucune commande d'ecriture.
-- Les BT doivent avoir des lignes JSON correctes, un client/vehicule unique,
-- une version cloud, et aucune facture deja associee.
WITH active_wo AS (
  SELECT g.garage_id,g.version,g.data,w.value AS wo
  FROM public.garage_data g
  CROSS JOIN LATERAL jsonb_array_elements(g.data->'workorders') w(value)
  WHERE w.value->>'status'='en_cours'
), checks AS (
  SELECT a.wo->>'number' bt,a.version,
    (SELECT count(*) FROM jsonb_array_elements(a.data->'workorders') w(value)
     WHERE w.value->>'number'=a.wo->>'number') bt_number_count,
    (SELECT count(*) FROM jsonb_array_elements(a.data->'clients') c(value)
     WHERE c.value->>'id'=a.wo->>'clientId') client_count,
    (SELECT count(*) FROM jsonb_array_elements(a.data->'clients') c(value)
     CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(c.value->'vehicles')='array'
         THEN c.value->'vehicles' ELSE '[]'::jsonb END) v(value)
     WHERE c.value->>'id'=a.wo->>'clientId'
       AND v.value->>'id'=a.wo->>'vehicleId') vehicle_count,
    (SELECT count(*) FROM jsonb_array_elements(a.data->'invoices') i(value)
     WHERE i.value->>'workOrderNumber'=a.wo->>'number'
       OR i.value->>'number'='FA'||substring(a.wo->>'number' FROM 3)) existing_invoices,
    jsonb_typeof(a.wo->'parts')='array' parts_ok,
    jsonb_typeof(a.wo->'labor')='array' labor_ok,
    coalesce(a.data->'settings'->>'gst','') ~ '^[0-9]+([.][0-9]+)?$' gst_ok,
    coalesce(a.data->'settings'->>'qst','') ~ '^[0-9]+([.][0-9]+)?$' qst_ok,
    a.wo->>'vehicleKm' bt_km
  FROM active_wo a
)
SELECT bt,version,
       bt_number_count=1 AS unique_bt,
       client_count=1 AS client_found,
       vehicle_count=1 AS vehicle_found,
       existing_invoices=0 AS no_invoice,
       parts_ok,labor_ok,gst_ok,qst_ok,bt_km,
       (bt_number_count=1 AND client_count=1 AND vehicle_count=1
       AND existing_invoices=0 AND parts_ok AND labor_ok AND gst_ok AND qst_ok)
        AS structure_ready
FROM checks ORDER BY bt;
