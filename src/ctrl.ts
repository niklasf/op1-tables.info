import { Api as CgApi } from '@lichess-org/chessground/api';
import { Piece, Move, SquareName, NormalMove } from 'chessops/types';
import { Setup } from 'chessops/setup';
import { parseSquare, parseUci, makeSquare } from 'chessops/util';
import { FenError, makeFen, parseBoardFen, parseFen, makeBoardFen } from 'chessops/fen';
import { Chess } from 'chessops/chess';
import { setupEquals } from 'chessops/setup';
import { chessgroundDests, chessgroundMove } from 'chessops/compat';
import { Result } from '@badrap/result';
import { Sync, sync } from './sync.js';
import { Mousetrap } from './mousetrap.js';

export const DEFAULT_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

export const relaxedParseFen = (fen: string | null | undefined): Result<Setup, FenError> =>
  parseFen(fen?.trim().replace(/_/g, ' ') || DEFAULT_FEN);

export interface EnrichedTablebaseMove extends LilaTablebaseMove {
  fen: string;
  conversion: boolean;
  moveCategory: MoveCategory;
}

export const MOVE_CATEGORIES = ['loss', 'draw', 'unknown', 'win'] as const;
export type MoveCategory = typeof MOVE_CATEGORIES[number];

export interface TablebaseResponse {
  moves: EnrichedTablebaseMove[];
  error?: string;
}

export class Ctrl {
  public setup: Setup;
  public lastMove: Move | undefined;
  public editMode = false;
  public flipped = false;

  private ground: CgApi | undefined;

  private abortController: AbortController | undefined;
  public tablebaseResponse: Sync<TablebaseResponse>;

  constructor(private readonly redraw: () => void) {
    this.setup = relaxedParseFen(new URLSearchParams(location.search).get('fen')).unwrap(
      setup => setup,
      _ => parseFen(DEFAULT_FEN).unwrap(),
    );
    this.tablebaseResponse = sync(this.fetchTablebase());
    this.tablebaseResponse.promise.finally(() => this.redraw());

    window.addEventListener('popstate', event => {
      this.setPosition(
        relaxedParseFen(event.state?.fen || new URLSearchParams(location.search).get('fen')).unwrap(
          setup => setup,
          _ => parseFen(DEFAULT_FEN).unwrap(),
        ),
        event.state?.lastMove,
      );
    });

    new Mousetrap()
      .bind('f', () => this.toggleFlipped())
      .bind('e', () => this.toggleEditMode())
      .bind('space', () =>
        this.tablebaseResponse.promise.then(
          response => response.moves.length && this.pushMove(parseUci(response.moves[0].uci)!),
        ),
      );
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    this.updateGround();
    this.redraw();
  }

  toggleFlipped() {
    this.flipped = !this.flipped;
    this.updateGround();
    this.redraw();
  }

  setHovering(move: NormalMove | undefined) {
    this.withGround(ground => ground.setAutoShapes(move ? [{
      orig: makeSquare(move.from),
      dest: makeSquare(move.to),
      brush: 'green',
    }] : []))
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
    this.tablebaseResponse = sync(this.fetchTablebase());
    this.tablebaseResponse.promise.finally(() => this.redraw());
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
          dests: this.editMode ? undefined : pos.unwrap(chessgroundDests, _ => undefined),
        },
        orientation: this.flipped ? 'black' : 'white',
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

  async fetchTablebase(): Promise<TablebaseResponse> {
    this.abortController?.abort();
    this.abortController = new AbortController();

    const pos = Chess.fromSetup(this.setup);
    if (pos.isErr) {
      return { moves: [], error: `Illegal position: ${pos.error}` };
    }

    const url = new URL('/standard', 'https://tablebase.lichess.ovh');
    url.searchParams.set('fen', this.getFen());
    url.searchParams.set('op1', 'always');
    const res = await fetch(url.href, { signal: this.abortController.signal });
    if (!res.ok) {
      return { moves: [], error: `Failed to fetch tablebase: ${res.status}` };
    }
    const json: LilaTablebaseResponse = await res.json();
    return {
      moves: json.moves.map(move => {
        const after = pos.value.clone();
        after.play(parseUci(move.uci)!);
        const enrichedMove: EnrichedTablebaseMove = {
          ...move,
          conversion: move.san.includes('x') || move.san.includes('='),
          fen: makeFen(after.toSetup()),
          moveCategory:
          move.category.includes('loss') ? 'win' : move.category.includes('win') ? 'loss' : move.category === 'draw' ? 'draw' : 'unknown'
        };
        return enrichedMove;
      })
      .sort((a, b) => (b.conversion ? 0 : b.dtc || 0) - (a.conversion ? 0 : a.dtc || 0))
      .sort((a, b) => MOVE_CATEGORIES.indexOf(b.moveCategory) - MOVE_CATEGORIES.indexOf(a.moveCategory)),
      error: 'Implementation in progress',
    };
  }
}
