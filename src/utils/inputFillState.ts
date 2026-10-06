/** Content presence only: never implies validation, completion or a saved record. */
export function inputFillState(value: string): 'empty' | 'filled' {
  return value.trim().length ? 'filled' : 'empty';
}

/** UI-only attributes. No values are stored, sent or modified. */
export function watchInputFillState(root: HTMLElement): () => void {
  const selector = 'input:not([type]),input[type=""],input[type="text"],input[type="number"],input[type="date"],input[type="time"],input[type="datetime-local"],input[type="month"],input[type="week"],input[type="email"],input[type="tel"],input[type="url"],input[type="password"],textarea,select';
  const controls = new Set<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
  const update = (field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
    const state = inputFillState(field.value);
    if (field.dataset.inputFill !== state) field.dataset.inputFill = state;
  };
  const discover = (node: Element) => {
    if (node.matches(selector)) controls.add(node as HTMLInputElement);
    for (const field of node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)) controls.add(field);
  };
  const refresh = () => {
    for (const field of controls) {
      if (!root.contains(field) || !field.matches(selector)) { controls.delete(field); delete field.dataset.inputFill; }
      else update(field);
    }
  };
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); }); };
  const onInput = (event: Event) => {
    if (event.target instanceof Element && event.target.matches(selector)) {
      const field = event.target as HTMLInputElement; controls.add(field); update(field);
    }
    // React may normalize the value after the capture listener.
    schedule();
  };
  discover(root); refresh();
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) if (node instanceof Element) discover(node);
      } else if (record.target instanceof Element && record.target.matches(selector)) controls.add(record.target as HTMLInputElement);
    }
    schedule();
  });
  observer.observe(root, {childList:true,subtree:true,attributes:true,attributeFilter:['value','selected','type']});
  root.addEventListener('input', onInput, true);
  root.addEventListener('change', onInput, true);
  root.addEventListener('reset', schedule, true);
  // Property-only updates (React textarea values, autofill) need no DOM mutation.
  // Check cached controls, only while visible; do not intercept native setters.
  const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 500);
  document.addEventListener('visibilitychange', schedule);
  return () => {
    observer.disconnect(); window.clearInterval(timer); cancelAnimationFrame(frame);
    root.removeEventListener('input', onInput, true); root.removeEventListener('change', onInput, true); root.removeEventListener('reset', schedule, true);
    document.removeEventListener('visibilitychange', schedule);
    for (const field of controls) delete field.dataset.inputFill;
    controls.clear();
  };
}
