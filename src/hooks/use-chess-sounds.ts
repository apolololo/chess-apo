import useSound from 'use-sound';

// Son des pièces qui bougent
const MOVE_URL = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Move.mp3';
// Son de capture
const CAPTURE_URL = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Capture.mp3';
// Son de fin de partie
const GAME_END_URL = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/GenericNotify.mp3';
// Son de notification
const NOTIFY_URL = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Tournament1st.mp3';

export function useChessSounds() {
  const [playMove] = useSound(MOVE_URL, { volume: 0.5 });
  const [playCapture] = useSound(CAPTURE_URL, { volume: 0.5 });
  const [playGameEnd] = useSound(GAME_END_URL, { volume: 0.5 });
  const [playNotify] = useSound(NOTIFY_URL, { volume: 0.5 });

  return {
    playMove,
    playCapture,
    playGameEnd,
    playNotify
  };
}