export interface Endgame {
  fen: string;
  dtc: number;
  p?: string;
  bp?: string;
}

export interface Endgames {
  endgames: Endgame[];
}
