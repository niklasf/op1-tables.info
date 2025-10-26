import { Api as CgApi } from '@lichess-org/chessground/api';
import { Piece, Move, SquareName, NormalMove, Color, COLORS } from 'chessops/types';
import { Setup } from 'chessops/setup';
import { defined, opposite, parseSquare, parseUci, makeSquare, squareFile, squareFromCoords } from 'chessops/util';
import { FenError, makeFen, parseBoardFen, parseFen, makeBoardFen } from 'chessops/fen';
import { SquareSet } from 'chessops/squareSet';
import { Chess, IllegalSetup, isStandardMaterial } from 'chessops/chess';
import { Material, setupEquals } from 'chessops/setup';
import { chessgroundDests, chessgroundMove } from 'chessops/compat';
import { Result } from '@badrap/result';
import { Sync, sync } from './sync.js';
import { Mousetrap } from './mousetrap.js';
import { capitalize, materialSideToString, normalizeMaterial } from './util.js';
import { Endgames } from './endgames.js';

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

export interface EnrichedEndgames extends Endgames {
  url: string;
  error?: TablebaseError;
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
  private hovering: NormalMove | undefined;

  private abortController: AbortController | undefined;
  public tablebaseResponse: Sync<TablebaseResponse>;
  public endgames?: Sync<EnrichedEndgames>;

  constructor(private readonly redraw: () => void) {
    this.setup = relaxedParseFen(new URLSearchParams(location.search).get('fen')).unwrap(
      setup => setup,
      _ => parseFen(DEFAULT_FEN).unwrap(),
    );

    this.updatePosition();

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
    this.hovering = move;
    this.updateAutoShapes();
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
    this.updatePosition();

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
    this.updateAutoShapes();
  }

  private updatePosition() {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.tablebaseResponse = sync(this.fetchTablebase(this.abortController.signal));
    this.tablebaseResponse.promise.finally(() => this.redraw());
    this.endgames = sync(this.fetchEndgames(this.abortController.signal));
    this.endgames.promise.finally(() => this.redraw());

    const material = Material.fromBoard(this.setup.board);
    document.title = `${materialSideToString(material.white)}v${materialSideToString(material.black)} — Op1 endgame tablebase`;
  }

  private updateAutoShapes() {
    this.withGround(ground => {
      const opposedPawn = this.opposedPawn();
      console.log(this.promotionTargets('white'));
      ground.setAutoShapes([
        ...(this.hovering
          ? [
              {
                orig: makeSquare(this.hovering.from),
                dest: makeSquare(this.hovering.to),
                brush: 'blue',
              },
            ]
          : []),
        ...(this.setup.board.occupied.size() >= 8 && opposedPawn
          ? [
              {
                orig: makeSquare(opposedPawn.from),
                dest: makeSquare(opposedPawn.to),
                brush: 'paleGreen',
              },
            ]
          : []),
        ...(this.setup.board.occupied.size() === 8 && !opposedPawn
          ? [...this.promotionTargets('white'), ...this.promotionTargets('black')].map(r => ({
              orig: makeSquare(r.from),
              dest: makeSquare(r.to),
              brush: 'paleRed',
            }))
          : []),
      ]);
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

  veryWeakSide(): Color | undefined {
    return COLORS.find(
      color =>
        !this.setup.board.pieces(color, 'pawn').moreThanOne() &&
        this.setup.board[color].diff(this.setup.board.king).diff(this.setup.board.pawn).isEmpty(),
    );
  }

  opposedPawn(): NormalMove | undefined {
    const whitePawns = this.setup.board.pieces('white', 'pawn');
    const blackPawns = this.setup.board.pieces('black', 'pawn');
    const blackWitness = whitePawns
      .shl64(8)
      .union(whitePawns.shl64(16))
      .union(whitePawns.shl64(24))
      .union(whitePawns.shl64(32))
      .union(whitePawns.shl64(40))
      .intersect(blackPawns)
      .first();
    if (!blackWitness) return;
    const whiteWitness = Array.from(whitePawns.intersect(SquareSet.fromFile(squareFile(blackWitness))).reversed()).find(
      p => p < blackWitness,
    );
    if (!whiteWitness) return;
    return this.setup.turn === 'white'
      ? { from: whiteWitness, to: blackWitness }
      : { from: blackWitness, to: whiteWitness };
  }

  promotionTargets(color: Color): NormalMove[] {
    return [0, 1, 2, 3, 4, 5, 6, 7]
      .map(file => {
        const pawns = SquareSet.fromFile(file).intersect(this.setup.board.pieces(color, 'pawn'));
        const pawn = color === 'white' ? pawns.last() : pawns.first();
        return defined(pawn) ? { from: pawn, to: squareFromCoords(file, color === 'white' ? 7 : 0)! } : undefined;
      })
      .filter(defined);
  }

  apiUrl(): string {
    const url = new URL('/standard', 'https://tablebase.lichess.ovh');
    url.searchParams.set('fen', this.getFen().replace(/\s/g, '_'));
    url.searchParams.set('dtc', 'always');
    return url.href;
  }

  fenUrl(fen: string): string {
    return '/?fen=' + fen.replace(/\s/g, '_');
  }

  private async fetchTablebase(signal: AbortSignal): Promise<TablebaseResponse> {
    const pos = Chess.fromSetup(this.setup);
    if (pos.isErr) {
      return {
        error: {
          title: 'Illegal position',
          message:
            pos.error.message == IllegalSetup.Empty
              ? 'Board is empty.'
              : pos.error.message == IllegalSetup.OppositeCheck
                ? `${capitalize(this.setup.turn)} to move, but ${capitalize(opposite(this.setup.turn))} in check.`
                : pos.error.message == IllegalSetup.PawnsOnBackrank
                  ? 'Pawns on backrank.'
                  : pos.error.message == IllegalSetup.Kings
                    ? 'Need exactly one king of each color.'
                    : '',
          retry: false,
        },
        moves: [],
      };
    }

    if (!isStandardMaterial(pos.value))
      return {
        error: {
          title: 'Impossible material',
          message: 'Material combination cannot be reached in a normal chess game.',
          retry: false,
        },
        moves: [],
      };

    let res;
    try {
      res = await fetch(this.apiUrl(), { signal });
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

  private async fetchEndgames(signal: AbortSignal): Promise<EnrichedEndgames> {
    const normalized = normalizeMaterial(Material.fromBoard(this.setup.board));
    const url =
      this.getFen() === DEFAULT_FEN
        ? '/endgames/index.json'
        : `/endgames/${materialSideToString(normalized.white).toLowerCase()}${materialSideToString(normalized.black).toLowerCase()}.json`;
    if (this.endgames?.sync?.url === url) return this.endgames.sync;

    let res;
    try {
      res = await fetch(url, { signal });
    } catch (error) {
      return {
        url: '',
        error: {
          title: 'Network error',
          message: error.message,
          retry: true,
        },
        endgames: [],
      };
    }

    if (res.status === 404) {
      return {
        url,
        endgames: [],
      };
    }

    if (!res.ok) {
      return {
        url: '',
        error: {
          title: 'Transient error',
          message: `Endgame request failed with HTTP ${res.status}`,
          retry: true,
        },
        endgames: [],
      };
    }

    const endgames: Endgames = await res.json();
    return { ...endgames, url };
  }
}
