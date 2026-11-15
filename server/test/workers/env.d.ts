/** El `env` que da `cloudflare:test` es `Cloudflare.Env`: aqui se le dice que es el del Worker (wrangler.toml). */
import type { Env as WorkerEnv } from '../../src/roomObject';

declare global {
  namespace Cloudflare {
    // Solo hereda: lo que hay en el env lo dice el Worker.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends WorkerEnv {}
  }
}
