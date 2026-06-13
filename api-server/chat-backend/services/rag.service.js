// rag.service.js — TOLERANTE: auto-crea tablas si no existen
const db = require("../config/db");
const ai = require("../config/ai");
const { normaliza } = require("./nlp.engine");

let tablasListas = false;
async function asegurarTablas(){
  if (tablasListas) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS documentos_rag (
        id SERIAL PRIMARY KEY,
        titulo TEXT, fuente TEXT, contenido TEXT,
        tags TEXT[] DEFAULT '{}',
        creado_en TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS embeddings_doc (
        id SERIAL PRIMARY KEY,
        documento_id INT REFERENCES documentos_rag(id) ON DELETE CASCADE,
        chunk TEXT, vector TEXT
      );
    `);
    tablasListas = true;
  } catch(e){ console.warn("rag.asegurarTablas:", e.message); }
}

function tokens(s){ return normaliza(s).split(" ").filter(x=>x.length>2); }
function cos(a,b){ let s=0,na=0,nb=0; for(let i=0;i<a.length;i++){s+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];} return na&&nb?s/(Math.sqrt(na)*Math.sqrt(nb)):0; }

async function buscar(pregunta, k = 3) {
  await asegurarTablas();
  try {
    if (ai.enabled()) {
      try {
        const qv = await ai.embed(pregunta);
        if (qv){
          const r = await db.query(`SELECT e.documento_id, e.chunk, e.vector, d.titulo, d.fuente
            FROM embeddings_doc e JOIN documentos_rag d ON d.id=e.documento_id`);
          const scored = r.rows
            .map(row=>({...row, score: cos(qv, JSON.parse(row.vector||"[]"))}))
            .filter(x=>x.score>0.2).sort((a,b)=>b.score-a.score).slice(0,k);
          if (scored.length) return scored;
        }
      } catch(_){}
    }
    const qts = tokens(pregunta);
    if (!qts.length) return [];
    const r = await db.query(`SELECT id, titulo, fuente, contenido FROM documentos_rag`);
    return r.rows.map(d=>{
      const dts=tokens(d.titulo+" "+d.contenido);
      const hits=qts.filter(t=>dts.includes(t)).length;
      return {...d, chunk:d.contenido, score:hits/qts.length};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,k);
  } catch(e){
    console.warn("rag.buscar:", e.message);
    return [];
  }
}

async function ingest(titulo, fuente, contenido, tags = []) {
  await asegurarTablas();
  const r = await db.query(
    `INSERT INTO documentos_rag (titulo,fuente,contenido,tags) VALUES ($1,$2,$3,$4) RETURNING id`,
    [titulo, fuente, contenido, tags]);
  const docId = r.rows[0].id;
  const chunks = chunkText(contenido, 600);
  for (const c of chunks) {
    let vec = null;
    if (ai.enabled()) { try { vec = await ai.embed(c); } catch (_) {} }
    await db.query(
      `INSERT INTO embeddings_doc (documento_id, chunk, vector) VALUES ($1,$2,$3)`,
      [docId, c, vec ? JSON.stringify(vec) : null]);
  }
  return docId;
}
function chunkText(t,n){ const o=[]; let i=0; while(i<t.length){o.push(t.slice(i,i+n));i+=n;} return o; }

module.exports = { buscar, ingest, asegurarTablas };
