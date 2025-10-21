export const capitalize = (s: string): string => s.substring(0, 1).toUpperCase() + s.substring(1);

export const strRepeat = (str: string, count: number): string => Array(count).fill(str).join('');
