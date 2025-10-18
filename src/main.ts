import { init, VNode, classModule, attributesModule, eventListenersModule } from 'snabbdom';

import { Ctrl } from './ctrl.js';
import { view } from './view.js';

const patch = init([classModule, attributesModule, eventListenersModule]);

export function start(element: Element) {
  let vnode: VNode | Element = element;
  let ctrl: Ctrl;

  const redraw = function () {
    vnode = patch(vnode, view(ctrl));
  };

  ctrl = new Ctrl(redraw);

  redraw();
}

window.addEventListener('DOMContentLoaded', () => {
  start(document.getElementById('main')!);
});
