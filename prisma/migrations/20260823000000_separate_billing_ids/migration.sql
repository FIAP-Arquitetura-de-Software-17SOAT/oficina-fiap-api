BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

UPDATE "billing"
SET "id" = gen_random_uuid()
WHERE "id" = "serviceOrderId";

COMMIT;
