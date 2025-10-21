import { Api as CgApi } from '@lichess-org/chessground/api';
import { Piece, Move, SquareName, NormalMove } from 'chessops/types';
import { Setup } from 'chessops/setup';
import { opposite, parseSquare, parseUci, makeSquare } from 'chessops/util';
import { FenError, makeFen, parseBoardFen, parseFen, makeBoardFen } from 'chessops/fen';
import { SquareSet } from 'chessops/squareSet';
import { Chess, IllegalSetup } from 'chessops/chess';
import { setupEquals } from 'chessops/setup';
import { chessgroundDests, chessgroundMove } from 'chessops/compat';
import { Result } from '@badrap/result';
import { Sync, sync } from './sync.js';
import { Mousetrap } from './mousetrap.js';
import { capitalize } from './util.js';

export const DEFAULT_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

export const relaxedParseFen = (fen: string | null | undefined): Result<Setup, FenError> =>
  parseFen(fen?.trim().replace(/_/g, ' ') || DEFAULT_FEN);

export interface EnrichedTablebaseMove extends LilaTablebaseMove {
  fen: string;
  conversion: boolean;
  simpleCategory: SimpleCategory;
}

export interface EnrichedTablebasePosInfo extends LilaTablebasePosInfo {
  simpleCategory: SimpleCategory;
}

export const SIMPLE_CATEGORIES = ['loss', 'draw', 'unknown', 'win'] as const;
export type SimpleCategory = (typeof SIMPLE_CATEGORIES)[number];

export interface TablebaseResponse {
  error?: TablebaseError;
  pos?: EnrichedTablebasePosInfo;
  moves: EnrichedTablebaseMove[];
}

export interface TablebaseError {
  title: string;
  message: string;
  retry: boolean;
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
      .bind('w', () => this.push({ ...this.setup, turn: 'white' }))
      .bind('b', () => this.push({ ...this.setup, turn: 'black' }))
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
    this.withGround(ground =>
      ground.setAutoShapes(
        move
          ? [
              {
                orig: makeSquare(move.from),
                dest: makeSquare(move.to),
                brush: 'green',
              },
            ]
          : [],
      ),
    );
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

  clearedBoardSetup(): Setup {
    return {
      ...this.setup,
      board: parseFen(DEFAULT_FEN).unwrap().board,
      castlingRights: SquareSet.empty(),
      epSquare: undefined,
    };
  }

  swappedColorsSetup(): Setup {
    const board = this.setup.board.clone();
    [board.white, board.black] = [board.black, board.white];
    return {
      ...this.setup,
      board,
      castlingRights: SquareSet.empty(),
      epSquare: undefined,
    };
  }

  async fetchTablebase(): Promise<TablebaseResponse> {
    this.abortController?.abort();
    this.abortController = new AbortController();

    const pos = Chess.fromSetup(this.setup);
    if (pos.isErr) {
      return {
        error: {
          title: 'Illegal position',
          message:
            pos.error.message == IllegalSetup.Empty
              ? 'Board is empty'
              : pos.error.message == IllegalSetup.OppositeCheck
                ? `${capitalize(this.setup.turn)} to move, but ${capitalize(opposite(this.setup.turn))} in check`
                : pos.error.message == IllegalSetup.PawnsOnBackrank
                  ? 'Pawns on backrank'
                  : pos.error.message == IllegalSetup.Kings
                    ? 'Need exactly one king of each color'
                    : '',
          retry: false,
        },
        moves: [],
      };
    }

    const url = new URL('/standard', 'https://tablebase.lichess.ovh');
    url.searchParams.set('fen', this.getFen());
    url.searchParams.set('op1', 'always');

    let res;
    try {
      res = await fetch(url.href, { signal: this.abortController.signal });
    } catch (error) {
      return {
        error: {
          title: 'Network error',
          message: error.message,
          retry: true,
        },
        moves: [],
      };
    }
    if (!res.ok) {
      return {
        error: {
          title: 'Transient error',
          message: `Upstream request failed with HTTP ${res.status}`,
          retry: true,
        },
        moves: [],
      };
    }

    const json: LilaTablebaseResponse = await res.json();
    return {
      pos: {
        checkmate: json.checkmate,
        stalemate: json.stalemate,
        insufficient_material: json.insufficient_material,
        dtz: json.dtz,
        dtc: json.dtc,
        dtm: json.dtm,
        category: json.category,
        simpleCategory: json.category.includes('loss')
          ? 'loss'
          : json.category.includes('win')
            ? 'win'
            : json.category === 'draw'
              ? 'draw'
              : 'unknown',
      },
      moves: json.moves
        .map(move => {
          const after = pos.value.clone();
          after.play(parseUci(move.uci)!);
          const enrichedMove: EnrichedTablebaseMove = {
            ...move,
            conversion: move.san.includes('x') || move.san.includes('='),
            fen: makeFen(after.toSetup()),
            simpleCategory: move.category.includes('loss')
              ? 'win'
              : move.category.includes('win')
                ? 'loss'
                : move.category === 'draw'
                  ? 'draw'
                  : 'unknown',
          };
          return enrichedMove;
        })
        .sort((a, b) => (b.conversion ? 0 : b.dtc || 0) - (a.conversion ? 0 : a.dtc || 0))
        .sort((a, b) => SIMPLE_CATEGORIES.indexOf(b.simpleCategory) - SIMPLE_CATEGORIES.indexOf(a.simpleCategory)),
    };
  }
}
