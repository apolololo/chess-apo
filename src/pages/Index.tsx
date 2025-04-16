import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { nanoid } from 'nanoid';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from 'react';

const Index = () => {
  const navigate = useNavigate();
  const [timeControl, setTimeControl] = useState('10');
  const [increment, setIncrement] = useState('5');
  
  const createGame = () => {
    const gameId = nanoid(10);
    navigate(`/game/${gameId}?time=${timeControl}&increment=${increment}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-8 w-full max-w-md p-6">
        <h1 className="text-4xl font-bold text-foreground">Jeu d'Échecs</h1>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-left block">Temps de réflexion (minutes)</label>
            <Select
              value={timeControl}
              onValueChange={setTimeControl}
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
            <label className="text-sm font-medium text-left block">Incrément (secondes)</label>
            <Select
              value={increment}
              onValueChange={setIncrement}
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
        </div>

        <Button onClick={createGame} size="lg" className="w-full">
          Créer une nouvelle partie
        </Button>
      </div>
    </div>
  );
};

export default Index;