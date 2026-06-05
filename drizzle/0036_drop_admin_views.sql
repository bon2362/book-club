-- Remove the admin_views audit log.
--
-- It only recorded which user an admin viewed via ?as= impersonation, which
-- provided no real value. Dropping the table (indexes and FKs go with it).
DROP TABLE IF EXISTS "admin_views";
