/*
  # Add timer columns to games table

  1. Changes
    - Add white_time column for white player's remaining time in seconds
    - Add black_time column for black player's remaining time in seconds
    - Add started_at column to track when the game actually starts
*/

ALTER TABLE games
ADD COLUMN IF NOT EXISTS white_time integer DEFAULT 600,
ADD COLUMN IF NOT EXISTS black_time integer DEFAULT 600,
ADD COLUMN IF NOT EXISTS started_at timestamptz;