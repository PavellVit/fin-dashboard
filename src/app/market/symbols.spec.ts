import { SYMBOLS } from './symbols';

it('has 50 unique symbols, the first two as in the task', () => {
  expect(new Set(SYMBOLS).size).toBe(50);
  expect(SYMBOLS.slice(0, 2)).toEqual(['ALFA', 'BETA']);
});
