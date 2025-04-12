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
  score?: {
    white: number;
    black: number;
    draws: number;
  };
  pending_rematch?: string;
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
          title: `Partie terminée`,
          description: `${winner === 'white' ? 'Blancs' : 'Noirs'} gagnent au temps`,
        });
      }
    }, 1000);
  };

  const requestRematch = async () => {
    if (!id || !playerColor || !gameState) return;
    
    await updateGameState({
      pending_rematch: playerId
    });
    
    toast({
      title: "Revanche proposée",
      description: "En attente de la réponse de l'adversaire..."
    });
  };

  const respondToRematch = async (accept: boolean) => {
    if (!gameState?.pending_rematch || !id) return;

    if (accept) {
      const newGame = new Chess();
      const updatedScore = {
        white: gameState.score?.white || 0,
        black: gameState.score?.black || 0,
        draws: gameState.score?.draws || 0
      };

      if (gameState.game_result === '1-0') {
        updatedScore.white++;
      } else if (gameState.game_result === '0-1') {
        updatedScore.black++;
      } else if (gameState.game_result === '½-½') {
        updatedScore.draws++;
      }

      const updatedState = {
        ...gameState,
        pgn: '',
        moves: [],
        current_turn: 'white',
        game_result: null,
        pending_rematch: null,
        pending_draw_offer: null,
        pending_takeback_request: null,
        white_time: settings.time_control * 60,
        black_time: settings.time_control * 60,
        started_at: new Date().toISOString(),
        score: updatedScore
      };

      const { error } = await supabase
        .from('games')
        .update(updatedState)
        .eq('id', id);

      if (!error) {
        setGame(newGame);
        setGameState(updatedState);
        setLastMove(null);
        startTimers();

        const channel = supabase.channel(`game:${id}`);
        channel.send({
          type: 'broadcast',
          event: 'game_state',
          payload: updatedState
        });
      }
    } else {
      await updateGameState({ pending_rematch: null });
      toast({
        title: "Revanche refusée",
      });
    }
  };

  const makeMove = async (move: any) => {
    if (!gameState || isWaiting || !id || gameState.game_result) return false;
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
          moves: [...(gameState.moves || []), `${game.turn() === 'w' ? 'Blancs' : 'Noirs'}: ${move.from}${move.to}`],
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

  const respondToTakeback = async (accept: boolean) => {
    if (!id || !gameState?.pending_takeback_request || !game.history().length) return;
    
    if (accept) {
      const history = game.history({ verbose: true });
      const lastMove = history[history.length - 1];
      
      const newGame = new Chess();
      newGame.loadPgn(game.pgn());
      newGame.undo();
      
      const updatedState = {
        ...gameState,
        pending_takeback_request: null,
        pgn: newGame.pgn(),
        moves: gameState.moves.slice(0, -1),
        current_turn: game.turn() === 'w' ? 'black' : 'white'
      };

      const { error } = await supabase
        .from('games')
        .update(updatedState)
        .eq('id', id);

      if (!error) {
        setGame(newGame);
        setGameState(updatedState);
        setLastMove(null);

        const channel = supabase.channel(`game:${id}`);
        channel.send({
          type: 'broadcast',
          event: 'game_state',
          payload: updatedState
        });

        toast({
          title: "Coup annulé",
        });
      }
    } else {
      await updateGameState({ pending_takeback_request: null });
      toast({
        title: "Annulation refusée",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[1200px] flex gap-4">
        {gameState?.moves && (
          <div className="w-64 p-4 bg-card rounded-lg h-[600px]">
            <h3 className="font-medium mb-2">Historique des coups</h3>
            <div className="h-full overflow-y-auto space-y-1">
              {gameState.moves.map((move, index) => (
                <div key={index} className="text-sm">
                  {move}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1">
          <div className={`text-xl font-mono text-center mb-4 ${game.turn() === 'w' ? 'text-primary font-bold scale-110' : ''}`}>
            Blancs: {whiteTime.minutes}:{whiteTime.seconds.toString().padStart(2, '0')}
          </div>

          <div className="relative">
            <Chessboard 
              position={game.fen()}
              onPieceDrop={onDrop}
              boardOrientation={playerColor || 'white'}
              customSquareStyles={customSquareStyles}
              animationDuration={200}
            />

            <div className="absolute -right-48 top-0 w-44 space-y-4">
              <div className="bg-card p-4 rounded-lg">
                <p className="text-sm font-medium mb-2">
                  {playerColor ? `Vous jouez les ${playerColor === 'white' ? 'Blancs' : 'Noirs'}` : 'Spectateur'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isGameOver ? (
                    `Partie terminée - ${gameState?.game_result === '1-0' ? 'Blancs gagnent' : 
                      gameState?.game_result === '0-1' ? 'Noirs gagnent' : 
                      gameState?.game_result === '½-½' ? 'Partie nulle' : 
                      'Partie terminée'}`
                  ) : (
                    `Tour des ${game.turn() === 'w' ? "Blancs" : "Noirs"}`
                  )}
                </p>

                {gameState?.score && (
                  <div className="mt-2 text-sm">
                    <p className="text-green-500">Victoires Blancs: {gameState.score.white}</p>
                    <p className="text-gray-500">Nulles: {gameState.score.draws}</p>
                    <p className="text-red-500">Victoires Noirs: {gameState.score.black}</p>
                  </div>
                )}
              </div>

              {!isGameOver && playerColor && (
                <div className="space-y-2">
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
                </div>
              )}

              {isGameOver && (
                <div className="space-y-2">
                  <Button onClick={requestRematch} className="w-full">
                    Revanche
                  </Button>
                  <Button onClick={() => navigate('/')} variant="outline" className="w-full">
                    Retour à l'accueil
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className={`text-xl font-mono text-center mt-4 ${game.turn() === 'b' ? 'text-primary font-bold scale-110' : ''}`}>
            Noirs: {blackTime.minutes}:{blackTime.seconds.toString().padStart(2, '0')}
          </div>

          {(hasDrawOffer || hasTakebackRequest || gameState?.pending_rematch) && (
            <div className="mt-4 bg-muted p-4 rounded-lg">
              <p className="font-medium">
                {hasDrawOffer ? 'Votre adversaire propose une partie nulle' : 
                 hasTakebackRequest ? 'Votre adversaire demande d\'annuler le dernier coup' :
                 'Votre adversaire propose une revanche'}
              </p>
              <div className="mt-2 space-x-2">
                <Button 
                  onClick={() => {
                    if (hasDrawOffer) respondToDrawOffer(true);
                    else if (hasTakebackRequest) respondToTakeback(true);
                    else respondToRematch(true);
                  }}
                  variant="outline"
                >
                  Accepter
                </Button>
                <Button 
                  onClick={() => {
                    if (hasDrawOffer) respondToDrawOffer(false);
                    else if (hasTakebackRequest) respondToTakeback(false);
                    else respondToRematch(false);
                  }}
                  variant="outline"
                >
                  Refuser
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Game;