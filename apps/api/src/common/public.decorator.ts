import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'devascent:isPublic';

/** Every route is private by default; only routes marked with @Public() answer without a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
