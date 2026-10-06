import {useLayoutEffect} from 'react';
import {watchInputFillState} from '../utils/inputFillState';

export function InputFieldAppearance() {
  useLayoutEffect(() => {
    const root = document.getElementById('root');
    if (root) return watchInputFillState(root);
  }, []);
  return null;
}
