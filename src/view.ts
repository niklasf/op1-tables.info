import { h, VNode } from 'snabbdom';
import { Chessground as makeChessground } from '@lichess-org/chessground';

import {
  Ctrl,
  DEFAULT_FEN,
  EnrichedTablebaseMove,
  TablebaseResponse,
  SimpleCategory,
  relaxedParseFen,
} from './ctrl.js';
import { capitalize } from './util.js';
import { Color, opposite, parseUci, ROLES, NormalMove } from 'chessops';
import { Setup } from 'chessops/setup';
import { makeFen, parseFen } from 'chessops/fen';
import { flipHorizontal, flipVertical, transformSetup } from 'chessops/transform';

type MaybeVNode = VNode | string | undefined;

export const view = (ctrl: Ctrl): VNode => {
  return layout(
    h(
      'a',
      {
        attrs: {
          href: '/',
        },
        on: {
          click: primaryClick(() => ctrl.push(parseFen(DEFAULT_FEN).unwrap())),
        },
      },
      'Op1 endgame tablebase',
    ),
    [
      h('div#stm-toolbar', [
        h('div.btn-group', [turnButton(ctrl, 'white'), turnButton(ctrl, 'black')]),
        h(
          'div.btn-group',
          h(
            `button.btn${ctrl.editMode ? '.active' : ''}`,
            {
              attrs: { title: 'Edit mode: Do not switch sides when playing moves on the board (e)' },
              on: { click: () => ctrl.toggleEditMode() },
            },
            icon(ctrl.editMode ? 'lock' : 'lock-open'),
          ),
        ),
      ]),
      sparePieces(ctrl, ctrl.flipped ? 'white' : 'black', 'top'),
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
                  enabled: !ctrl.wantsReducedMotion(),
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
      sparePieces(ctrl, ctrl.flipped ? 'black' : 'white', 'bottom'),
      h('div#board-toolbar', [
        h(
          'div.btn-group',
          h(
            `button.btn${ctrl.flipped ? '.active' : ''}`,
            { attrs: { title: 'Flip board (f)' }, on: { click: () => ctrl.toggleFlipped() } },
            icon('rotate'),
          ),
        ),
        h('div.btn-group', setupButton(ctrl, ctrl.clearedBoardSetup(), 'eraser', 'Clear board')),
        h('div.btn-group', [
          setupButton(ctrl, ctrl.swappedColorsSetup(), 'black-white', 'Swap colors'),
          setupButton(ctrl, transformSetup(ctrl.setup, flipHorizontal), 'horizontal', 'Mirror horizontally'),
          setupButton(ctrl, transformSetup(ctrl.setup, flipVertical), 'vertical', 'Mirror vertically'),
        ]),
      ]),
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
        h('div.btn-group', [
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
          h('button.btn', { attrs: { type: 'submit' } }, 'Set FEN'),
        ]),
      ),
    ],
    ctrl.tablebaseResponse.sync ? tablebaseResponse(ctrl, ctrl.tablebaseResponse.sync) : [spinner()],
  );
};

const tablebaseResponse = (ctrl: Ctrl, res: TablebaseResponse): MaybeVNode[] => {
  if (res.error)
    return [
      h('h2.panel', res.error.title),
      h('p.panel', [res.error.message,
        res.error.retry
          ? h('div.btn-group', [h('a.btn', { attrs: { href: '/?fen=' + ctrl.getFen().replace(/ /g, '_') } }, 'Retry')])
          : undefined,
      ])
    ];

  const titleSuffix = res.pos?.dtc
    ? ` with DTC ${Math.abs(res.pos.dtc)}`
    : res.pos?.dtz
      ? ` with DTZ ${Math.abs(res.pos.dtz)}`
      : res.pos?.dtm
        ? ` with DTM ${Math.abs(res.pos.dtm)}`
        : '';

  const title = res.pos?.checkmate
    ? h('h2.panel', 'Checkmate')
    : res.pos?.stalemate
      ? h('h2.panel', 'Stalemate')
      : res.pos?.insufficient_material
        ? h('h2.panel', 'Insufficient material')
        : h('h2.panel', [capitalize(res.pos?.simpleCategory || 'unknown'), titleSuffix]);

  const veryWeakSide = ctrl.veryWeakSide();

  return [
    title,
    tablebaseMoves(ctrl, res.moves, 'win', ctrl.setup.turn),
    ctrl.setup.board.occupied.size() > 8 ? h('p.panel', 'The tablebase only covers positions with up to 8 pieces.') : undefined,
    ctrl.setup.board.occupied.size() == 8 && veryWeakSide ? h('p.panel', `The 8-piece tablebase excludes positions where one side is too weak. ${capitalize(veryWeakSide)} does not have more than 1 pawn of material.`) : undefined,
    tablebaseMoves(ctrl, res.moves, 'unknown', undefined),
    tablebaseMoves(ctrl, res.moves, 'draw', undefined),
    tablebaseMoves(ctrl, res.moves, 'loss', opposite(ctrl.setup.turn)),
  ];
};

const tablebaseMoves = (
  ctrl: Ctrl,
  moves: EnrichedTablebaseMove[],
  moveCategory: SimpleCategory,
  winner?: Color,
): VNode | undefined => {
  moves = moves.filter(move => move.simpleCategory === moveCategory);
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
                : `${capitalize(moveCategory)} with DTC ${Math.abs(move.dtc)}`,
            ),
          );
        if (move.dtz) badges.push(' ', h(`span.${winner}`, move.zeroing ? 'Zeroing' : `DTZ ${Math.abs(move.dtz)}`));
      }
      return h(
        'a',
        {
          attrs: {
            href: '/?fen=' + move.fen.replace(/ /g, '_'),
            title: move === ctrl.tablebaseResponse.sync?.moves[0] ? 'Play best move (space)' : '',
          },
          on: {
            click: primaryClick(() => {
              ctrl.pushMove(parseUci(move.uci)!);
              ctrl.setHovering(undefined);
            }),
            mouseover: () => ctrl.setHovering(parseUci(move.uci) as NormalMove),
            mouseleave: () => ctrl.setHovering(undefined),
          },
        },
        [move.san, ...badges],
      );
    }),
  );
};

const sparePieces = (ctrl: Ctrl, color: Color, position: 'top' | 'bottom'): VNode => {
  return h(
    `div.spare.${position}`,
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

const turnButton = (ctrl: Ctrl, color: Color): VNode => {
  const setup = {
    ...ctrl.setup,
    turn: color,
  };
  return h(
    `a.btn${color === ctrl.setup.turn ? '.active' : ''}`,
    {
      attrs: {
        href: '/?fen=' + makeFen(setup).replace(/ /g, '_'),
        title: `Set ${color} to move (${color.substring(0, 1)})`,
      },
      on: {
        click: primaryClick(() => ctrl.push(setup)),
      },
    },
    `${capitalize(color)} to move`,
  );
};

const setupButton = (ctrl: Ctrl, setup: Setup, i: string, title: string): VNode =>
  h(
    'a.btn',
    {
      attrs: {
        href: '/?fen=' + makeFen(setup).replace(/ /g, '_'),
        title,
      },
      on: {
        click: primaryClick(() => ctrl.push(setup)),
      },
    },
    icon(i),
  );

const layout = (title: VNode, left: MaybeVNode[], right: MaybeVNode[]): VNode => {
  return h('body', [
    h('div.left-side', [h('div.inner', [h('h1', [title]), ...left])]),
    h('div.right-side', [h('div.inner', right)]),
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

const icon = (name: string): VNode => h(`span.icon.icon-${name}`);

const spinner = (): VNode => h('div.spinner', [h('div.double-bounce1'), h('div.double-bounce2')]);

const primaryClick = (f: (e: MouseEvent) => void): ((e: MouseEvent) => void) => {
  return (e: MouseEvent) => {
    if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey || e.button !== 0) return;
    e.preventDefault();
    f(e);
  };
};
