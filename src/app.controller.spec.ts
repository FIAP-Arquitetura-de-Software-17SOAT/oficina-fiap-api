import { AppController } from './app.controller';

describe('AppController', () => {
  it('health responde com status ok', () => {
    expect(new AppController().health()).toEqual({ status: 'ok' });
  });
});
