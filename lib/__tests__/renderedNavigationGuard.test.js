import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import {
  BusinessWebRouteProvider,
  useBusinessWebUnsavedChanges,
} from '../../components/business-web/BusinessWebRouteContext';
import { hasUnsavedEdits } from '../network/unsavedEdits';

function Form({ dirty }) {
  useBusinessWebUnsavedChanges(dirty);
  return createElement('span', null, dirty ? 'edited' : 'saved');
}

test('rendered forms retain navigation and PWA protection until the last draft is saved', async () => {
  const previousWindow = globalThis.window;
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  let guard = null;
  const onGuardChange = (value) => {
    guard = value;
  };
  let tree;
  const view = (first, second) =>
    createElement(
      BusinessWebRouteProvider,
      { onGuardChange },
      createElement(Form, { key: 'a', dirty: first }),
      createElement(Form, { key: 'b', dirty: second })
    );
  try {
    await act(async () => {
      tree = create(view(true, true));
    });
    expect(guard?.isDirty).toBe(true);
    expect(hasUnsavedEdits()).toBe(true);
    await act(async () => {
      tree.update(view(false, true));
    });
    expect(guard?.isDirty).toBe(true);
    expect(hasUnsavedEdits()).toBe(true);
    await act(async () => {
      tree.update(view(false, false));
    });
    expect(guard).toBeNull();
    expect(hasUnsavedEdits()).toBe(false);
  } finally {
    if (tree)
      await act(async () => {
        tree.unmount();
      });
    globalThis.window = previousWindow;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
