import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GameState {
  id: string;
  players: string[];
  current_turn: 'white' | 'black';
  pgn: string;
  time_control: number;
  increment: number;
  pending_draw_offer?: string;
  pending_takeback_request?: string;
  game_result?: string;
  moves: string[];
  creator: string;
}

interface GameSettings {
  time_control: number;
  increment: number;
}

const SITE_URL = 'https://chess-apo.netlify.app';

const Game = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(new Chess());
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId] = useState(() => crypto.randomUUID());
  const [isWaiting, setIsWaiting] = useState(true);
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
  const [settings, setSettings] = useState<GameSettings>({
    time_control: 10,
    increment: 5,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!id) {
      navigate('/');
      return;
    }

    const initializeGameState = async () => {
      try {
        const { data: existingGame, error: fetchError } = await supabase
          .from('games')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (fetchError) {
          throw fetchError;
        }

        const channel = supabase.channel(`game:${id}`, {
          config: {
            broadcast: {
              self: true
            }
          }
        });

        if (!existingGame) {
          const initialState: Omit<GameState, 'id'> = {
            players: [playerId],
            current_turn: 'white',
            pgn: '',
            time_control: settings.time_control,
            increment: settings.increment,
            moves: [],
            creator: playerId
          };

          const { error: insertError } = await supabase
            .from('games')
            .insert([{ id, ...initialState }]);

          if (insertError) {
            throw insertError;
          }

          setGameState({ id, ...initialState });
          setShowSettings(true);
        } else {
          if (existingGame.players.length < 2 && !existingGame.players.includes(playerId)) {
            const updatedPlayers = [...existingGame.players, playerId];
            const { error: updateError } = await supabase
              .from('games')
              .update({ players: updatedPlayers })
              .eq('id', id);

            if (updateError) {
              throw updateError;
            }

            setGameState({ ...existingGame, players: updatedPlayers });
          } else {
            setGameState(existingGame);
          }
        }

        channel
          .on('broadcast', { event: 'game_state' }, ({ payload }) => {
            setGameState(payload);
            if (payload.pgn) {
              const newGame = new Chess();
              try {
                newGame.loadPgn(payload.pgn);
                setGame(newGame);
              } catch (error) {
                console.error('Error loading PGN:', error);
              }
            }
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              const { data } = await supabase
                .from('games')
                .select('*')
                .eq('id', id)
                .maybeSingle();

              if (data) {
                setGameState(data);
                if (data.pgn) {
                  const newGame = new Chess();
                  newGame.loadPgn(data.pgn);
                  setGame(newGame);
                }
              }
            }
          });

        setIsInitialized(true);
      } catch (error) {
        console.error('Error initializing game:', error);
        toast({
          title: "Error",
          description: "Failed to initialize game. Please try again.",
          variant: "destructive"
        });
      }
    };

    initializeGameState();
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
      setIsWaiting(false);
    } else {
      setIsWaiting(true);
    }
  }, [gameState?.players, playerId]);

  const makeMove = async (move: any) => {
    if (!gameState || isWaiting || !id) return false;
    if (game.turn() === 'w' && playerColor !== 'white') return false;
    if (game.turn() === 'b' && playerColor !== 'black') return false;

    try {
      const newGame = new Chess(game.fen());
      const result = newGame.move(move);
      
      if (result) {
        const newState = {
          ...gameState,
          current_turn: game.turn() === 'w' ? 'black' : 'white',
          pgn: newGame.pgn(),
          moves: [...(gameState.moves || []), `${game.turn() === 'w' ? 'White' : 'Black'}: ${move.from}${move.to}`]
        };

        const { error: updateError } = await supabase
          .from('games')
          .update(newState)
          .eq('id', id);

        if (updateError) {
          throw updateError;
        }

        const channel = supabase.channel(`game:${id}`);
        channel.send({
          type: 'broadcast',
          event: 'game_state',
          payload: newState
        });

        setGame(newGame);
        return true;
      }
    } catch (error) {
      console.error('Error making move:', error);
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
    const url = `${SITE_URL}/game/${id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Share this link with your opponent to start the game.",
    });
  };

  const updateGameState = async (newState: Partial<GameState>) => {
    if (!id || !gameState) return;

    try {
      const { error: updateError } = await supabase
        .from('games')
        .update(newState)
        .eq('id', id);

      if (updateError) {
        throw updateError;
      }

      const channel = supabase.channel(`game:${id}`);
      channel.send({
        type: 'broadcast',
        event: 'game_state',
        payload: { ...gameState, ...newState }
      });
    } catch (error) {
      console.error('Error updating game state:', error);
      toast({
        title: "Error",
        description: "Failed to update game state. Please try again.",
        variant: "destructive"
      });
    }
  };

  const offerDraw = () => {
    if (!id || !playerColor) return;
    updateGameState({ pending_draw_offer: playerId });
    toast({
      title: "Draw offered",
      description: "Waiting for opponent's response..."
    });
  };

  const respondToDrawOffer = (accept: boolean) => {
    if (!id || !gameState?.pending_draw_offer) return;
    if (accept) {
      updateGameState({
        pending_draw_offer: null,
        game_result: '½-½'
      });
      toast({
        title: "Game drawn by agreement",
      });
    } else {
      updateGameState({ pending_draw_offer: null });
      toast({
        title: "Draw offer declined",
      });
    }
  };

  const resign = () => {
    if (!id || !playerColor) return;
    updateGameState({
      game_result: playerColor === 'white' ? '0-1' : '1-0'
    });
    toast({
      title: `${playerColor === 'white' ? 'Black' : 'White'} wins by resignation`,
    });
  };

  const requestTakeback = () => {
    if (!id || !playerColor) return;
    updateGameState({ pending_takeback_request: playerId });
    toast({
      title: "Takeback requested",
      description: "Waiting for opponent's response..."
    });
  };

  const respondToTakeback = (accept: boolean) => {
    if (!id || !gameState?.pending_takeback_request) return;
    if (accept) {
      const newGame = new Chess();
      const moves = game.history();
      moves.pop();
      moves.forEach(move => newGame.move(move));
      
      updateGameState({
        pending_takeback_request: null,
        pgn: newGame.pgn(),
        moves: gameState.moves.slice(0, -1)
      });
      setGame(newGame);
      toast({
        title: "Takeback accepted",
      });
    } else {
      updateGameState({ pending_takeback_request: null });
      toast({
        title: "Takeback declined",
      });
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">Initializing game...</h2>
        </div>
      </div>
    );
  }

  if (showSettings) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="w-full max-w-md p-6 bg-card rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-center mb-6">Game Settings</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Time Control (minutes)</label>
              <Select
                value={settings.time_control.toString()}
                onValueChange={(value) => setSettings(prev => ({ ...prev, time_control: parseInt(value) }))}
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
                Start Game
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

  const isGameOver = gameState?.game_result || game.isGameOver();
  const canOfferDraw = !isGameOver && !gameState?.pending_draw_offer;
  const canRequestTakeback = !isGameOver && !gameState?.pending_takeback_request && gameState?.moves?.length > 0;
  const hasDrawOffer = gameState?.pending_draw_offer && gameState.pending_draw_offer !== playerId;
  const hasTakebackRequest = gameState?.pending_takeback_request && gameState.pending_takeback_request !== playerId;

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
                `Game Over - ${gameState?.game_result || game.isCheckmate() ? 
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