import { SquareSet } from 'chessops/squareSet';

export const capitalize = (s: string): string => s.substring(0, 1).toUpperCase() + s.substring(1);

export const strRepeat = (str: string, count: number): string => Array(count).fill(str).join('');

export const shiftLeft = (squares: SquareSet): SquareSet =>
  squares.diff(SquareSet.fromFile(0)).shr64(1).union(squares.intersect(SquareSet.fromFile(0)).shl64(7));

export const shiftRight = (squares: SquareSet): SquareSet =>
  squares.diff(SquareSet.fromFile(7)).shl64(1).union(squares.intersect(SquareSet.fromFile(7)).shr64(7));

export const shiftDown = (squares: SquareSet): SquareSet =>
  squares.diff(SquareSet.fromRank(0)).shr64(8).union(squares.intersect(SquareSet.fromRank(0)).shl64(7 * 8));

export const shiftUp = (squares: SquareSet): SquareSet =>
  squares.diff(SquareSet.fromRank(7)).shl64(8).union(squares.intersect(SquareSet.fromRank(7)).shr64(7 * 8));
