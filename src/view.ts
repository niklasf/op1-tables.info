import { h, VNode } from 'snabbdom';
import { Chessground } from 'chessground';

import { Ctrl } from './ctrl.js';

export function view(ctrl: Ctrl): VNode {
  return h('div', [
    h('h1', 'Hello world'),
    h('div.cg-wrap', {
      hook: {
        insert: viewChessground,
        postpatch: viewChessground
      }
    })
  ]);
}

function viewChessground(cgWrap: VNode) {
  const el = cgWrap.elm as HTMLElement;
  const cg = Chessground(el, {});
}
