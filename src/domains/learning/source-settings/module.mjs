import { createSettings } from './service.mjs';
export const id='learning-source-settings';
export const client=true;
export function setup(context) {
  return createSettings(context);
}
