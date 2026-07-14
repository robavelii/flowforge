import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes and verifies passwords with argon2id', async () => {
    const hash = await service.hash('Password123!@#');
    expect(hash).not.toContain('Password123!@#');
    expect(await service.verify(hash, 'Password123!@#')).toBe(true);
    expect(await service.verify(hash, 'wrong-password')).toBe(false);
  });
});
