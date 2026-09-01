SELECT remove_compression_policy('control_intents', if_exists => true);
SELECT decompress_chunk(c, if_compressed => true) FROM show_chunks('control_intents') AS c;
ALTER TABLE control_intents SET (timescaledb.compress = false);

SELECT remove_compression_policy('measurements', if_exists => true);
SELECT decompress_chunk(c, if_compressed => true) FROM show_chunks('measurements') AS c;
ALTER TABLE measurements SET (timescaledb.compress = false);
