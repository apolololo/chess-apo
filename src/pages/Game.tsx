import { useEffect, useState, useRef } from 'react';
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
  white_time: number;
  black_time: number;
  started_at?: string;
  white_player?: string;
  black_player?: string;
}

interface GameSettings {
  time_control: number;
  increment: number;
}

interface Timer {
  minutes: number;
  seconds: number;
}

const SITE_URL = 'https://chess-apo.netlify.app';

const formatTime = (totalSeconds: number): Timer => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return { minutes, seconds };
};

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
  const [whiteTime, setWhiteTime] = useState<Timer>({ minutes: 10, seconds: 0 });
  const [blackTime, setBlackTime] = useState<Timer>({ minutes: 10, seconds: 0 });
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  const startTimers = () => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }

    timerInterval.current = setInterval(async () => {
      if (!gameState || gameState.game_result) return;

      const currentTime = new Date().getTime();
      const startTime = gameState.started_at ? new Date(gameState.started_at).getTime() : currentTime;
      const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);

      const whiteTimeLeft = Math.max(0, gameState.white_time - (gameState.current_turn === 'white' ? elapsedSeconds : 0));
      const blackTimeLeft = Math.max(0, gameState.black_time - (gameState.current_turn === 'black' ? elapsedSeconds : 0));

      setWhiteTime(formatTime(whiteTimeLeft));
      setBlackTime(formatTime(blackTimeLeft));

      if (whiteTimeLeft === 0 || blackTimeLeft === 0) {
        const winner = whiteTimeLeft === 0 ? 'black' : 'white';
        await updateGameState({
          game_result: winner === 'white' ? '1-0' : '0-1'
        });
        clearInterval(timerInterval.current);
        toast({
          title: `Game Over`,
          description: `${winner === 'white' ? 'White' : 'Black'} wins on time`,
        });
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    };
  }, []);

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
          const isWhite = Math.random() < 0.5;
          const initialState: Omit<GameState, 'id'> = {
            players: [playerId],
            current_turn: 'white',
            pgn: '',
            time_control: settings.time_control,
            increment: settings.increment,
            moves: [],
            creator: playerId,
            white_time: settings.time_control * 60,
            black_time: settings.time_control * 60,
            white_player: isWhite ? playerId : undefined,
            black_player: isWhite ? undefined : playerId
          };

          const { error: insertError } = await supabase
            .from('games')
            .insert([{ id, ...initialState }]);

          if (insertError) {
            throw insertError;
          }

          setGameState({ id, ...initialState });
          setPlayerColor(isWhite ? 'white' : 'black');
          setShowSettings(true);
          
          // Initialize timers with selected time control
          setWhiteTime(formatTime(settings.time_control * 60));
          setBlackTime(formatTime(settings.time_control * 60));
        } else {
          if (existingGame.players.length < 2 && !existingGame.players.includes(playerId)) {
            const updatedPlayers = [...existingGame.players, playerId];
            const started_at = new Date().toISOString();
            
            const updatedState = {
              players: updatedPlayers,
              started_at,
              white_player: existingGame.white_player || (existingGame.black_player ? playerId : undefined),
              black_player: existingGame.black_player || (existingGame.white_player ? playerId : undefined)
            };

            const { error: updateError } = await supabase
              .from('games')
              .update(updatedState)
              .eq('id', id);

            if (updateError) {
              throw updateError;
            }

            setGameState({ ...existingGame, ...updatedState });
            setPlayerColor(existingGame.white_player ? 'black' : 'white');
            
            // Initialize timers with game's time control
            setWhiteTime(formatTime(existingGame.time_control * 60));
            setBlackTime(formatTime(existingGame.time_control * 60));
            
            channel.send({
              type: 'broadcast',
              event: 'game_state',
              payload: { ...existingGame, ...updatedState }
            });
          } else {
            setGameState(existingGame);
            if (existingGame.white_player === playerId) {
              setPlayerColor('white');
            } else if (existingGame.black_player === playerId) {
              setPlayerColor('black');
            }
            
            // Initialize timers with game's time control
            setWhiteTime(formatTime(existingGame.time_control * 60));
            setBlackTime(formatTime(existingGame.time_control * 60));
          }

          // Load last move for highlighting
          if (existingGame.pgn) {
            const tempGame = new Chess();
            tempGame.loadPgn(existingGame.pgn);
            const history = tempGame.history({ verbose: true });
            if (history.length > 0) {
              const lastMoveInfo = history[history.length - 1];
              setLastMove({ from: lastMoveInfo.from, to: lastMoveInfo.to });
            }
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
                
                // Update last move for highlighting
                const history = newGame.history({ verbose: true });
                if (history.length > 0) {
                  const lastMoveInfo = history[history.length - 1];
                  setLastMove({ from: lastMoveInfo.from, to: lastMoveInfo.to });
                }
              } catch (error) {
                console.error('Error loading PGN:', error);
              }
            }
            
            if (payload.players.length === 2 && payload.started_at) {
              setShowSettings(false);
              setIsWaiting(false);
              startTimers();
            }
          })
          .subscribe();

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
      setShowSettings(false);
      setIsWaiting(false);
      if (gameState.started_at) {
        startTimers();
      }
    } else {
      setIsWaiting(true);
    }
  }, [gameState?.players, gameState?.started_at]);

  const makeMove = async (move: any) => {
    if (!gameState || isWaiting || !id) return false;
    if (game.turn() === 'w' && playerColor !== 'white') return false;
    if (game.turn() === 'b' && playerColor !== 'black') return false;

    try {
      const newGame = new Chess(game.fen());
      const result = newGame.move(move);
      
      if (result) {
        const currentTime = new Date().getTime();
        const startTime = gameState.started_at ? new Date(gameState.started_at).getTime() : currentTime;
        const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);
        
        const newState = {
          ...gameState,
          current_turn: game.turn() === 'w' ? 'black' : 'white',
          pgn: newGame.pgn(),
          moves: [...(gameState.moves || []), `${game.turn() === 'w' ? 'White' : 'Black'}: ${move.from}${move.to}`],
          white_time: game.turn() === 'b' ? gameState.white_time + gameState.increment : gameState.white_time,
          black_time: game.turn() === 'w' ? gameState.black_time + gameState.increment : gameState.black_time
        };

        setLastMove({ from: move.from, to: move.to });

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
    if (!id || !playerColor || !gameState) return;
    updateGameState({ pending_takeback_request: playerId });
    toast({
      title: "Takeback requested",
      description: "Waiting for opponent's response..."
    });
  };

  const respondToTakeback = (accept: boolean) => {
    if (!id || !gameState?.pending_takeback_request || !game.history().length) return;
    
    if (accept) {
      const moves = game.history();
      moves.pop();
      
      const newGame = new Chess();
      moves.forEach(move => newGame.move(move));
      
      const lastMove = gameState.moves[gameState.moves.length - 1];
      const isWhiteMove = lastMove.startsWith('White');
      
      updateGameState({
        pending_takeback_request: null,
        pgn: newGame.pgn(),
        moves: gameState.moves.slice(0, -1),
        current_turn: isWhiteMove ? 'white' : 'black'
      });
      
      setGame(newGame);
      setLastMove(null);
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

  const customSquareStyles = {
    ...(lastMove ? {
      [lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
      [lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
    } : {}),
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
                onValueChange={(value) => {
                  const newTimeControl = parseInt(value);
                  setSettings(prev => ({ ...prev, time_control: newTimeControl }));
                  setWhiteTime(formatTime(newTimeControl * 60));
                  setBlackTime(formatTime(newTimeControl * 60));
                }}
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
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-foreground">
                {playerColor ? `You are playing as ${playerColor}` : 'Spectating'}
              </h2>
              <div className="flex gap-8">
                <div className={`text-lg font-mono ${game.turn() === 'w' ? 'text-primary font-bold' : ''}`}>
                  White: {whiteTime.minutes}:{whiteTime.seconds.toString().padStart(2, '0')}
                </div>
                <div className={`text-lg font-mono ${game.turn() === 'b' ? 'text-primary font-bold' : ''}`}>
                  Black: {blackTime.minutes}:{blackTime.seconds.toString().padStart(2, '0')}
                </div>
              </div>
            </div>
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
          boardOrientation={playerColor || 'white'}
          customSquareStyles={customSquareStyles}
          animationDuration={200}
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