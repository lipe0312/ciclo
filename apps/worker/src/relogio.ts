// Relógio do servidor no fuso do app (America/Sao_Paulo, UTC−3). Neutro: Worker, API e MCP usam daqui.
const SP = 3 * 3600e3;
/** Data de hoje (YYYY-MM-DD) em São Paulo. */
export const hojeSP = () => new Date(Date.now() - SP).toISOString().slice(0, 10);
