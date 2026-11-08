-- intent: Add an optional deployment note field to user profiles.
-- expected-impact: Add one nullable column without changing existing user records.

-- ALTER TABLE users ADD COLUMN deployment_note TEXT;
