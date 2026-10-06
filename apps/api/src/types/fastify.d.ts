import type { Scope } from '../lib/scoping.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Заполняется хуком `requireAuth`. Через `getAuth(request)` — уже без undefined. */
    authContext?: {
      userId: string;
      sessionId: string;
      scope: Scope;
    };
  }
}
