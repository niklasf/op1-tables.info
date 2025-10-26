import { Material, MaterialSide } from 'chessops';
import { SquareSet } from 'chessops/squareSet';

export const capitalize = (s: string): string => s.substring(0, 1).toUpperCase() + s.substring(1);

export const strRepeat = (str: string, count: number): string => Array(count).fill(str).join('');

export const shiftLeft = (squares: SquareSet): SquareSet =>
  squares
    .diff(SquareSet.fromFile(0))
    .shr64(1)
    .union(squares.intersect(SquareSet.fromFile(0)).shl64(7));

export const shiftRight = (squares: SquareSet): SquareSet =>
  squares
    .diff(SquareSet.fromFile(7))
    .shl64(1)
    .union(squares.intersect(SquareSet.fromFile(7)).shr64(7));

export const shiftDown = (squares: SquareSet): SquareSet =>
  squares
    .diff(SquareSet.fromRank(0))
    .shr64(8)
    .union(squares.intersect(SquareSet.fromRank(0)).shl64(7 * 8));

export const shiftUp = (squares: SquareSet): SquareSet =>
  squares
    .diff(SquareSet.fromRank(7))
    .shl64(8)
    .union(squares.intersect(SquareSet.fromRank(7)).shr64(7 * 8));

export const materialSideToString = (side: MaterialSide): string =>
  strRepeat('K', side.king) +
  strRepeat('Q', side.queen) +
  strRepeat('R', side.rook) +
  strRepeat('B', side.bishop) +
  strRepeat('N', side.knight) +
  strRepeat('P', side.pawn);

const compareMaterialSide = (a: MaterialSide, b: MaterialSide): number => {
  if (a.size() !== b.size()) return a.size() - b.size();
  if (a.king !== b.king) return a.king - b.king;
  if (a.queen !== b.queen) return a.queen - b.queen;
  if (a.rook !== b.rook) return a.rook - b.rook;
  if (a.bishop !== b.bishop) return a.bishop - b.bishop;
  if (a.knight !== b.knight) return a.knight - b.knight;
  return a.pawn - b.pawn;
};

export const normalizeMaterial = (material: Material): Material =>
  compareMaterialSide(material.white, material.black) < 0 ? new Material(material.black, material.white) : material;
