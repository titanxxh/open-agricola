ALTER TABLE rooms ADD COLUMN enable_moor_balance_rules BIGINT NOT NULL DEFAULT 0
  CHECK (enable_moor_balance_rules IN (0, 1) AND (enable_moor_balance_rules = 0 OR enable_farmers_of_the_moor = 1));
ALTER TABLE game_results ADD COLUMN enable_moor_balance_rules BIGINT NOT NULL DEFAULT 0
  CHECK (enable_moor_balance_rules IN (0, 1) AND (enable_moor_balance_rules = 0 OR enable_farmers_of_the_moor = 1));
