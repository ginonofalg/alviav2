import pg from "pg";
const { Pool } = pg;

const devPool = new Pool({ connectionString: process.env.DATABASE_URL });
const prodPool = new Pool({ connectionString: process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL });

async function migrate() {
  const devClient = await devPool.connect();
  const prodClient = await prodPool.connect();

  try {
    console.log("Starting migration from dev to production...");

    // 1. Population briefs
    const briefs = await devClient.query("SELECT * FROM population_briefs");
    console.log(`Found ${briefs.rows.length} population briefs`);
    for (const row of briefs.rows) {
      await prodClient.query(
        `INSERT INTO population_briefs (id, project_id, research_prompt, additional_context, brief, confidence, created_at, is_ungrounded)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.project_id, row.research_prompt, row.additional_context, row.brief, row.confidence, row.created_at, row.is_ungrounded]
      );
    }
    console.log(`Inserted population briefs`);

    // 2. Personas
    const personas = await devClient.query("SELECT * FROM personas");
    console.log(`Found ${personas.rows.length} personas`);
    for (const row of personas.rows) {
      await prodClient.query(
        `INSERT INTO personas (id, project_id, name, description, age_range, gender, occupation, location, attitude, verbosity, domain_knowledge, traits, communication_style, background_story, topics_to_avoid, biases, is_archived, created_at, updated_at, population_brief_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.project_id, row.name, row.description, row.age_range, row.gender, row.occupation, row.location, row.attitude, row.verbosity, row.domain_knowledge, row.traits, row.communication_style, row.background_story, row.topics_to_avoid, row.biases, row.is_archived, row.created_at, row.updated_at, row.population_brief_id]
      );
    }
    console.log(`Inserted personas`);

    // 3. Simulation runs
    const simRuns = await devClient.query("SELECT * FROM simulation_runs");
    console.log(`Found ${simRuns.rows.length} simulation runs`);
    for (const row of simRuns.rows) {
      await prodClient.query(
        `INSERT INTO simulation_runs (id, collection_id, launched_by, status, persona_ids, enable_barbara, enable_summaries, enable_additional_questions, total_simulations, completed_simulations, failed_simulations, error_message, started_at, completed_at, created_at, progress)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.collection_id, row.launched_by, row.status, row.persona_ids, row.enable_barbara, row.enable_summaries, row.enable_additional_questions, row.total_simulations, row.completed_simulations, row.failed_simulations, row.error_message, row.started_at, row.completed_at, row.created_at, row.progress]
      );
    }
    console.log(`Inserted simulation runs`);

    // 4. Simulated respondents
    const respondents = await devClient.query(
      "SELECT * FROM respondents WHERE is_simulated = true"
    );
    console.log(`Found ${respondents.rows.length} simulated respondents`);
    for (const row of respondents.rows) {
      await prodClient.query(
        `INSERT INTO respondents (id, collection_id, user_id, email, display_name, profile_fields, invited_at, consent_given_at, full_name, informal_name, invitation_token, invitation_status, clicked_at, is_simulated)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.collection_id, row.user_id, row.email, row.display_name, row.profile_fields, row.invited_at, row.consent_given_at, row.full_name, row.informal_name, row.invitation_token, row.invitation_status, row.clicked_at, row.is_simulated]
      );
    }
    console.log(`Inserted simulated respondents`);

    // 5. Simulated interview sessions
    const sessions = await devClient.query(
      "SELECT * FROM interview_sessions WHERE is_simulated = true"
    );
    console.log(`Found ${sessions.rows.length} simulated interview sessions`);
    for (const row of sessions.rows) {
      await prodClient.query(
        `INSERT INTO interview_sessions (id, collection_id, respondent_id, status, current_question_index, started_at, completed_at, paused_at, total_duration_ms, satisfaction_rating, closing_comments, created_at, live_transcript, last_barbara_guidance, question_states, resume_token_hash, resume_token_expires_at, question_summaries, review_completed_at, review_access_token, review_access_expires_at, review_skipped, review_ratings, review_comments, researcher_notes, review_flags, performance_metrics, additional_questions, additional_question_phase, current_additional_question_index, transcription_quality_metrics, alvia_summary, barbara_session_summary, barbara_guidance_log, guidance_adherence_summary, is_simulated, persona_id, simulation_run_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.collection_id, row.respondent_id, row.status, row.current_question_index, row.started_at, row.completed_at, row.paused_at, row.total_duration_ms, row.satisfaction_rating, row.closing_comments, row.created_at, row.live_transcript, row.last_barbara_guidance, row.question_states, row.resume_token_hash, row.resume_token_expires_at, row.question_summaries, row.review_completed_at, row.review_access_token, row.review_access_expires_at, row.review_skipped, row.review_ratings, row.review_comments, row.researcher_notes, row.review_flags, row.performance_metrics, row.additional_questions, row.additional_question_phase, row.current_additional_question_index, row.transcription_quality_metrics, row.alvia_summary, row.barbara_session_summary, row.barbara_guidance_log, row.guidance_adherence_summary, row.is_simulated, row.persona_id, row.simulation_run_id]
      );
    }
    console.log(`Inserted simulated interview sessions`);

    // 6. Segments for simulated sessions
    const sessionIds = sessions.rows.map((r: any) => r.id);
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map((_: any, i: number) => `$${i + 1}`).join(",");
      const segments = await devClient.query(
        `SELECT * FROM segments WHERE session_id IN (${placeholders})`,
        sessionIds
      );
      console.log(`Found ${segments.rows.length} segments for simulated sessions`);
      for (const row of segments.rows) {
        await prodClient.query(
          `INSERT INTO segments (id, session_id, question_id, transcript, audio_ref, start_time_ms, end_time_ms, summary_bullets, key_quotes, extracted_values, confidence, quality_flags, created_at, respondent_comment, additional_question_index, additional_question_text)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (id) DO NOTHING`,
          [row.id, row.session_id, row.question_id, row.transcript, row.audio_ref, row.start_time_ms, row.end_time_ms, row.summary_bullets, row.key_quotes, row.extracted_values, row.confidence, row.quality_flags, row.created_at, row.respondent_comment, row.additional_question_index, row.additional_question_text]
        );
      }
      console.log(`Inserted segments`);
    }

    console.log("Migration complete!");
  } catch (err) {
    console.error("Migration failed:", err);
    throw err;
  } finally {
    devClient.release();
    prodClient.release();
    await devPool.end();
    await prodPool.end();
  }
}

migrate();
