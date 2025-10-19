import { h, VNode, VNodes } from 'snabbdom';
import { Chessground as makeChessground } from '@lichess-org/chessground';

import { Ctrl, DEFAULT_FEN } from './ctrl.js';
import { Color, ROLES } from 'chessops';

export const view = (ctrl: Ctrl): VNode => {
  return layout(
    h(
      'a',
      {
        attrs: {
          href: '/',
        },
      },
      'Op1 endgame tablebase',
    ),
    [
      sparePieces('black'),
      h('div.cg-wrap', {
        hook: {
          insert: vnode =>
            ctrl.setChessground(
              makeChessground(vnode.elm as HTMLElement, {
                fen: ctrl.getFen(),
                events: {
                  move: ctrl.onChessgroundMove.bind(ctrl),
                  dropNewPiece: ctrl.onChessgroundDropNewPiece.bind(ctrl),
                  change: ctrl.onChessgroundChange.bind(ctrl),
                },
              }),
            ),
          destroy: () => ctrl.setChessground(undefined),
        },
      }),
      sparePieces('white'),
      h('input', {
        attrs: {
          type: 'text',
          placeholder: DEFAULT_FEN,
          value: ctrl.getFen(),
        },
      })
    ],
    h('div'),
  );
};

const sparePieces = (color: Color): VNode => {
  return h(
    `div.spare.${color == 'white' ? 'bottom' : 'top'}`,
    ROLES.map(role => h(`piece.${role}.${color}`, [])),
  );
}

const layout = (title: VNode, left: VNodes, right: VNode): VNode => {
  return h('div', [
    h('div.left-side', [h('div.inner', [h('h1', [title]), ...left])]),
    h('div.right-side', [h('div.inner', [right])]),
    h('footer', [
      h('div.inner', [
        h('p', [
          "DTC provided by Marc Bourzutschky's op1 tables, delivered via a ",
          h(
            'a',
            {
              attrs: {
                href: 'https://github.com/lichess-org/op1',
              },
            },
            'public API hosted by lichess.org',
          ),
          '.',
        ]),
        h('p', [
          h(
            'a',
            {
              attrs: {
                href: 'https://github.com/lichess-org/op1-tables',
              },
            },
            'GitHub',
          ),
          '.',
        ]),
      ]),
    ]),
  ]);
}
