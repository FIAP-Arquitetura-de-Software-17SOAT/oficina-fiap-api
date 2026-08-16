import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const tokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  };
  let controller: AuthController;
  let service: {
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };

  beforeEach(() => {
    service = {
      login: jest.fn().mockResolvedValue(tokens),
      refresh: jest.fn().mockResolvedValue(tokens),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    controller = new AuthController(service as never);
  });

  it('passes login credentials to the authentication service', async () => {
    const dto = { email: 'admin@example.com', password: 'correct-password' };

    await expect(controller.login(dto)).resolves.toEqual(tokens);
    expect(service.login).toHaveBeenCalledWith(dto);
  });

  it('reads refreshToken from the refresh request body', async () => {
    await expect(
      controller.refresh({ refreshToken: tokens.refreshToken }),
    ).resolves.toEqual(tokens);

    expect(service.refresh).toHaveBeenCalledWith(tokens.refreshToken);
  });

  it('reads refreshToken from the logout request body', async () => {
    await expect(
      controller.logout({ refreshToken: tokens.refreshToken }),
    ).resolves.toBeUndefined();

    expect(service.logout).toHaveBeenCalledWith(tokens.refreshToken);
  });
});
