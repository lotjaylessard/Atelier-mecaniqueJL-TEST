-- S10 TEST: préserver fournisseur sur les lignes de pièces lors de la conversion SO -> BT.
-- Ne pas exécuter sur la production avant validation/migration contrôlée.
-- Idempotent : s'il est déjà installé, aucune modification.
DO $patch$
DECLARE definition text;
        updated_definition text;
        anchor text := $needle$else 0 end,
        'rate',unit_cents/100,'total',row_cents/100));$needle$;
        replacement text := $replacement$else 0 end,
        'rate',unit_cents/100,'total',row_cents/100,
        'supplier',case when item->>'type'='part'
           then left(coalesce(item->>'supplier',''),80) else '' end));$replacement$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='s08_convert_quote_to_workorder';
  IF definition IS NULL THEN
    RAISE EXCEPTION 'RPC de conversion introuvable';
  END IF;
  IF position($already$'supplier',case when item->>'type'='part'$already$ in definition)>0 THEN
    RAISE NOTICE 'Champ fournisseur déjà installé';
    RETURN;
  END IF;
  IF (length(definition)-length(replace(definition,anchor,'')))<>length(anchor) THEN
    RAISE EXCEPTION 'Source RPC inattendue : aucune modification appliquée';
  END IF;
  updated_definition:=replace(definition,anchor,replacement);
  EXECUTE updated_definition;
END $patch$;

-- Vérification non destructive (TEST uniquement) :
-- SELECT position('supplier' in pg_get_functiondef('public.s08_convert_quote_to_workorder(uuid,bigint,bigint,boolean)'::regprocedure))>0;
