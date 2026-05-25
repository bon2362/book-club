UPDATE "user"
SET contact_email = lower(contact_email)
WHERE contact_email IS NOT NULL
  AND contact_email != lower(contact_email);

CREATE UNIQUE INDEX user_contact_email_lower_idx
  ON "user" (lower(contact_email))
  WHERE contact_email IS NOT NULL;

UPDATE user_identities
SET email = lower(email)
WHERE email IS NOT NULL
  AND email != lower(email);

CREATE INDEX user_identities_email_lower_idx
  ON user_identities (lower(email))
  WHERE email IS NOT NULL;
