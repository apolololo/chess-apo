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

interface GameSettings {
  time_control: number;
  increment: number;
}

const Index = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<GameSettings>({
    time_control: 10,
    increment: 5,
  });
  
  const createGame = () => {
    const gameId = nanoid(10);
    navigate(`/game/${gameId}`, { state: settings });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-6 bg-card rounded-lg shadow-lg space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-2">Jeu d'Échecs</h1>
          <p className="text-muted-foreground">Configurez votre partie</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Temps de réflexion (minutes)</label>
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
            <label className="text-sm font-medium">Incrément (secondes)</label>
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
        </div>

        <Button onClick={createGame} size="lg" className="w-full">
          Créer une nouvelle partie
        </Button>
      </div>
    </div>
  );
};

export default Index;