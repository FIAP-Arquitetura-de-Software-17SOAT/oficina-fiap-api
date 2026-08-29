-- O VO `PartCode` ja normaliza e valida o codigo da peca, mas ele so protege o
-- que entra pela aplicacao. Seed, carga manual e correcao direta em producao
-- passam por fora, e um codigo invalido gravado ali quebra a leitura: o mapper
-- reconstroi o VO e estoura DomainException num GET que deveria ser trivial.
-- O check fecha essa porta no banco. Aceita minuscula de proposito - o VO faz
-- upper case na entrada, entao restringir aqui so recusaria dado ja gravado.
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
