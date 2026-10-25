import type { Config } from "tailwindcss";

// Marca Contaya (misma paleta que la presentación comercial)
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tinta: "#12303B",   // azul petróleo (oscuro)
        hoja: "#F3F6F4",    // fondo claro
        verde: "#1F8A70",   // validado / acción
        sol: "#F2B33D",     // acento
        gris: "#5B7178",
        linea: "#D9E3E1",
      },
      fontFamily: {
        display: ["Rubik", "Arial", "sans-serif"],
        body: ["'Nunito Sans'", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
