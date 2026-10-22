/** Measure intrinsic content, not the current (possibly manually enlarged) box.
 * scrollHeight includes the existing client height. Adding fractional borders to
 * that value can otherwise grow the control by a pixel on every observation.
 */
export function growTextareaToContent(element: HTMLTextAreaElement) {
  if (!element.clientWidth) return;
  const style = getComputedStyle(element);
  const currentHeight = Number.parseFloat(style.height) || 0;
  const border = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
  const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
  const previousHeight = element.style.height;
  let intrinsicHeight: number;
  try {
    element.style.height = 'auto';
    intrinsicHeight = element.scrollHeight;
  } finally {
    element.style.height = previousHeight;
  }
  const needed = Math.ceil(intrinsicHeight + (style.boxSizing === 'border-box' ? border : -padding));
  // Keep a larger manual height; repeated measurements have the same result.
  if (needed > currentHeight) element.style.height = `${needed}px`;
}
