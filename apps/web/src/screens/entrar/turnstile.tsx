// #56 Turnstile (Cloudflare, ADR-0012): só aparece quando o servidor tem a chave e pede (convite ou depois de 3 falhas).
// O script vem de challenges.cloudflare.com (liberado na CSP), carregado sob demanda; nada no bundle e nada inline.
import { useEffect, useRef } from "preact/hooks";

type Api = { render(el: HTMLElement, o: Record<string, unknown>): string; remove(id: string): void };
declare global { interface Window { turnstile?: Api } }

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let carregando: Promise<Api> | null = null;
function carregar(): Promise<Api> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  carregando ??= new Promise<Api>((ok, erro) => {
    const s = document.createElement("script");
    s.src = SRC; s.async = true;
    s.onload = () => (window.turnstile ? ok(window.turnstile) : erro(new Error("turnstile")));
    s.onerror = () => { carregando = null; erro(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return carregando;
}

/** Widget do Turnstile. O token vale uma vez: quem usa remonta o componente (key) depois de cada tentativa. */
export function Turnstile({ siteKey, onToken, onErro }: { siteKey: string; onToken: (t: string) => void; onErro: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | null = null, vivo = true;
    carregar().then((t) => {
      if (!vivo || !el.current) return;
      id = t.render(el.current, {
        sitekey: siteKey, action: "auth", theme: "auto", size: "flexible", language: "pt-br",
        callback: (tok: string) => onToken(tok), "expired-callback": () => onToken(""), "error-callback": () => { onToken(""); onErro(); },
      });
    }).catch(onErro);
    return () => { vivo = false; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey]);
  return <div class="entrar-robo" ref={el} aria-label="Verificação contra robôs" />;
}
