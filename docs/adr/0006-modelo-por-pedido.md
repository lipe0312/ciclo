# ADR-0006 · Modelo do Claude por pedido
**Status:** aceito

**Decisão:** cada pedido tem um tier (`haiku`, `sonnet` ou `opus`), definido pela biblioteca de pedidos ou pelo classificador, e ajustável por você. As skills declaram `model:`. A automação roda `claude -p --model <tier>`.

**Por quê:** a assinatura tem limites de uso; registrar comida não precisa do modelo mais forte, mas dor e revisão precisam.
