/**
 * License Server connection settings.
 *
 * Normally these come from .env:
 *   LICENSE_SERVER_URL    https://your-license-server.com
 *   LICENSE_PRODUCT_SLUG  the product's slug on the License Server
 *                         (comma-separated if the product has slug aliases;
 *                         the first one is sent as productSlug)
 *   LICENSE_PUBLIC_KEY    "publicKey" from GET /api/v2/license/public-key
 *                         (32 raw bytes, base64) — or its PEM
 *   LICENSE_KEY_ID        "keyId" from the same endpoint
 *
 * A vendor build can bake the values in here instead. A filled-in value below
 * always wins over .env, so a distributed copy cannot be re-pointed at another
 * server or key by editing .env.
 *
 * ONLY the public key belongs here. The License Server's private signing key
 * must never be placed anywhere in this project.
 */
export const BAKED_LICENSE_CONFIG = {
  serverUrl: '',
  productSlug: '',
  publicKey: '',
  keyId: '',
};
