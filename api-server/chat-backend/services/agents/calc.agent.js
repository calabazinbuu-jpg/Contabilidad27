module.exports = {
  nombre:"calc",
  async ejecutar({ parsed }) {
    const { a, b, op, resultado } = parsed.aritm;
    const fmt = (n) => Number(n).toLocaleString("es-PE", { maximumFractionDigits: 4 });
    const signos = { "+":"más", "-":"menos", "*":"por", "x":"por", "×":"por", "/":"entre" };
    return {
      agente:"calc", intent:"aritmetica", datos:{a,b,op,resultado},
      respuesta: `🧮 **${fmt(a)} ${op} ${fmt(b)} = ${fmt(resultado)}**\n_(${fmt(a)} ${signos[op]||op} ${fmt(b)})_`
    };
  }
};
