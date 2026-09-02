ALTER TABLE connectors DROP CONSTRAINT connectors_vendor_type_check;
ALTER TABLE connectors ADD CONSTRAINT connectors_vendor_type_check
  CHECK (vendor_type IN ('WENDEWARE', 'OPEN_METEO'));
