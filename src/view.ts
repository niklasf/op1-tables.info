import { h, VNode, VNodes } from 'snabbdom';
import { Chessground } from 'chessground';

import { Ctrl } from './ctrl.js';
import { Color, ROLES } from 'chessops';

export function view(ctrl: Ctrl): VNode {
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
          insert: viewChessground,
          postpatch: viewChessground,
        },
      }),
      sparePieces('white'),
    ],
    h('div'),
  );
}

function sparePieces(color: Color): VNode {
  return h(`div.spare.${color == 'white' ? 'bottom' : 'top'}`,
    ROLES.map(role => h(`piece.${role}.${color}`, [])),
  );
}

function layout(title: VNode, left: VNodes, right: VNode): VNode {
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

function viewChessground(cgWrap: VNode) {
  const el = cgWrap.elm as HTMLElement;
  const cg = Chessground(el, {});
}
