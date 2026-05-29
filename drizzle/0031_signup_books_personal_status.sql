-- Add personal_status to signup_books so users can track their reading progress.
-- Values: 'reading' (actively reading), 'read' (finished).
-- NULL means "signed up but no personal status" — this is the normal state for matching candidates.
ALTER TABLE signup_books
  ADD COLUMN personal_status TEXT CHECK(personal_status IN ('reading', 'read'));
