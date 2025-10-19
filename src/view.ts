import { h, VNode, VNodes } from 'snabbdom';
import { Chessground as makeChessground } from '@lichess-org/chessground';

import { Ctrl, DEFAULT_FEN, relaxedParseFen } from './ctrl.js';
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
      sparePieces(ctrl, 'black'),
      h('div.cg-wrap', {
        hook: {
          insert: vnode =>
            ctrl.setGround(
              makeChessground(vnode.elm as HTMLElement, {
                fen: DEFAULT_FEN,
                autoCastle: false,
                trustAllEvents: true,
                movable: {
                  free: true,
                  color: 'both',
                  showDests: true,
                },
                selectable: {
                  enabled: false,
                },
                draggable: {
                  deleteOnDropOff: true,
                },
                animation: {
                  enabled: ctrl.wantsReducedMotion(),
                },
                drawable: {
                  defaultSnapToValidMove: false,
                },
                events: {
                  move: ctrl.onCgMove.bind(ctrl),
                  dropNewPiece: ctrl.onCgDropNewPiece.bind(ctrl),
                  change: ctrl.onCgChange.bind(ctrl),
                },
              }),
            ),
          destroy: () => ctrl.setGround(undefined),
        },
      }),
      sparePieces(ctrl, 'white'),
      h(
        'form',
        {
          on: {
            submit: e => {
              e.preventDefault();
              const formData = new FormData(e.target as HTMLFormElement);
              relaxedParseFen(formData.get('fen') as string).map(setup => ctrl.push(setup));
            },
          },
        },
        [
          h('input', {
            attrs: {
              type: 'text',
              placeholder: DEFAULT_FEN,
              name: 'fen',
            },
            props: {
              value: ctrl.getFen() == DEFAULT_FEN ? '' : ctrl.getFen(),
            },
            on: {
              change: e => {
                const input = e.target as HTMLInputElement;
                input.setCustomValidity(
                  relaxedParseFen(input.value).unwrap(
                    _ => '',
                    _ => 'Invalid FEN',
                  ),
                );
              },
            },
          }),
          h('button', { attrs: { type: 'submit' } }, 'Set FEN'),
        ],
      ),
    ],
    h('div'),
  );
};

const sparePieces = (ctrl: Ctrl, color: Color): VNode => {
  return h(
    `div.spare.${color == 'white' ? 'bottom' : 'top'}`,
    ROLES.reduce(
      (acc, role) => [
        ...acc,
        h(
          `piece.${role}.${color}`,
          {
            on: {
              touchstart: e => ctrl.onSpareMouseDown(e, { color, role }),
              mousedown: e => ctrl.onSpareMouseDown(e, { color, role }),
            },
          },
          [],
        ),
        ' ',
      ],
      [],
    ),
  );
};

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
};
