import { h, VNode } from 'snabbdom';

import { Ctrl } from './ctrl.js';

export function view(ctrl: Ctrl): VNode {
  return h('div', [
    h('h1', 'Hello world'),
  ]);
}
