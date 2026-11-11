// Gera o par de chaves VAPID do Web Push (descanso com a tela bloqueada). Rode UMA vez e guarde a privada como secret:
//   node scripts/gen-vapid.mjs
//   npx wrangler secret put VAPID_PRIVATE_KEY   (cole a privada)   ·   npx wrangler secret put VAPID_PUBLIC_KEY   (cole a pública)
// Local: ponha as duas linhas em apps/worker/.dev.vars. Nunca versione a chave privada.
const b64u = (b) => Buffer.from(b).toString("base64url");
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
const jwk = await crypto.subtle.exportKey("jwk", privateKey);
console.log(`VAPID_PUBLIC_KEY=${b64u(pub)}\nVAPID_PRIVATE_KEY=${jwk.d}`);
