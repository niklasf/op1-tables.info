import { h, VNode, VNodes } from 'snabbdom';
import { Chessground as makeChessground } from '@lichess-org/chessground';

import { Ctrl, DEFAULT_FEN, EnrichedTablebaseMove, relaxedParseFen } from './ctrl.js';
import { Color, opposite, ROLES } from 'chessops';

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
    h(
      'div',
      ctrl.tablebaseResponse.sync
        ? [
            ctrl.tablebaseResponse.sync.error,
            tablebaseMoves(
              ctrl.tablebaseResponse.sync.moves,
              'Win',
              ['loss', 'syzygy-loss', 'maybe-loss', 'blessed-loss'],
              ctrl.setup.turn,
            ),
            tablebaseMoves(ctrl.tablebaseResponse.sync.moves, '', ['unknown'], undefined),
            tablebaseMoves(ctrl.tablebaseResponse.sync.moves, '', ['draw'], undefined),
            tablebaseMoves(
              ctrl.tablebaseResponse.sync.moves,
              'Loss',
              ['cursed-win', 'maybe-win', 'syzygy-win', 'win'],
              opposite(ctrl.setup.turn),
            ),
          ]
        : 'Loading ...',
    ),
  );
};

const tablebaseMoves = (
  moves: EnrichedTablebaseMove[],
  dtcPrefix: string,
  categories: LilaTablebaseCategory[],
  winner?: Color,
): VNode | undefined => {
  moves = moves.filter(move => categories.includes(move.category));
  if (!moves.length) return;
  return h(
    'div.moves',
    moves.map(move => {
      const badges = [];
      if (move.category === 'unknown') badges.push(' ', h('span.unknown', 'Unknown'));
      if (move.checkmate) badges.push(' ', h(`span.${winner}`, 'Checkmate'));
      else if (move.stalemate) badges.push(' ', h('span.draw', 'Stalemate'));
      else if (move.insufficient_material) badges.push(' ', h('span.draw', 'Insufficient material'));
      else if (move.category === 'draw') badges.push(' ', h('span.draw', 'Draw'));
      else {
        if (move.dtm) badges.push(' ', h(`span.${winner}`, `DTM ${Math.abs(move.dtm)}`));
        if (move.dtc)
          badges.push(
            ' ',
            h(
              `span.${winner}`,
              move.san.includes('=') || move.san.includes('x')
                ? 'Conversion'
                : `${dtcPrefix} with DTC ${Math.abs(move.dtc)}`,
            ),
          );
        if (move.dtz) badges.push(' ', h(`span.${winner}`, move.zeroing ? 'Zeroing' : `DTZ ${Math.abs(move.dtz)}`));
      }
      return h('a', { attrs: { href: '/?fen=' + move.fen.replace(/ /g, '_') } }, [move.san, ...badges]);
    }),
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
          "8-piece DTC via Marc Bourzutschky's op1 tables. 7-piece ",
          ...dtz50(),
          " via Ronald de Man's Syzygy tables. API hosted by lichess.org.",
        ]),
        h('p', [
          h(
            'a',
            {
              attrs: {
                href: 'https://lichess.org/api#tag/Tablebase',
              },
            },
            'Tablebase API',
          ),
          '. ',
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

const dtz50 = (): Array<string | VNode> => ['DTZ', h('sub', '50'), '′′'];
