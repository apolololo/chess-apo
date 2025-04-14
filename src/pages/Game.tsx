import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useChessSounds } from '@/hooks/use-chess-sounds';

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
  score?: {
    white: number;
    black: number;
    draws: number;
  };
  last_move_time?: string;
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
  const location = useLocation();
  const [game, setGame] = useState(new Chess());
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId] = useState(() => crypto.randomUUID());
  const [isWaiting, setIsWaiting] = useState(true);
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
  const [settings] = useState<GameSettings>(location.state || { time_control: 10, increment: 5 });
  const [isInitialized, setIsInitialized] = useState(false);
  const [whiteTime, setWhiteTime] = useState<Timer>({ minutes: settings.time_control, seconds: 0 });
  const [blackTime, setBlackTime] = useState<Timer>({ minutes: settings.time_control, seconds: 0 });
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const { playMove, playCapture, playGameEnd, playNotify } = useChessSounds();
  const [boardWidth, setBoardWidth] = useState(560);
  const [isConnecting, setIsConnecting] = useState(true);

  useEffect(() => {
    // Test connection to Supabase
    const testConnection = async () => {
      try {
        setIsConnecting(true);
        const { error } = await supabase.from('games').select('*', { count: 'exact', head: true });
        if (error) throw error;
        setIsConnecting(false);
      } catch (error) {
        console.error('Failed to connect to Supabase:', error);
        toast({
          title: "Erreur de connexion",
          description: "Impossible de se connecter au serveur. Veuillez réessayer.",
          variant: "destructive"
        });
        navigate('/');
      }
    };

    testConnection();
  }, [navigate]);

  useEffect(() => {
    const updateBoardSize = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const sidebarWidth = 300;
      const padding = 32;
      const timerHeight = 80;
      
      const availableWidth = windowWidth - sidebarWidth - padding;
      const availableHeight = windowHeight - timerHeight;
      
      const size = Math.min(availableWidth, availableHeight);
      
      setBoardWidth(size);
    };

    window.addEventListener('resize', updateBoardSize);
    updateBoardSize();

    return () => window.removeEventListener('resize', updateBoardSize);
  }, []);

  const cleanupGame = async () => {
    if (id) {
      await supabase
        .from('games')
        .delete()
        .eq('id', id);
    }
  };

  useEffect(() => {
    const handleUnload = () => {
      cleanupGame();
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      cleanupGame();
    };
  }, [id]);

  const startTimers = () => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }

    timerInterval.current = setInterval(async () => {
      if (!gameState || gameState.game_result) return;

      const currentTime = new Date().getTime();
      const lastMoveTime = gameState.last_move_time ? new Date(gameState.last_move_time).getTime() : currentTime;
      const elapsedSeconds = Math.floor((currentTime - lastMoveTime) / 1000);

      if (gameState.current_turn === 'white') {
        setWhiteTime(formatTime(gameState.white_time - elapsedSeconds));
        setBlackTime(formatTime(gameState.black_time));
      } else {
        setWhiteTime(formatTime(gameState.white_time));
        setBlackTime(formatTime(gameState.black_time - elapsedSeconds));
      }

      const activeTime = gameState.current_turn === 'white' ? gameState.white_time - elapsedSeconds : gameState.black_time - elapsedSeconds;

      if (activeTime <= 0) {
        const winner = gameState.current_turn === 'white' ? 'black' : 'white';
        await updateGameState({
          game_result: winner === 'white' ? '1-0' : '0-1',
          white_time: gameState.current_turn === 'white' ? 0 : gameState.white_time,
          black_time: gameState.current_turn === 'black' ? 0 : gameState.black_time,
        });
        clearInterval(timerInterval.current);
        toast({
          title: `Partie terminée`,
          description: `${winner === 'white' ? 'Blancs' : 'Noirs'} gagnent au temps`,
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
    if (!id || isConnecting) {
      return;
    }

    const initializeGameState = async () => {
      try {
        console.log('Initializing game state...');
        
        const { data: existingGame, error: fetchError } = await supabase
          .from('games')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (fetchError) {
          console.error('Error fetching game:', fetchError);
          throw fetchError;
        }

        console.log('Existing game:', existingGame);

        const channel = supabase.channel(`game:${id}`, {
          config: {
            broadcast: {
              self: true
            }
          }
        });

        if (!existingGame) {
          console.log('Creating new game...');
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
            black_player: isWhite ? undefined : playerId,
            last_move_time: new Date().toISOString()
          };

          const { error: insertError } = await supabase
            .from('games')
            .insert([{ id, ...initialState }]);

          if (insertError) {
            console.error('Error creating game:', insertError);
            throw insertError;
          }

          console.log('Game created successfully');
          setGameState({ id, ...initialState });
          setPlayerColor(isWhite ? 'white' : 'black');
          
          setWhiteTime(formatTime(settings.time_control * 60));
          setBlackTime(formatTime(settings.time_control * 60));
        } else {
          console.log('Joining existing game...');
          if (existingGame.players.length < 2 && !existingGame.players.includes(playerId)) {
            const updatedPlayers = [...existingGame.players, playerId];
            const started_at = new Date().toISOString();
            
            const updatedState = {
              players: updatedPlayers,
              started_at,
              white_player: existingGame.white_player || (existingGame.black_player ? playerId : undefined),
              black_player: existingGame.black_player || (existingGame.white_player ? playerId : undefined),
              last_move_time: new Date().toISOString()
            };

            const { error: updateError } = await supabase
              .from('games')
              .update(updatedState)
              .eq('id', id);

            if (updateError) {
              console.error('Error updating game:', updateError);
              throw updateError;
            }

            console.log('Game updated successfully');
            setGameState({ ...existingGame, ...updatedState });
            setPlayerColor(existingGame.white_player ? 'black' : 'white');
            
            setWhiteTime(formatTime(existingGame.white_time));
            setBlackTime(formatTime(existingGame.black_time));
            
            channel.send({
              type: 'broadcast',
              event: 'game_state',
              payload: { ...existingGame, ...updatedState }
            });
          } else {
            console.log('Setting existing game state');
            setGameState(existingGame);
            if (existingGame.white_player === playerId) {
              setPlayerColor('white');
            } else if (existingGame.black_player === playerId) {
              setPlayerColor('black');
            }
            
            setWhiteTime(formatTime(existingGame.white_time));
            setBlackTime(formatTime(existingGame.black_time));
          }

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
              setIsWaiting(false);
              startTimers();
            }
          })
          .subscribe();

        setIsInitialized(true);
      } catch (error) {
        console.error('Error initializing game:', error);
        toast({
          title: "Erreur",
          description: "Impossible d'initialiser la partie. Veuillez réessayer.",
          variant: "destructive"
        });
        navigate('/');
      }
    };

    initializeGameState();
  }, [id, playerId, navigate, settings, isConnecting]);

  useEffect(() => {
    if (gameState?.players.length === 2) {
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
        if (result.captured) {
          playCapture();
        } else {
          playMove();
        }

        const currentTime = new Date().getTime();
        const lastMoveTime = gameState.last_move_time ? new Date(gameState.last_move_time).getTime() : currentTime;
        const elapsedSeconds = Math.floor((currentTime - lastMoveTime) / 1000);
        
        const newState = {
          ...gameState,
          current_turn: game.turn() === 'w' ? 'black' : 'white',
          pgn: newGame.pgn(),
          moves: [...(gameState.moves || []), `${game.turn() === 'w' ? 'White' : 'Black'}: ${move.from}${move.to}`],
          white_time: game.turn() === 'b' ? 
            gameState.white_time - (gameState.current_turn === 'white' ? elapsedSeconds : 0) + gameState.increment : 
            gameState.white_time,
          black_time: game.turn() === 'w' ? 
            gameState.black_time - (gameState.current_turn === 'black' ? elapsedSeconds : 0) + gameState.increment : 
            gameState.black_time,
          last_move_time: new Date().toISOString()
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

        if (newGame.isGameOver()) {
          playGameEnd();
        }

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
        current_turn: isWhiteMove ? 'white' : 'black',
        last_move_time: new Date().toISOString()
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

  const requestRematch = () => {
    if (!id || !playerColor || !gameState) return;
    const newGameId = crypto.randomUUID();
    navigate(`/game/${newGameId}`);
  };

  const customSquareStyles = {
    ...(lastMove ? {
      [lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
      [lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
    } : {}),
  };

  if (isConnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">Connexion au serveur...</h2>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">Initialisation de la partie...</h2>
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[1400px] flex gap-4">
        <div className="flex-1 flex flex-col items-center">
          <div className="text-lg font-mono mb-4">
            {playerColor === 'black' ? (
              <div className={game.turn() === 'w' ? 'text-primary font-bold' : ''}>
                Blancs: {whiteTime.minutes}:{whiteTime.seconds.toString().padStart(2, '0')}
              </div>
            ) : (
              <div className={game.turn() === 'b' ? 'text-primary font-bold' : ''}>
                Noirs: {blackTime.minutes}:{blackTime.seconds.toString().padStart(2, '0')}
              </div>
            )}
          </div>

          <div className="board-container relative">
            <Chessboard 
              position={game.fen()}
              onPieceDrop={onDrop}
              boardOrientation={playerColor || 'white'}
              customSquareStyles={customSquareStyles}
              animationDuration={200}
              boardWidth={boardWidth}
            />
          </div>

          <div className="text-lg font-mono mt-4">
            {playerColor === 'black' ? (
              <div className={game.turn() === 'b' ? 'text-primary font-bold' : ''}>
                Noirs: {blackTime.minutes}:{blackTime.seconds.toString().padStart(2, '0')}
              </div>
            ) : (
              <div className={game.turn() === 'w' ? 'text-primary font-bold' : ''}>
                Blancs: {whiteTime.minutes}:{whiteTime.seconds.toString().padStart(2, '0')}
              </div>
            )}
          </div>
        </div>

        <div className="w-64 flex flex-col gap-4">
          <div className="bg-card rounded-lg p-4">
            <h2 className="text-xl font-bold text-foreground mb-2">
              {playerColor ? `Vous jouez les ${playerColor === 'white' ? 'Blancs' : 'Noirs'}` : 'Spectateur'}
            </h2>
            <p className="text-muted-foreground">
              {isGameOver ? (
                `Partie terminée - ${gameState?.game_result === '1-0' ? 'Blancs gagnent' : 
                  gameState?.game_result === '0-1' ? 'Noirs gagnent' : 
                  gameState?.game_result === '½-½' ? 'Partie nulle' : 
                  'Partie terminée'}`
              ) : (
                `Tour des ${game.turn() === 'w' ? "Blancs" : "Noirs"}`
              )}
            </p>
          </div>

          {(hasDrawOffer || hasTakebackRequest) && (
            <div className="bg-muted p-4 rounded-lg">
              <p className="font-medium">
                {hasDrawOffer ? 'Votre adversaire propose une partie nulle' : 'Votre adversaire demande d\'annuler le dernier coup'}
              </p>
              <div className="mt-2 space-x-2">
                <Button 
                  onClick={() => hasDrawOffer ? respondToDrawOffer(true) : respondToTakeback(true)}
                  variant="outline"
                >
                  Accepter
                </Button>
                <Button 
                  onClick={() => hasDrawOffer ? respondToDrawOffer(false) : respondToTakeback(false)}
                  variant="outline"
                >
                  Refuser
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {!isGameOver && playerColor && (
              <>
                <Button 
                  onClick={offerDraw} 
                  variant="outline"
                  disabled={!canOfferDraw}
                  className="w-full"
                >
                  Proposer nulle
                </Button>
                <Button 
                  onClick={requestTakeback} 
                  variant="outline"
                  disabled={!canRequestTakeback}
                  className="w-full"
                >
                  Annuler le coup
                </Button>
                <Button 
                  onClick={resign} 
                  variant="destructive"
                  className="w-full"
                >
                  Abandonner
                </Button>
              </>
            )}
            {isGameOver && (
              <>
                <Button onClick={requestRematch} className="w-full">
                  Revanche
                </Button>
                <Button onClick={() => navigate('/')} variant="outline" className="w-full">
                  Retour à l'accueil
                </Button>
              </>
            )}
          </div>

          {gameState?.moves && (
            <div className="bg-card rounded-lg flex-1">
              <h3 className="font-medium p-4 pb-2">Historique des coups</h3>
              <div className="px-4 pb-4 h-[calc(100%-3rem)] overflow-y-auto space-y-1">
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
    </div>
  );
};

export default Game;