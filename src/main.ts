import { init, VNode, classModule, attributesModule, propsModule, eventListenersModule } from 'snabbdom';

import { Ctrl } from './ctrl.js';
import { view } from './view.js';

const patch = init([classModule, attributesModule, propsModule, eventListenersModule]);

const start = (element: Element) => {
  let vnode: VNode | Element = element;
  let ctrl: Ctrl;

  const redraw = function () {
    vnode = patch(vnode, view(ctrl));
  };

  ctrl = new Ctrl(redraw);

  redraw();

  console.log('op1-tables.info is free/libre open source software! https://github.com/niklasf/op1-tables.info');
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    start(document.body);
  });
} else {
  start(document.body);
}
