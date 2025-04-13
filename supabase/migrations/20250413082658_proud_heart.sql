/*
  # Add score columns to games table

  1. Changes
    - Add score columns to track wins/losses/draws
    - Add rematch_requested column
    - Add rematch_accepted column
*/

ALTER TABLE games
ADD COLUMN IF NOT EXISTS white_score integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS black_score integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS draws integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS rematch_requested text,
ADD COLUMN IF NOT EXISTS rematch_accepted boolean DEFAULT false;