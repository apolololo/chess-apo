import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GameState {
  players: string[];
  currentTurn: 'white' | 'black';
  pgn: string;
  timeControl: number;
  increment: number;
  pendingDrawOffer?: string;
  pendingTakebackRequest?: string;
  gameResult?: string;
  moves: string[];
}

interface GameSettings {
  timeControl: number;
  increment: number;
}

const Game = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(new Chess());
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId] = useState(() => crypto.randomUUID());
  const [isWaiting, setIsWaiting] = useState(true);
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
  const [settings, setSettings] = useState<GameSettings>({
    timeControl: 10,
    increment: 5,
  });
  const [showSettings, setShowSettings] = useState(true);

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
        // Only show settings for the game creator
        if (payload.players.length === 1 && payload.players[0] === playerId) {
          setShowSettings(true);
        } else {
          setShowSettings(false);
        }
        setIsWaiting(payload.players.length < 2);
      })
      .subscribe();

    // Send initial state when creating the game
    const initialState = {
      players: [playerId],
      currentTurn: 'white',
      pgn: '',
      timeControl: settings.timeControl,
      increment: settings.increment,
      moves: [],
    };

    channel.send({
      type: 'broadcast',
      event: 'game_state',
      payload: initialState
    });

    return () => {
      channel.unsubscribe();
    };
  }, [id, playerId, navigate, settings]);

  useEffect(() => {
    if (gameState?.players.length === 2) {
      const playerIndex = gameState.players.indexOf(playerId);
      if (playerIndex === 0) {
        setPlayerColor('white');
      } else if (playerIndex === 1) {
        setPlayerColor('black');
      }
      setShowSettings(false);
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
            pgn: newGame.pgn(),
            moves: [...(gameState.moves || []), `${game.turn() === 'w' ? 'White' : 'Black'}: ${move.from}${move.to}`]
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
    const url = `${window.location.origin}/game/${id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Share this link with your opponent to start the game.",
    });
  };

  const offerDraw = () => {
    if (!id || !playerColor) return;
    const channel = supabase.channel(`game:${id}`);
    channel.send({
      type: 'broadcast',
      event: 'game_state',
      payload: {
        ...gameState,
        pendingDrawOffer: playerId
      }
    });
    toast({
      title: "Draw offered",
      description: "Waiting for opponent's response..."
    });
  };

  const respondToDrawOffer = (accept: boolean) => {
    if (!id || !gameState?.pendingDrawOffer) return;
    const channel = supabase.channel(`game:${id}`);
    if (accept) {
      channel.send({
        type: 'broadcast',
        event: 'game_state',
        payload: {
          ...gameState,
          pendingDrawOffer: null,
          gameResult: '½-½'
        }
      });
      toast({
        title: "Game drawn by agreement",
      });
    } else {
      channel.send({
        type: 'broadcast',
        event: 'game_state',
        payload: {
          ...gameState,
          pendingDrawOffer: null
        }
      });
      toast({
        title: "Draw offer declined",
      });
    }
  };

  const resign = () => {
    if (!id || !playerColor) return;
    const channel = supabase.channel(`game:${id}`);
    channel.send({
      type: 'broadcast',
      event: 'game_state',
      payload: {
        ...gameState,
        gameResult: playerColor === 'white' ? '0-1' : '1-0'
      }
    });
    toast({
      title: `${playerColor === 'white' ? 'Black' : 'White'} wins by resignation`,
    });
  };

  const requestTakeback = () => {
    if (!id || !playerColor) return;
    const channel = supabase.channel(`game:${id}`);
    channel.send({
      type: 'broadcast',
      event: 'game_state',
      payload: {
        ...gameState,
        pendingTakebackRequest: playerId
      }
    });
    toast({
      title: "Takeback requested",
      description: "Waiting for opponent's response..."
    });
  };

  const respondToTakeback = (accept: boolean) => {
    if (!id || !gameState?.pendingTakebackRequest) return;
    const channel = supabase.channel(`game:${id}`);
    if (accept) {
      const newGame = new Chess();
      const moves = game.history();
      moves.pop();
      moves.forEach(move => newGame.move(move));
      
      channel.send({
        type: 'broadcast',
        event: 'game_state',
        payload: {
          ...gameState,
          pendingTakebackRequest: null,
          pgn: newGame.pgn(),
          moves: gameState.moves.slice(0, -1)
        }
      });
      setGame(newGame);
      toast({
        title: "Takeback accepted",
      });
    } else {
      channel.send({
        type: 'broadcast',
        event: 'game_state',
        payload: {
          ...gameState,
          pendingTakebackRequest: null
        }
      });
      toast({
        title: "Takeback declined",
      });
    }
  };

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">Loading game...</h2>
        </div>
      </div>
    );
  }

  if (isWaiting && showSettings && gameState.players[0] === playerId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="w-full max-w-md p-6 bg-card rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-center mb-6">Game Settings</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Time Control (minutes)</label>
              <Select
                value={settings.timeControl.toString()}
                onValueChange={(value) => setSettings(prev => ({ ...prev, timeControl: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Increment (seconds)</label>
              <Select
                value={settings.increment.toString()}
                onValueChange={(value) => setSettings(prev => ({ ...prev, increment: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between pt-4">
              <Button onClick={() => setShowSettings(false)}>
                Continue
              </Button>
              <Button onClick={copyGameLink} variant="outline">
                Copy Game Link
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

  const isGameOver = gameState?.gameResult || game.isGameOver();
  const canOfferDraw = !isGameOver && !gameState?.pendingDrawOffer;
  const canRequestTakeback = !isGameOver && !gameState?.pendingTakebackRequest && gameState?.moves?.length > 0;
  const hasDrawOffer = gameState?.pendingDrawOffer && gameState.pendingDrawOffer !== playerId;
  const hasTakebackRequest = gameState?.pendingTakebackRequest && gameState.pendingTakebackRequest !== playerId;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-[800px] space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {playerColor ? `You are playing as ${playerColor}` : 'Spectating'}
            </h2>
            <p className="text-muted-foreground">
              {isGameOver ? (
                `Game Over - ${gameState?.gameResult || game.isCheckmate() ? 
                  (game.turn() === 'w' ? 'Black wins' : 'White wins') : 
                  'Draw'}`
              ) : (
                `${game.turn() === 'w' ? "White's" : "Black's"} turn`
              )}
            </p>
          </div>
          <div className="space-x-2">
            {!isGameOver && playerColor && (
              <>
                <Button 
                  onClick={offerDraw} 
                  variant="outline"
                  disabled={!canOfferDraw}
                >
                  Offer Draw
                </Button>
                <Button 
                  onClick={requestTakeback} 
                  variant="outline"
                  disabled={!canRequestTakeback}
                >
                  Request Takeback
                </Button>
                <Button 
                  onClick={resign} 
                  variant="destructive"
                >
                  Resign
                </Button>
              </>
            )}
          </div>
        </div>

        {(hasDrawOffer || hasTakebackRequest) && (
          <div className="bg-muted p-4 rounded-lg">
            <p className="font-medium">
              {hasDrawOffer ? 'Your opponent offers a draw' : 'Your opponent requests a takeback'}
            </p>
            <div className="mt-2 space-x-2">
              <Button 
                onClick={() => hasDrawOffer ? respondToDrawOffer(true) : respondToTakeback(true)}
                variant="outline"
              >
                Accept
              </Button>
              <Button 
                onClick={() => hasDrawOffer ? respondToDrawOffer(false) : respondToTakeback(false)}
                variant="outline"
              >
                Decline
              </Button>
            </div>
          </div>
        )}

        <Chessboard 
          position={game.fen()}
          onPieceDrop={onDrop}
          orientation={playerColor || 'white'}
        />

        {gameState?.moves && (
          <div className="mt-4 p-4 bg-card rounded-lg">
            <h3 className="font-medium mb-2">Move History</h3>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {gameState.moves.map((move, index) => (
                <div key={index} className="text-sm">
                  {move}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Game;