import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Sound effects
const MOVE_SOUND = new Audio('/sounds/move.mp3');
const CAPTURE_SOUND = new Audio('/sounds/capture.mp3');
const CHECK_SOUND = new Audio('/sounds/check.mp3');
const GAME_END_SOUND = new Audio('/sounds/game-end.mp3');
const PIECE_SELECT_SOUND = new Audio('/sounds/piece-select.mp3');

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
  timeControl: number;
  increment: number;
}

const Game = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(new Chess());
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [whiteTime, setWhiteTime] = useState({ minutes: 10, seconds: 0 });
  const [blackTime, setBlackTime] = useState({ minutes: 10, seconds: 0 });
  const [isGameOver, setIsGameOver] = useState(false);
  const [playerId] = useState(() => crypto.randomUUID());
  const [showSettings, setShowSettings] = useState(true);
  const [settings, setSettings] = useState<GameSettings>({
    timeControl: 10,
    increment: 5
  });
  const [gameUrl, setGameUrl] = useState('');

  const copyGameUrl = () => {
    navigator.clipboard.writeText(gameUrl);
    toast({
      title: "Lien copié",
      description: "Le lien de la partie a été copié dans le presse-papier"
    });
  };

  useEffect(() => {
    setGameUrl(`${window.location.origin}/game/${id}`);
  }, [id]);

  const createGame = async () => {
    if (!id) return;

    const newGameState = {
      id,
      players: [playerId],
      creator: playerId,
      current_turn: 'white',
      pgn: '',
      time_control: settings.timeControl,
      increment: settings.increment,
      moves: [],
      white_time: settings.timeControl * 60,
      black_time: settings.timeControl * 60,
      white_player: playerId
    };

    const { error } = await supabase.from('games').insert(newGameState);
    
    if (!error) {
      setGameState(newGameState);
      setPlayerColor('white');
      setShowSettings(false);
      toast({
        title: "Partie créée",
        description: "Partagez le lien pour inviter un adversaire"
      });
    }
  };

  useEffect(() => {
    if (!id) return;

    const initializeGame = async () => {
      const { data: existingGame } = await supabase
        .from('games')
        .select('*')
        .eq('id', id)
        .single();

      if (existingGame) {
        if (!existingGame.black_player && existingGame.white_player !== playerId) {
          const updatedGame = {
            ...existingGame,
            black_player: playerId,
            players: [...(existingGame.players || []), playerId],
            started_at: new Date().toISOString()
          };
          await supabase.from('games').update(updatedGame).eq('id', id);
          setGameState(updatedGame);
          setPlayerColor('black');
          setShowSettings(false);
        } else {
          setGameState(existingGame);
          if (existingGame.white_player === playerId) setPlayerColor('white');
          if (existingGame.black_player === playerId) setPlayerColor('black');
          setShowSettings(false);
        }

        if (existingGame.pgn) {
          const loadedGame = new Chess();
          loadedGame.loadPgn(existingGame.pgn);
          setGame(loadedGame);
        }
      }

      // Subscribe to game changes
      const channel = supabase.channel(`game:${id}`);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.on('*', (payload) => {
            if (payload.eventType === 'UPDATE') {
              const newState = payload.new;
              setGameState(newState);
              if (newState.pgn) {
                const newGame = new Chess();
                newGame.loadPgn(newState.pgn);
                setGame(newGame);
                
                if (newGame.isCheck()) {
                  CHECK_SOUND.play();
                } else if (newGame.history().length > game.history().length) {
                  const lastMove = newGame.history({ verbose: true }).pop();
                  if (lastMove?.captured) {
                    CAPTURE_SOUND.play();
                  } else {
                    MOVE_SOUND.play();
                  }
                }
              }
            }
          });
        }
      });
    };

    initializeGame();
  }, [id]);

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (!gameState || game.turn() !== playerColor?.[0]) return false;

    try {
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q'
      });

      if (move) {
        const newGameState = {
          ...gameState,
          pgn: game.pgn(),
          current_turn: game.turn() === 'w' ? 'black' : 'white',
          moves: [...gameState.moves, `${move.from}${move.to}`]
        };

        supabase.from('games').update(newGameState).eq('id', id);
        setLastMove({ from: sourceSquare, to: targetSquare });

        if (move.captured) {
          CAPTURE_SOUND.play();
        } else {
          MOVE_SOUND.play();
        }

        if (game.isCheck()) {
          CHECK_SOUND.play();
        }

        if (game.isCheckmate() || game.isDraw()) {
          GAME_END_SOUND.play();
          setIsGameOver(true);
        }

        return true;
      }
    } catch (error) {
      console.error('Error making move:', error);
    }
    return false;
  };

  const onPieceClick = () => {
    PIECE_SELECT_SOUND.play();
  };

  const customSquareStyles = {
    ...(lastMove ? {
      [lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.2)' },
      [lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.2)' }
    } : {}),
    ...(game.isCheck() ? {
      [game.turn() === 'w' ? game.squareOf('k') : game.squareOf('K')]: {
        backgroundColor: 'rgba(255, 0, 0, 0.3)'
      }
    } : {})
  };

  if (!gameState && !showSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Chargement de la partie...</h2>
          <p className="text-muted-foreground">Veuillez patienter</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paramètres de la partie</DialogTitle>
            <DialogDescription>
              Configurez les paramètres de la partie avant de commencer
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Temps de réflexion (minutes)</label>
              <Select
                value={settings.timeControl.toString()}
                onValueChange={(value) => setSettings(s => ({ ...s, timeControl: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 minutes</SelectItem>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Incrément (secondes)</label>
              <Select
                value={settings.increment.toString()}
                onValueChange={(value) => setSettings(s => ({ ...s, increment: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 secondes</SelectItem>
                  <SelectItem value="2">2 secondes</SelectItem>
                  <SelectItem value="5">5 secondes</SelectItem>
                  <SelectItem value="10">10 secondes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createGame} className="w-full">
              Créer la partie
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="w-full max-w-[1200px] flex flex-col items-center gap-4">
        <div className="w-full flex justify-between items-center mb-4">
          <div className="text-xl font-mono">
            {playerColor ? `Vous jouez les ${playerColor === 'white' ? 'Blancs' : 'Noirs'}` : 'En attente d\'un adversaire'}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyGameUrl}>
              Copier le lien
            </Button>
            <Button variant="outline" onClick={() => navigate('/')}>
              Quitter
            </Button>
          </div>
        </div>

        <div className="relative">
          <Chessboard
            position={game.fen()}
            onPieceDrop={onDrop}
            onPieceClick={onPieceClick}
            boardOrientation={playerColor || 'white'}
            customSquareStyles={customSquareStyles}
            animationDuration={200}
          />
        </div>

        {gameState?.moves && (
          <div className="w-full mt-4 p-4 bg-card rounded-lg">
            <h3 className="font-medium mb-2">Historique des coups</h3>
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