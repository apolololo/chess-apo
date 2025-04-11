/*
  # Add player columns to games table

  1. Changes
    - Add white_player column to store the ID of the white player
    - Add black_player column to store the ID of the black player
*/

ALTER TABLE games
ADD COLUMN IF NOT EXISTS white_player text,
ADD COLUMN IF NOT EXISTS black_player text;