// Leaflet sem @types (dependência a menos): só o que o mapa usa, tipado solto.
declare module "leaflet" {
  export const map: any;
  export const tileLayer: any;
  export const marker: any;
  export const divIcon: any;
}
