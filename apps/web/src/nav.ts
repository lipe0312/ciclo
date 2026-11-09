// Destinos de navegação. Barra inferior = PRINCIPAL; o resto fica em "Mais" (celular) e na barra lateral (computador).
export interface Dest { id: string; nm: string; icon: string }
export const PRINCIPAL: Dest[] = [
  { id: "hoje", nm: "Hoje", icon: "home" }, { id: "treino", nm: "Treino", icon: "dumb" }, { id: "diario", nm: "Diário", icon: "book" },
  { id: "comida", nm: "Comida", icon: "food" }, { id: "claude", nm: "Claude", icon: "chat" },
];
export const MAIS: Dest[] = [
  { id: "corpo", nm: "Corpo", icon: "body" }, { id: "academias", nm: "Academias", icon: "gym" }, { id: "perfil", nm: "Perfil", icon: "user" },
  { id: "conta", nm: "Conta", icon: "key" }, { id: "vida", nm: "Vida", icon: "grid" },
];
