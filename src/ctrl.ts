import { Api as CgApi } from '@lichess-org/chessground/api';
import { Setup, Board, SquareSet  } from 'chessops';
import { makeFen, parseFen } from 'chessops/fen';

export const DEFAULT_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

// TODO: Next chessops has this built-in
const emptySetup = (): Setup => ({
  board: Board.empty(),
  pockets: undefined,
  turn: 'white',
  castlingRights: SquareSet.empty(),
  epSquare: undefined,
  remainingChecks: undefined,
  halfmoves: 0,
  fullmoves: 1,
});

export class Ctrl {
  private chessground: CgApi | undefined;

  constructor(private readonly redraw: () => void) { }

  setChessground(chessground: CgApi | undefined) {
    if (this.chessground && chessground !== this.chessground) {
      this.chessground.destroy();
    }
    this.chessground = chessground;
  }

  getSetup(): Setup {
    const boardFen = this.chessground?.getFen() || DEFAULT_FEN;
    return parseFen(boardFen).unwrap(
      setup => setup,
      _ => emptySetup()
    );
  }

  getFen(): string {
    return makeFen(this.getSetup());
  }

  onChessgroundChange() {
    this.redraw();
  }
}
