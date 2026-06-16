-- Run once on first start (when the data volume is empty).
-- POSTGRES_DB already creates the database; this script handles extensions.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
