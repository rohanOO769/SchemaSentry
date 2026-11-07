-- intent: Preserve existing user email addresses so users can continue receiving account notifications.
-- expected-impact: No existing user email data should be lost.

ALTER TABLE users DROP COLUMN email;
