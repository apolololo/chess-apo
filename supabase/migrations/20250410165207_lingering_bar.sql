/*
  # Create games table for chess matches

  1. New Tables
    - `games`
      - `id` (text, primary key) - Game ID
      - `players` (text array) - Array of player IDs
      - `current_turn` (text) - Current player's turn ('white' or 'black')
      - `pgn` (text) - Current game state in PGN format
      - `time_control` (integer) - Time control in minutes
      - `increment` (integer) - Time increment in seconds
      - `pending_draw_offer` (text) - ID of player who offered draw
      - `pending_takeback_request` (text) - ID of player who requested takeback
      - `game_result` (text) - Game result ('1-0', '0-1', '½-½')
      - `moves` (text array) - Array of moves in the game
      - `creator` (text) - ID of player who created the game
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS
    - Add policies for read and write access
*/

CREATE TABLE IF NOT EXISTS games (
  id text PRIMARY KEY,
  players text[] DEFAULT '{}',
  current_turn text DEFAULT 'white',
  pgn text DEFAULT '',
  time_control integer DEFAULT 10,
  increment integer DEFAULT 5,
  pending_draw_offer text,
  pending_takeback_request text,
  game_result text,
  moves text[] DEFAULT '{}',
  creator text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read games
CREATE POLICY "Anyone can read games"
ON games FOR SELECT
TO anon
USING (true);

-- Allow anyone to insert games
CREATE POLICY "Anyone can create games"
ON games FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anyone to update games
CREATE POLICY "Anyone can update games"
ON games FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();