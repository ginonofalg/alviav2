import pg from "pg";
import fs from "fs";
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function escapeSQL(val: any): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'::timestamp`;
  if (Array.isArray(val)) {
    return `ARRAY[${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(",")}]`;
  }
  if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function main() {
  const client = await pool.connect();
  try {
    // 1. Population briefs
    const briefs = await client.query("SELECT * FROM population_briefs");
    const briefSQLs: string[] = [];
    for (const row of briefs.rows) {
      const cols = Object.keys(row);
      const vals = cols.map(c => {
        const v = row[c];
        if (c === "brief") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
        return escapeSQL(v);
      });
      briefSQLs.push(`INSERT INTO population_briefs (${cols.join(",")}) VALUES (${vals.join(",")}) ON CONFLICT (id) DO NOTHING;`);
    }
    fs.writeFileSync("/tmp/prod_briefs.sql", briefSQLs.join("\n---SPLIT---\n"));
    console.log(`Exported ${briefSQLs.length} briefs`);

    // 2. Personas
    const personas = await client.query("SELECT * FROM personas");
    const personaSQLs: string[] = [];
    for (const row of personas.rows) {
      const cols = Object.keys(row);
      const vals = cols.map(c => {
        const v = row[c];
        if (c === "traits" || c === "topics_to_avoid" || c === "biases") {
          if (!v || v.length === 0) return "'{}'";
          return `ARRAY[${v.map((x: string) => `'${x.replace(/'/g, "''")}'`).join(",")}]`;
        }
        return escapeSQL(v);
      });
      personaSQLs.push(`INSERT INTO personas (${cols.join(",")}) VALUES (${vals.join(",")}) ON CONFLICT (id) DO NOTHING;`);
    }
    fs.writeFileSync("/tmp/prod_personas.sql", personaSQLs.join("\n---SPLIT---\n"));
    console.log(`Exported ${personaSQLs.length} personas`);

    // 3. Simulation runs
    const simRuns = await client.query("SELECT * FROM simulation_runs");
    const simSQLs: string[] = [];
    for (const row of simRuns.rows) {
      const cols = Object.keys(row);
      const vals = cols.map(c => {
        const v = row[c];
        if (c === "persona_ids") {
          if (!v || v.length === 0) return "'{}'";
          return `ARRAY[${v.map((x: string) => `'${x}'`).join(",")}]`;
        }
        if (c === "progress") return v ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : "NULL";
        return escapeSQL(v);
      });
      simSQLs.push(`INSERT INTO simulation_runs (${cols.join(",")}) VALUES (${vals.join(",")}) ON CONFLICT (id) DO NOTHING;`);
    }
    fs.writeFileSync("/tmp/prod_simruns.sql", simSQLs.join("\n---SPLIT---\n"));
    console.log(`Exported ${simRuns.rows.length} simulation runs`);

    // 4. Simulated respondents
    const respondents = await client.query("SELECT * FROM respondents WHERE is_simulated = true");
    const respSQLs: string[] = [];
    for (const row of respondents.rows) {
      const cols = Object.keys(row);
      const vals = cols.map(c => {
        const v = row[c];
        if (c === "profile_fields") return v ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : "NULL";
        return escapeSQL(v);
      });
      respSQLs.push(`INSERT INTO respondents (${cols.join(",")}) VALUES (${vals.join(",")}) ON CONFLICT (id) DO NOTHING;`);
    }
    fs.writeFileSync("/tmp/prod_respondents.sql", respSQLs.join("\n---SPLIT---\n"));
    console.log(`Exported ${respondents.rows.length} simulated respondents`);

    // 5. Simulated sessions
    const sessions = await client.query("SELECT * FROM interview_sessions WHERE is_simulated = true");
    const sessSQLs: string[] = [];
    for (const row of sessions.rows) {
      const cols = Object.keys(row);
      const vals = cols.map(c => {
        const v = row[c];
        const jsonbCols = ["live_transcript","last_barbara_guidance","question_states","question_summaries","review_ratings","review_comments","performance_metrics","additional_questions","transcription_quality_metrics","alvia_summary","barbara_session_summary","barbara_guidance_log","guidance_adherence_summary"];
        if (jsonbCols.includes(c)) return v ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : "NULL";
        if (c === "review_flags") {
          if (!v || v.length === 0) return "NULL";
          return `ARRAY[${v.map((x: string) => `'${x.replace(/'/g, "''")}'`).join(",")}]`;
        }
        return escapeSQL(v);
      });
      sessSQLs.push(`INSERT INTO interview_sessions (${cols.join(",")}) VALUES (${vals.join(",")}) ON CONFLICT (id) DO NOTHING;`);
    }
    fs.writeFileSync("/tmp/prod_sessions.sql", sessSQLs.join("\n---SPLIT---\n"));
    console.log(`Exported ${sessions.rows.length} simulated sessions`);

    // 6. Segments
    const sessionIds = sessions.rows.map((r: any) => r.id);
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map((_: any, i: number) => `$${i + 1}`).join(",");
      const segments = await client.query(
        `SELECT * FROM segments WHERE session_id IN (${placeholders})`,
        sessionIds
      );
      const segSQLs: string[] = [];
      for (const row of segments.rows) {
        const cols = Object.keys(row);
        const vals = cols.map(c => {
          const v = row[c];
          if (c === "key_quotes" || c === "extracted_values") return v ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : "NULL";
          if (c === "summary_bullets" || c === "quality_flags") {
            if (!v || v.length === 0) return "NULL";
            return `ARRAY[${v.map((x: string) => `'${x.replace(/'/g, "''")}'`).join(",")}]`;
          }
          return escapeSQL(v);
        });
        segSQLs.push(`INSERT INTO segments (${cols.join(",")}) VALUES (${vals.join(",")}) ON CONFLICT (id) DO NOTHING;`);
      }
      fs.writeFileSync("/tmp/prod_segments.sql", segSQLs.join("\n---SPLIT---\n"));
      console.log(`Exported ${segments.rows.length} segments`);
    }

    console.log("Export complete! Files in /tmp/prod_*.sql");
  } finally {
    client.release();
    await pool.end();
  }
}

main();
