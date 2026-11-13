# S08 — Anomalie de cohérence sur une facture payée (TEST)

Constat en lecture seule le 2026-11-13 sur les deux garages actifs TEST :
- 13 factures examinées; 6 marquées payées; 1 partielle; 5 archivées.
- Une seule facture **payée et archivée** présente un total stocké de **50,00**, un montant payé de **57,49**, soit **7,49** de plus que le total courant.
- Le journal contient deux paiements dont la somme correspond à 57,49.
- Sous-total et sous-total taxable = 50,00; les taxes GST/QST stockées sont nulles, les deux indicateurs d'application sont faux.
- L'écart ressemble numériquement à une somme taxée antérieurement (à vérifier), mais **aucune origine certaine n'a été démontrée**.

Décision de sécurité :
1. **Ne pas corriger automatiquement** le total, l'historique de paiement ou les indicateurs fiscaux d'une facture payée/archivée.
2. Avant toute intervention : comprendre à quelle date les taxes ou montants ont changé, comparer avec la version imprimée et l'historique du client.
3. Réserver une correction ciblée du code si une facture payée peut être modifiée après verrouillage; préserver les données et tracer la correction.
4. L'audit des montants se fait sur TEST uniquement; cette observation ne prouve pas l'existence du même problème en production.

Contrôle SQL effectué uniquement en lecture, sans exposer de coordonnées clients ou numéro de facture dans les résultats enregistrés.
