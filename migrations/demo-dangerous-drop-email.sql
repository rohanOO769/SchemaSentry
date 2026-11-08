-- intent: Preserve existing user email addresses for notifications.
-- expected-impact: No existing email data should be lost.
ALTER TABLE users DROP COLUMN email;
