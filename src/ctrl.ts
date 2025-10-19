import { Api as CgApi } from '@lichess-org/chessground/api';
import { Piece, Move, SquareName } from 'chessops/types';
import { Setup } from 'chessops/setup';
import { parseSquare } from 'chessops/util';
import { FenError, makeFen, parseBoardFen, parseFen, makeBoardFen } from 'chessops/fen';
import { Chess } from 'chessops/chess';
import { setupEquals } from 'chessops/setup';
import { chessgroundDests, chessgroundMove } from 'chessops/compat';
import { Result } from '@badrap/result';

export const DEFAULT_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

export const relaxedParseFen = (fen: string | null | undefined): Result<Setup, FenError> =>
  parseFen(fen?.trim().replace(/_/g, ' ') || DEFAULT_FEN);

export class Ctrl {
  public setup: Setup;
  public lastMove: Move | undefined;
  public editMode = false;

  private ground: CgApi | undefined;

  constructor(private readonly redraw: () => void) {
    this.setup = relaxedParseFen(new URLSearchParams(location.search).get('fen')).unwrap(
      setup => setup,
      _ => parseFen(DEFAULT_FEN).unwrap(),
    );

    window.addEventListener('popstate', event => {
      this.setPosition(
        relaxedParseFen(event.state?.fen || new URLSearchParams(location.search).get('fen')).unwrap(
          setup => setup,
          _ => parseFen(DEFAULT_FEN).unwrap(),
        ),
        event.state?.lastMove,
      );
    });
  }

  setGround(ground: CgApi | undefined) {
    if (this.ground && ground !== this.ground) {
      this.ground.destroy();
    }
    this.ground = ground;
    this.updateGround();
  }

  private withGround<T>(f: (ground: CgApi) => T): T | undefined {
    return this.ground && f(this.ground);
  }

  private setPosition(setup: Setup, lastMove?: Move): boolean {
    if (setupEquals(this.setup, setup)) return false;
    this.setup = setup;
    this.lastMove = lastMove;
    this.updateGround();
    this.redraw();
    return true;
  }

  private updateGround() {
    this.withGround(ground => {
      const pos = Chess.fromSetup(this.setup);
      ground.set({
        lastMove: this.getLastMove(),
        fen: this.getBoardFen(),
        turnColor: this.setup.turn,
        check: pos.unwrap(
          p => p.isCheck() && p.turn,
          _ => false,
        ),
        movable: {
          dests: pos.unwrap(chessgroundDests, _ => undefined),
        },
      });
    });
  }

  push(setup: Setup, lastMove?: Move) {
    if (this.setPosition(setup, lastMove) && 'pushState' in history) {
      const fen = this.getFen();
      history.pushState({ fen, lastMove }, '', '/?fen=' + fen.replace(/\s/g, '_'));
    }
  }

  pushMove(move: Move): boolean {
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

  getBoardFen(): string {
    return makeBoardFen(this.setup.board);
  }

  getLastMove(): SquareName[] | undefined {
    return this.lastMove && chessgroundMove(this.lastMove);
  }

  onCgMove(from: SquareName, to: SquareName) {
    if (!this.editMode)
      this.pushMove({
        from: parseSquare(from),
        to: parseSquare(to),
      });
  }

  onCgDropNewPiece(piece: Piece, square: SquareName) {
    if (piece.role === 'king') {
      // Move the existing king when dropping a new one.
      this.withGround(ground => {
        const diff = new Map();
        for (const [sq, p] of ground.state.pieces) {
          if (p.role === 'king' && p.color == piece.color) diff.set(sq, undefined);
        }
        diff.set(square, piece);
        ground.setPieces(diff);
      });
    }
  }

  onCgChange() {
    this.withGround(ground =>
      this.push({
        ...this.setup,
        board: parseBoardFen(ground.getFen()).unwrap(),
      }),
    );
  }

  onSpareMouseDown(e: MouseEvent | TouchEvent, piece: Piece) {
    this.withGround(ground => {
      e.preventDefault();
      ground.dragNewPiece(piece, e, true);
    });
  }

  wantsReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
