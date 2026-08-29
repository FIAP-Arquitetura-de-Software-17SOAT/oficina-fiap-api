DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "part"
    WHERE btrim("code") !~ '^[A-Za-z0-9._-]+$'
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce part code format: fix invalid part.code values before migrating';
  END IF;
END $$;

ALTER TABLE "part"
  ADD CONSTRAINT "part_code_format_check"
  CHECK (btrim("code") ~ '^[A-Za-z0-9._-]+$');
