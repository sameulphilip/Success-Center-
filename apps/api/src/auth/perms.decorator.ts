import { SetMetadata } from '@nestjs/common';

export const PERMS_KEY = 'required_perms';
export const RequirePerms = (...perms: string[]) =>
  SetMetadata(PERMS_KEY, perms);
