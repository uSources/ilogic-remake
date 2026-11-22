/**
 * Lo que dan `env` y `exports` de `cloudflare:workers` en los tests: el `env` es `Cloudflare.Env` (aqui
 * se le dice que es el del Worker, wrangler.toml) y `exports.default` es el Worker de src/cloudflare/index.ts.
 */
import type * as WorkerModule from '../../src/cloudflare/index';
import type { Env as WorkerEnv } from '../../src/cloudflare/roomObject';

declare global {
  namespace Cloudflare {
    // Solo hereda: lo que hay en el env lo dice el Worker.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends WorkerEnv {}
    interface GlobalProps {
      mainModule: typeof WorkerModule;
    }
  }
}
