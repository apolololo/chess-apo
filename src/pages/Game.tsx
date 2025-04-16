import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useChessSounds } from '@/hooks/use-chess-sounds';
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
  rematch_requested?: string;
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
  const [showSettings, setShowSettings] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [whiteTime, setWhiteTime] = useState<Timer>({ minutes: 10, seconds: 0 });
  const [blackTime, setBlackTime] = useState<Timer>({ minutes: 10, seconds: 0 });
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const { playMove, playCapture, playGameEnd, playNotify, playCheck } = useChessSounds();
  const [boardWidth, setBoardWidth] = useState(560);
  const [possibleMoves, setPossibleMoves] = useState<{ [square: string]: boolean }>({});
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [isInCheck, setIsInCheck] = useState<'white' | 'black' | null>(null);
  const [rematchOffered, setRematchOffered] = useState<string | null>(null);

  // ... [Previous useEffect hooks and helper functions remain exactly the same until onSquareClick]

  const onSquareClick = (square: string) => {
    if (!gameState || isWaiting || !playerColor) return;
    
    const turn = game.turn() === 'w' ? 'white' : 'black';
    if (turn !== playerColor) return;

    const piece = game.get(square);
    
    if (selectedPiece === square) {
      setSelectedPiece(null);
      setPossibleMoves({});
    } else if (piece && piece.color === game.turn()) {
      setSelectedPiece(square);
      const moves = game.moves({ square, verbose: true });
      const possibleSquares = {};
      moves.forEach(move => {
        possibleSquares[move.to] = true;
      });
      setPossibleMoves(possibleSquares);
    } else if (selectedPiece && possibleMoves[square]) {
      makeMove({
        from: selectedPiece,
        to: square,
        promotion: 'q'
      });
      setSelectedPiece(null);
      setPossibleMoves({});
    }
  };

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

        if (newGame.inCheck()) {
          playCheck();
          setIsInCheck(newGame.turn() === 'w' ? 'white' : 'black');
        } else {
          setIsInCheck(null);
        }

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

  const requestRematch = () => {
    if (!id || !playerColor || !gameState) return;
    setRematchOffered(playerId);
    updateGameState({ rematch_requested: playerId });
    toast({
      title: "Revanche proposée",
      description: "En attente de la réponse de l'adversaire..."
    });
  };

  const handleRematchResponse = async (accept: boolean) => {
    if (!gameState?.rematch_requested || !id) return;
    
    if (accept) {
      const newGame = new Chess();
      const updatedState = {
        ...gameState,
        pgn: '',
        moves: [],
        current_turn: 'white',
        game_result: null,
        rematch_requested: null,
        white_time: gameState.time_control * 60,
        black_time: gameState.time_control * 60,
        started_at: new Date().toISOString(),
        white_player: gameState.black_player,
        black_player: gameState.white_player
      };

      const { error } = await supabase
        .from('games')
        .update(updatedState)
        .eq('id', id);

      if (!error) {
        setGame(newGame);
        setGameState(updatedState);
        setPlayerColor(playerColor === 'white' ? 'black' : 'white');
        setRematchOffered(null);
        setIsInCheck(null);
        setShowSettings(false);
        setIsWaiting(false);
        startTimers();
      }
    } else {
      updateGameState({ rematch_requested: null });
      setRematchOffered(null);
    }
  };

  const customSquareStyles = {
    ...(lastMove ? {
      [lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
      [lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
    } : {}),
    ...(isInCheck ? {
      [game.kingSquare(isInCheck === 'white' ? 'w' : 'b')]: {
        backgroundColor: 'rgba(255, 0, 0, 0.3)',
        boxShadow: 'inset 0 0 8px rgba(255, 0, 0, 0.8)'
      }
    } : {}),
    ...(gameState?.game_result ? {
      [game.kingSquare('w')]: {
        backgroundColor: gameState.game_result === '1-0' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)'
      },
      [game.kingSquare('b')]: {
        backgroundColor: gameState.game_result === '0-1' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)'
      }
    } : {}),
    ...Object.keys(possibleMoves).reduce((acc, square) => ({
      ...acc,
      [square]: {
        background: 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
        borderRadius: '50%'
      }
    }), {})
  };

  // ... [Rest of the component implementation remains exactly the same until the Chessboard component]

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
              onSquareClick={onSquareClick}
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

          {(hasDrawOffer || hasTakebackRequest || (rematchOffered && rematchOffered !== playerId)) && (
            <div className="bg-muted p-4 rounded-lg">
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
                    else handleRematchResponse(true);
                  }}
                  variant="outline"
                >
                  Accepter
                </Button>
                <Button 
                  onClick={() => {
                    if (hasDrawOffer) respondToDrawOffer(false);
                    else if (hasTakebackRequest) respondToTakeback(false);
                    else handleRematchResponse(false);
                  }}
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