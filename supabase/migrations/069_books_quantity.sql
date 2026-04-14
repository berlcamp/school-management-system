-- Add quantity column to sms_books to track total stock per book
-- Quantity represents how many copies the school has in total
-- Available to allocate = quantity - sum(allocations for current school year)

ALTER TABLE procurements.sms_books
ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 0;
