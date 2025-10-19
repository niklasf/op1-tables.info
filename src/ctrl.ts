import { Api as CgApi } from '@lichess-org/chessground/api';
import { Setup, Board, Piece, SquareSet, Move, SquareName, parseSquare, Role } from 'chessops';
import { makeFen, parseBoardFen, parseFen } from 'chessops/fen';
import { Chess } from 'chessops/chess';
import { setupEquals } from 'chessops/setup';

export const DEFAULT_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

export class Ctrl {
  public setup: Setup = parseFen(DEFAULT_FEN).unwrap();
  public lastMove: Move | undefined;
  public editMode: boolean = false;

  private chessground: CgApi | undefined;

  constructor(private readonly redraw: () => void) {}

  setChessground(chessground: CgApi | undefined) {
    if (this.chessground && chessground !== this.chessground) {
      this.chessground.destroy();
    }
    this.chessground = chessground;
  }

  private setPosition(setup: Setup, lastMove?: Move): boolean {
    if (setupEquals(this.setup, setup)) return false;
    this.setup = setup;
    this.lastMove = lastMove;
    this.redraw();
    return true;
  }

  push(setup: Setup, lastMove?: Move) {
    if (this.setPosition(setup, lastMove) && 'pushState' in history) {
      const fen = this.getFen();
      history.pushState({ fen, lastMove }, '', '/?fen=' + fen.replace(/\s/g, '_'));
    }
  }

  pushMove(move: Move) {
    return Chess.fromSetup(this.setup).unwrap(
      pos => {
        if (!pos.isLegal(move)) return false;
        pos.play(move);
        this.push(pos.toSetup(), move);
        return true;
      },
      _ => false,
    );
  }

  getFen(): string {
    return makeFen(this.setup);
  }

  onChessgroundMove(from: SquareName, to: SquareName) {
    if (!this.editMode)
      this.pushMove({
        from: parseSquare(from),
        to: parseSquare(to),
      });
  }

  onChessgroundDropNewPiece(piece: Piece, square: SquareName) {
    if (piece.role === 'king') {
      // Move the existing king when dropping a new one.
      const diff = new Map();
      for (const [sq, p] of this.chessground!.state.pieces) {
        if (p.role === 'king' && p.color == piece.color) diff.set(sq, undefined);
      }
      diff.set(square, piece);
      this.chessground!.setPieces(diff);
    }
  }

  onChessgroundChange() {
    this.push({
      ...this.setup,
      board: parseBoardFen(this.chessground!.getFen()).unwrap()
    })
  }
}
