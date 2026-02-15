# OpenAI `responses.create` Parameters (Current)

Legend: `✗` = not explicitly passed (provider default)

| API use case | Call site | Model | verbosity | reasoning | temperature | max_output_tokens |
|---|---|---|---|---|---|---|
| `barbara_question_parsing` | question parser | `QUESTION_PARSING_MODEL` (`gpt-5`) | ✗ | `low` | ✗ | `10000` |
| `barbara_analysis` | `analyzeWithBarbara` | `barbaraConfig.analysis.model` | `barbaraConfig.analysis.verbosity` | `barbaraConfig.analysis.reasoningEffort` | ✗ | `500` |
| `barbara_topic_overlap` | `detectTopicOverlap` | `barbaraConfig.topicOverlap.model` | `barbaraConfig.topicOverlap.verbosity` | `barbaraConfig.topicOverlap.reasoningEffort` | ✗ | `200` |
| `barbara_question_summary` | `generateQuestionSummary` | `barbaraConfig.summarisation.model` | `barbaraConfig.summarisation.verbosity` | `barbaraConfig.summarisation.reasoningEffort` | ✗ | `1500` |
| `barbara_cross_interview_enhanced_analysis` | `generateCrossInterviewEnhancedAnalysis` | `barbaraConfig.summarisation.model` | `barbaraConfig.summarisation.verbosity` | `barbaraConfig.summarisation.reasoningEffort` | ✗ | `16000` |
| `barbara_project_cross_template_analysis` | `extractCrossTemplateThemesWithAI` | `barbaraConfig.projectAnalytics.model` | `barbaraConfig.projectAnalytics.verbosity` | `barbaraConfig.projectAnalytics.reasoningEffort` | ✗ | `20000` |
| `barbara_template_generation` | `generateTemplateFromProject` | `barbaraConfig.templateGeneration.model` | `barbaraConfig.templateGeneration.verbosity` | `barbaraConfig.templateGeneration.reasoningEffort` | ✗ | `10000` |
| `barbara_additional_questions` | `generateAdditionalQuestions` | `barbaraConfig.additionalQuestions.model` | `barbaraConfig.additionalQuestions.verbosity` | `barbaraConfig.additionalQuestions.reasoningEffort` | ✗ | `20000` |
| `barbara_session_summary` | `generateSessionSummary` | `barbaraConfig.sessionSummary.model` | ✗ | ✗ | ✗ | ✗ |
| `barbara_persona_research` | `researchPopulation` (web search) | `getBarbaraConfig().personaResearch.model` | ✗ | `barbaraConfig.personaResearch.reasoningEffort` | ✗ | ✗ |
| `barbara_persona_research` | `researchPopulation` (fallback) | `getBarbaraConfig().personaResearch.model` | ✗ | `barbaraConfig.personaResearch.reasoningEffort` | ✗ | ✗ |
| `barbara_persona_generation` | `synthesizePersonas` | `getBarbaraConfig().personaGeneration.model` | ✗ | `barbaraConfig.personaGeneration.reasoningEffort` | ✗ | ✗ |
| `simulation_alvia` | `generateAlviaResponse` | runtime `model` arg | n/a | n/a | `0.7` | `600` |
| `simulation_persona` | `generatePersonaResponse` | runtime `model` arg | n/a | n/a | `VERBOSITY_TEMP[persona.verbosity]` | `VERBOSITY_MAX_TOKENS[persona.verbosity]` |

## Readability notes
- `n/a`: not part of the OpenAI `responses.create` `text` block; this parameter is intentionally not used in this path.
- `✗` values are omitted from the request and therefore fall back to OpenAI defaults.
- `barbara_session_summary` currently omits **all** optional tuning fields: `verbosity`, `reasoning`, and `max_output_tokens`.
