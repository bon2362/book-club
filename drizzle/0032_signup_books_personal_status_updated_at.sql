-- Track when personal_status was last changed, used to sort the "читаю" / "прочитал:а"
-- sections in the user profile (desc by change time). NULL for existing rows is intentional:
-- they will sort to the bottom until the user touches the status.
ALTER TABLE signup_books
  ADD COLUMN personal_status_updated_at TIMESTAMPTZ;
