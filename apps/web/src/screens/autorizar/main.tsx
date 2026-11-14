// #66 Entrada da página /autorizar (autorizar.html): só a tela de consentimento, sem a casca do app.
import { render } from "preact";
import "../../app.css";
import "./autorizar.css";
import { Autorizar } from "./index.tsx";

try { const t = localStorage.getItem("ciclo:theme"); if (t) document.documentElement.dataset.theme = JSON.parse(t); } catch { /* sem storage */ }
render(<Autorizar req={new URLSearchParams(location.search).get("req") ?? ""} />, document.getElementById("app")!);
