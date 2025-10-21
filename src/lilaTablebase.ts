interface LilaTablebaseResponse extends LilaTablebasePosInfo {
  moves: LilaTablebaseMove[];
}

interface LilaTablebaseMove extends LilaTablebasePosInfo {
  uci: string;
  san: string;
  zeroing: boolean;
}

interface LilaTablebasePosInfo {
  checkmate: boolean;
  stalemate: boolean;
  insufficient_material: boolean;
  dtz: number | null;
  dtm: number | null;
  dtc: number | null;
  category: LilaTablebaseCategory;
}

type LilaTablebaseCategory =
  | 'win'
  | 'unknown'
  | 'syzygy-win'
  | 'maybe-win'
  | 'cursed-win'
  | 'draw'
  | 'blessed-loss'
  | 'maybe-loss'
  | 'syzygy-loss'
  | 'loss';
