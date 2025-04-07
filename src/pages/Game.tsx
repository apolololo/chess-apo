import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

interface GameState {
  players: string[];
  currentTurn: 'white' | 'black';
  pgn: string;
}

const Game = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(new Chess());
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId] = useState(() => crypto.randomUUID());
  const [isWaiting, setIsWaiting] = useState(true);
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);

  useEffect(() => {
    if (!id) {
      navigate('/');
      return;
    }

    const channel = supabase.channel(`game:${id}`)
      .on('broadcast', { event: 'game_state' }, ({ payload }) => {
        setGameState(payload);
        if (payload.pgn) {
          const newGame = new Chess();
          newGame.loadPgn(payload.pgn);
          setGame(newGame);
        }
        setIsWaiting(payload.players.length < 2);
      })
      .subscribe();

    // Join game
    channel.send({
      type: 'broadcast',
      event: 'player_join',
      payload: { playerId }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [id, playerId, navigate]);

  useEffect(() => {
    if (gameState?.players.length === 2) {
      const playerIndex = gameState.players.indexOf(playerId);
      if (playerIndex === 0) {
        setPlayerColor('white');
      } else if (playerIndex === 1) {
        setPlayerColor('black');
      }
    }
  }, [gameState?.players, playerId]);

  const makeMove = (move: any) => {
    if (!gameState || isWaiting || !id) return false;
    if (game.turn() === 'w' && playerColor !== 'white') return false;
    if (game.turn() === 'b' && playerColor !== 'black') return false;

    try {
      const newGame = new Chess(game.fen());
      const result = newGame.move(move);
      
      if (result) {
        setGame(newGame);
        const channel = supabase.channel(`game:${id}`);
        channel.send({
          type: 'broadcast',
          event: 'game_state',
          payload: {
            ...gameState,
            currentTurn: game.turn() === 'w' ? 'black' : 'white',
            pgn: newGame.pgn()
          }
        });
        return true;
      }
    } catch (error) {
      return false;
    }
    return false;
  };

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    const move = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q'
    });

    return move;
  };

  const copyGameLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Share this link with your opponent to start the game.",
    });
  };

  if (isWaiting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Waiting for opponent...</h2>
          <p className="text-muted-foreground">Share this link with your opponent to start the game</p>
          <Button onClick={copyGameLink}>Copy Game Link</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-[600px]">
        <div className="mb-4 text-center">
          <h2 className="text-xl font-bold text-foreground">
            {playerColor ? `You are playing as ${playerColor}` : 'Spectating'}
          </h2>
          <p className="text-muted-foreground">
            {game.turn() === 'w' ? "White's turn" : "Black's turn"}
          </p>
        </div>
        <Chessboard 
          position={game.fen()}
          onPieceDrop={onDrop}
          orientation={playerColor || 'white'}
        />
      </div>
    </div>
  );
};

export default Game;