import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="link-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>

        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <h1>Alvia — Terms and Conditions of Use</h1>
          <p><strong>Effective Date:</strong> 1 March 2026<br /><strong>Last Updated:</strong> 1 March 2026</p>

          <hr />

          <h2>1. Introduction and Acceptance</h2>
          <p>
            These Terms and Conditions of Use ("Terms") constitute a legally binding agreement between you ("you", "your", or "User") and Alginon Limited ("Alginon", "we", "us", or "our"), the operator of the Alvia platform at alviaai.com, governing your access to and use of the Alvia platform, including all associated websites, applications, APIs, and services (collectively, the "Platform").
          </p>
          <p>
            By accessing or using the Platform, creating an account, or participating in an interview as a Respondent, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you are accepting these Terms on behalf of an organisation, you represent and warrant that you have the authority to bind that organisation to these Terms.
          </p>
          <p>If you do not agree to these Terms, you must not access or use the Platform.</p>

          <hr />

          <h2>2. Definitions</h2>
          <ul>
            <li><strong>"Alginon"</strong> or <strong>"Alginon Limited"</strong>: The company that owns and operates the Alvia platform at alviaai.com.</li>
            <li><strong>"Alvia"</strong>: The Platform and its AI-powered voice interviewer agent that conducts interviews with Respondents.</li>
            <li><strong>"Barbara"</strong>: The AI orchestration system that monitors interview transcripts in real time and provides analytical guidance, summaries, and research insights.</li>
            <li><strong>"Collection"</strong>: A launched instance of an Interview Template, representing a specific data-collection effort with defined parameters.</li>
            <li><strong>"Interview Session"</strong> or <strong>"Session"</strong>: A single voice conversation between Alvia and a Respondent within a Collection.</li>
            <li><strong>"Interview Template"</strong>: A structured set of questions, settings, and parameters configured by a Researcher to guide interviews.</li>
            <li><strong>"Platform"</strong>: The Alvia web application at alviaai.com, its APIs, WebSocket services, and all associated infrastructure, operated by Alginon Limited.</li>
            <li><strong>"Project"</strong>: A top-level organisational unit containing research objectives, audience context, and one or more Interview Templates.</li>
            <li><strong>"Researcher"</strong>: An authenticated User who creates, configures, and manages research projects, templates, collections, and sessions on the Platform.</li>
            <li><strong>"Respondent"</strong> or <strong>"Participant"</strong>: An individual who participates in an AI-conducted voice interview via the Platform.</li>
            <li><strong>"Segment"</strong>: An individual question–response pair within a Session, including transcript text, AI-generated summaries, and extracted data.</li>
            <li><strong>"Workspace"</strong>: A multi-tenant organisational unit under which Projects, Templates, Collections, and Sessions are grouped.</li>
          </ul>

          <hr />

          <h2>3. Eligibility and Account Registration</h2>

          <h3>3.1 Age Requirement</h3>
          <p>
            You must be at least 18 years of age to use the Platform as a Researcher. Respondents must be at least 18 years of age unless the Researcher has obtained verifiable parental or guardian consent and has executed a separate Minor Participation Addendum with Alginon.
          </p>

          <h3>3.2 Access</h3>
          <p>Access is granted at Alginon's sole discretion. We do not guarantee future access. We reserve the right to revoke access at any time.</p>

          <h3>3.3 Account Security</h3>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorised use of your account. We are not liable for any loss or damage arising from your failure to safeguard your credentials.
          </p>

          <h3>3.4 Account Accuracy</h3>
          <p>
            You agree to provide accurate, current, and complete information during registration and to update such information as necessary. Accounts registered with false or misleading information may be terminated without notice.
          </p>

          <hr />

          <h2>4. Description of the Platform</h2>
          <p>Alvia is a voice-based AI interview platform designed for qualitative and quantitative research. The Platform enables Researchers to:</p>
          <ul>
            <li>Design structured interview templates with conditional logic and multiple question types</li>
            <li>Launch data-collection efforts (Collections) with configurable AI parameters</li>
            <li>Conduct AI-powered voice interviews with real-time transcription</li>
            <li>Receive AI-generated analysis, summaries, thematic insights, and recommendations</li>
            <li>Export data, generate infographics, and produce analytical reports</li>
            <li>Manage respondent invitations and track participation</li>
          </ul>
          <p>
            <strong>Important</strong>: Alvia is an AI-powered interviewer, not a human. All voice interviews are conducted by an artificial intelligence system. Respondents interact with an AI agent, and their conversations are recorded, transcribed, and analysed by AI systems. This is disclosed to all Respondents prior to interview commencement.
          </p>

          <hr />

          <h2>5. User Roles and Responsibilities</h2>

          <h3>5.1 Researcher Responsibilities</h3>
          <p>As a Researcher, you are responsible for:</p>
          <p><strong>(a) Research Design and Ethics</strong></p>
          <ul>
            <li>Ensuring your research design, questions, and methodology comply with all applicable laws, regulations, ethical guidelines, and institutional requirements</li>
            <li>Obtaining relevant approval where required by your institution, jurisdiction, or the nature of the research</li>
            <li>Ensuring your interview questions and research objectives do not solicit unlawful, harmful, or discriminatory content</li>
          </ul>
          <p><strong>(b) Respondent Consent</strong></p>
          <ul>
            <li>Obtaining valid, informed consent from all Respondents prior to their participation, in compliance with all applicable data protection and privacy laws</li>
            <li>Alvia provides a technical consent mechanism (the in-platform consent screen) as a tool to assist you; however, legal responsibility for consent compliance rests solely with you</li>
            <li>Ensuring that consent is freely given, specific, informed, and unambiguous, particularly where required under the GDPR, CCPA, or equivalent legislation</li>
            <li>Complying with biometric privacy laws where voice data collected through the Platform may constitute biometric information under applicable law</li>
          </ul>
          <p><strong>(c) Respondent Communication</strong></p>
          <ul>
            <li>Informing Respondents, prior to participation, that: (i) the interviewer is an AI system and not a human; (ii) the conversation will be recorded and transcribed; (iii) AI systems will analyse the transcript; and (iv) voice audio will be processed by third-party AI providers</li>
            <li>Providing Respondents with any additional disclosures required by applicable law, including information about data retention, cross-border transfers, and their rights regarding their personal data</li>
          </ul>
          <p><strong>(d) Data Handling</strong></p>
          <ul>
            <li>Ensuring that any personal data you collect, store, or process through the Platform is handled in accordance with applicable data protection laws</li>
            <li>Not collecting protected health information (PHI) as defined under HIPAA or equivalent legislation without first executing a Business Associate Agreement (BAA) with Alginon</li>
            <li>Not collecting special categories of personal data (as defined under the GDPR) without obtaining explicit consent from Respondents and ensuring a lawful basis for processing</li>
          </ul>
          <p><strong>(e) Minors</strong></p>
          <ul>
            <li>Not conducting interviews with individuals under the age of 18 without executing a separate Minor Participation Addendum with Alginon and without obtaining verifiable parental or guardian consent as required by applicable law</li>
          </ul>

          <h3>5.2 Respondent Responsibilities</h3>
          <p>As a Respondent, you agree to:</p>
          <ul>
            <li>Provide truthful and good-faith responses during interviews</li>
            <li>Not attempt to manipulate, disrupt, or interfere with the AI interviewer's operation</li>
            <li>Respect the confidentiality of the research topic, questions, and any proprietary information disclosed during the interview, unless the Researcher has expressly authorised disclosure</li>
            <li>Not use the Platform for any unlawful purpose</li>
          </ul>

          <h3>5.3 Workspace Roles</h3>
          <p>Workspace members are assigned roles that determine their permissions:</p>
          <ul>
            <li><strong>Owner</strong>: Full administrative control over the Workspace, including member management, billing, and data deletion</li>
            <li><strong>Creator</strong>: May create and manage Projects, Templates, Collections, and review Sessions</li>
            <li><strong>Analyst</strong>: Read-only access to data, analytics, and reports</li>
          </ul>
          <p>Workspace Owners are responsible for the actions of all members within their Workspace.</p>

          <hr />

          <h2>6. AI Disclosure and Transparency</h2>

          <h3>6.1 AI Nature of the Platform</h3>
          <p>You acknowledge and agree that:</p>
          <ul>
            <li>Alvia (the interviewer) is an artificial intelligence system. It is not a human and does not possess human consciousness, emotions, or judgment.</li>
            <li>Barbara (the orchestrator) is an AI system that provides automated analysis and guidance. Its outputs are generated algorithmically and are not the product of human review.</li>
            <li>All interview transcription, analysis, summarisation, theme extraction, and recommendations are generated by AI and may contain errors, omissions, biases, or inaccuracies (see Section 10).</li>
          </ul>

          <h3>6.2 Mandatory AI Disclosure to Respondents</h3>
          <p>Researchers must ensure that Respondents are clearly and prominently informed, immediately prior to any interview interaction, that:</p>
          <ol>
            <li>They are interacting with an AI system, not a human interviewer</li>
            <li>The conversation will be recorded, transcribed, and analysed</li>
            <li>AI systems (including third-party providers) will process the conversation data</li>
            <li>A human Researcher will have access to the transcript and AI-generated analysis</li>
          </ol>
          <p>Failure to provide these disclosures may result in suspension or termination of your account and may expose you to legal liability under applicable AI transparency regulations, including but not limited to the EU AI Act (Regulation (EU) 2024/1689).</p>

          <h3>6.3 AI-Generated Content Disclosure</h3>
          <p>
            If you publish, distribute, or rely upon AI-generated outputs from the Platform in external publications, reports, or presentations, you must clearly and transparently disclose the role of AI in generating that content. You must not represent that AI-generated content was produced solely by a human.
          </p>

          <hr />

          <h2>7. Voice Recording, Transcription, and Audio Data</h2>

          <h3>7.1 Voice Data Processing</h3>
          <p>During an interview, voice audio is captured by the Respondent's microphone and streamed in real time through the Platform's servers to a third-party voice AI provider. The audio is processed for the purposes of:</p>
          <ul>
            <li>Real-time voice interaction (generating Alvia's spoken responses)</li>
            <li>Speech-to-text transcription</li>
            <li>Voice Activity Detection (VAD) to manage conversational turn-taking</li>
          </ul>

          <h3>7.2 Audio Storage</h3>
          <p>
            Voice audio is streamed live and is not stored as persistent audio files on the Platform's servers or in its database. Only the text transcript produced by the voice provider is retained by the Platform. Audio data may be transiently retained by third-party voice providers in accordance with their respective data processing terms (see Section 12).
          </p>

          <h3>7.3 Transcription</h3>
          <p>
            Transcription is performed by third-party AI models. Transcription occurs in real time during the interview. Transcription accuracy is not guaranteed; the Platform monitors transcription quality and may alert Respondents to audio quality issues, but cannot ensure error-free transcription.
          </p>

          <h3>7.4 Transcription Quality Monitoring</h3>
          <p>The Platform employs real-time transcription quality monitoring. These quality metrics are recorded for each Session.</p>

          <hr />

          <h2>8. Data Ownership and Intellectual Property</h2>

          <h3>8.1 Researcher Data Ownership</h3>
          <p>
            All research data generated through the Platform — including interview transcripts, AI-generated summaries, Barbara's analyses, thematic insights, analytics outputs, infographics, and any other outputs derived from interview Sessions — are owned by the Workspace Owner (or the organisation they represent).
          </p>
          <p>Alginon does not claim any ownership interest in your research data or derived insights. Upon termination of your account or at your request, we may make your data available for export in accordance with Section 19.</p>

          <h3>8.2 Respondent Content</h3>
          <p>
            By participating in an interview on the Platform, Respondents grant the Researcher (and the Researcher's Workspace) a perpetual, irrevocable, worldwide, royalty-free licence to use, reproduce, modify, distribute, and create derivative works from all responses, statements, and content provided during the interview, for the purposes of the Researcher's stated research objectives and any related analysis, reporting, or publication.
          </p>
          <p>Respondents waive any moral rights in their interview responses to the extent permitted by applicable law.</p>

          <h3>8.3 Platform Intellectual Property</h3>
          <p>
            All rights, title, and interest in the Platform itself (including but not limited to the software, algorithms, AI models, prompts, user interface, design, documentation, and trademarks) remain the exclusive property of Alginon Limited. Nothing in these Terms grants you any licence to use Alginon's intellectual property except as necessary to use the Platform in accordance with these Terms.
          </p>

          <h3>8.4 Feedback</h3>
          <p>
            If you provide suggestions, ideas, or feedback about the Platform ("Feedback"), you grant Alginon a perpetual, irrevocable, worldwide, royalty-free licence to use, reproduce, modify, and incorporate such Feedback into the Platform without obligation or compensation to you.
          </p>

          <hr />

          <h2>9. Data Processing, Privacy, and PII</h2>

          <h3>9.1 Data Controller and Processor Roles</h3>
          <p>For the purposes of applicable data protection law (including the GDPR and UK GDPR):</p>
          <ul>
            <li><strong>Researcher as Controller</strong>: The Researcher is the data controller for all personal data collected from Respondents through the Platform.</li>
            <li><strong>Alginon as Processor</strong>: Alginon acts as a data processor on behalf of the Researcher, processing Respondent personal data solely in accordance with the Researcher's instructions and these Terms.</li>
            <li><strong>Alginon as Controller</strong>: Alginon acts as an independent data controller for: (i) Researcher account data; (ii) Platform usage data; (iii) billing and payment data; and (iv) aggregated, de-identified analytics used for Platform improvement.</li>
          </ul>

          <h3>9.2 PII Redaction</h3>
          <p>
            The Platform offers an optional PII redaction feature for summarisation, configurable per Project. Alginon does not guarantee that all PII will be detected and redacted. Researchers remain responsible for reviewing transcripts and ensuring compliance with applicable data protection obligations.
          </p>
          <p>Transcripts will contain personal data as spoken by the Respondent. Researchers are solely responsible for the lawful handling of such data.</p>

          <h3>9.3 Data Security</h3>
          <p>
            We implement appropriate technical and organisational measures to protect personal data against unauthorised access, alteration, disclosure, or destruction. These measures include encryption in transit (TLS), access controls, and authentication via industry-standard identity providers.
          </p>

          <h3>9.4 Data Portability</h3>
          <p>
            Researchers may export their data (including session transcripts, segments, and analytics) in standard formats (JSON, CSV) via the Platform's export functionality. We will provide reasonable assistance to facilitate data portability requests from Researchers acting on behalf of their Respondents.
          </p>

          <hr />

          <h2>10. AI-Generated Content: Accuracy Disclaimer</h2>

          <h3>10.1 No Warranty of Accuracy</h3>
          <p>
            All AI-generated content on the Platform — including but not limited to interview transcripts, question summaries, thematic analyses, cross-interview insights, collection-level analytics, template-level analytics, project-level analytics, additional interview questions, session summaries, generated interview templates, generated personas, and infographics — is provided on an "as-is" and "as-available" basis.
          </p>
          <p>
            <strong>We do not warrant the accuracy, completeness, reliability, or fitness for any particular purpose of any AI-generated output.</strong> AI systems may produce content that is inaccurate, incomplete, misleading, biased, or factually incorrect ("hallucinations").
          </p>

          <h3>10.2 Human Oversight Required</h3>
          <p>You are responsible for implementing reasonable practices — including human review and professional judgment — before relying on any AI-generated output for:</p>
          <ul>
            <li>Published academic or commercial research</li>
            <li>Business decisions, product development, or strategic planning</li>
            <li>Medical, clinical, legal, or regulatory determinations</li>
            <li>Hiring, admissions, or other decisions affecting individuals</li>
            <li>Any purpose where errors could cause material harm</li>
          </ul>

          <h3>10.3 Research-Critical Disclaimer</h3>
          <p>
            AI-generated analytics, theme extraction, and recommendations should be treated as preliminary analytical aids, not as definitive research findings. Barbara's analyses are algorithmically generated from the data available at the time of processing and do not constitute expert review or peer-reviewed conclusions.
          </p>

          <h3>10.4 Standard SLA Exclusion</h3>
          <p>
            Service-level commitments, uptime guarantees, and performance warranties (if any) do not extend to AI-generated features, which depend on third-party AI provider availability, model behaviour, and inherent limitations of current AI technology.
          </p>

          <hr />

          <h2>11. Acceptable Use Policy</h2>

          <h3>11.1 Permitted Use</h3>
          <p>The Platform is intended for lawful qualitative and quantitative research purposes, including but not limited to user experience research, market research, academic research, customer experience analysis, and product research.</p>

          <h3>11.2 Prohibited Uses</h3>
          <p>You agree not to use the Platform to:</p>
          <p><strong>(a) Unlawful or Harmful Research</strong></p>
          <ul>
            <li>Conduct research that violates any applicable law, regulation, or ethical guideline</li>
            <li>Interview individuals without proper informed consent</li>
            <li>Target or exploit vulnerable populations without appropriate ethical safeguards and oversight</li>
            <li>Collect data for the purpose of discrimination, harassment, stalking, or intimidation</li>
          </ul>
          <p><strong>(b) Harmful Content</strong></p>
          <ul>
            <li>Generate, solicit, or distribute content that is illegal, abusive, defamatory, obscene, or constitutes hate speech</li>
            <li>Use the Platform to facilitate fraud, phishing, social engineering, or identity theft</li>
            <li>Attempt to elicit harmful, illegal, or dangerous information from Respondents</li>
          </ul>
          <p><strong>(c) Platform Abuse</strong></p>
          <ul>
            <li>Attempt to reverse-engineer, decompile, disassemble, or otherwise derive the source code of the Platform</li>
            <li>Attempt to extract, replicate, or reverse-engineer Alvia's or Barbara's system prompts, orchestration logic, or AI configurations</li>
            <li>Use the Platform (including its AI outputs) to develop, train, or improve a competing AI interview platform, AI model, or similar product</li>
            <li>Access or use the Platform through automated means (bots, scrapers, or scripts) except via our documented APIs</li>
            <li>Circumvent, disable, or interfere with security features, access controls, or usage limits</li>
            <li>Overload, disrupt, or degrade the Platform's infrastructure or performance</li>
            <li>Share, resell, or sublicence your account access to third parties without our prior written consent</li>
          </ul>
          <p><strong>(d) Data Misuse</strong></p>
          <ul>
            <li>Collect, store, or process personal data in violation of applicable data protection laws</li>
            <li>Collect protected health information (PHI) without an executed BAA</li>
            <li>Use Respondent data for purposes beyond those disclosed to the Respondent at the time of consent</li>
            <li>Attempt to re-identify de-identified or pseudonymised data without authorisation</li>
            <li>Share Respondent personal data with unauthorised third parties</li>
          </ul>
          <p><strong>(e) Impersonation and Deception</strong></p>
          <ul>
            <li>Represent AI-generated outputs as human-authored without disclosure</li>
            <li>Use the Platform to impersonate any person or entity</li>
            <li>Misrepresent your identity, affiliation, or the nature of your research to Respondents</li>
          </ul>

          <h3>11.3 Enforcement</h3>
          <p>
            We reserve the right to investigate and take appropriate action against any suspected violation of this Acceptable Use Policy, including suspension or termination of access, removal of content, and reporting to law enforcement authorities where appropriate.
          </p>

          <hr />

          <h2>12. Third-Party AI Providers and Subprocessors</h2>

          <h3>12.1 Third-Party AI Processing</h3>
          <p>The Platform relies on third-party AI providers to deliver its core functionality. By using the Platform, you acknowledge and consent to the processing of data by these providers.</p>

          <h3>12.2 No AI Training on Customer Data</h3>
          <p>
            We do not use your research data — including transcripts, audio, analytics, or any other content — to train, fine-tune, or improve any AI or machine learning model, whether our own or any third party's. Our third-party AI provider agreements prohibit the use of API-submitted data for model training by default.
          </p>

          <h3>12.3 Subprocessor Changes</h3>
          <p>We will maintain a current list of subprocessors used in connection with the Platform. We will provide at least 30 days' prior notice before engaging a new subprocessor that processes personal data. If you object to a new subprocessor, you may terminate your account in accordance with Section 19.</p>

          <h3>12.4 Third-Party Terms</h3>
          <p>
            Your use of the Platform is also subject to the terms and policies of our third-party AI providers to the extent those terms apply to the processing of your data. We will make reasonable efforts to ensure that our agreements with third-party providers include data protection commitments consistent with these Terms.
          </p>

          <hr />

          <h2>13. Data Residency and Cross-Border Transfers</h2>

          <h3>13.1 Default Data Processing Location</h3>
          <p>Data is processed and stored in the EU. Interview audio is streamed to AI providers whose infrastructure may be located in other jurisdictions.</p>

          <h3>13.2 International Transfers</h3>
          <p>
            Where personal data is transferred from the European Economic Area (EEA), the United Kingdom, or Switzerland to countries not recognised as providing an adequate level of data protection, we rely on appropriate transfer mechanisms, including Standard Contractual Clauses (SCCs) as approved by the European Commission, or other lawful transfer mechanisms.
          </p>

          <hr />

          <h2>14. Interview Session Terms</h2>

          <h3>14.1 Consent Flow</h3>
          <p>Before any interview data is collected, the Platform presents Respondents with a consent screen requiring affirmative acknowledgement of:</p>
          <ol>
            <li>Participation consent — agreement to participate with understanding that responses will be recorded and analysed</li>
            <li>Audio recording consent — consent to audio recording for transcription and quality purposes (where applicable)</li>
            <li>Data processing consent — agreement that responses may be summarised and analysed, with information about PII redaction (where enabled)</li>
          </ol>
          <p>The consent screen is a technical tool provided by the Platform. It does not constitute legal advice and does not replace the Researcher's obligation to ensure that consent is lawfully obtained.</p>

          <h3>14.2 Session Recovery</h3>
          <p>
            The Platform provides session recovery functionality through cryptographic resume tokens stored in the Respondent's browser. These tokens enable interview resumption in case of technical interruption and expire after 7 days. Only a cryptographic hash of the token is stored on our servers; the raw token is stored solely in the Respondent's browser local storage.
          </p>

          <h3>14.3 Session Summaries</h3>
          <p>
            At the conclusion of an interview, the Platform may generate AI-powered session summaries, including thematic analysis, objective satisfaction assessments, and respondent engagement metrics. These summaries are AI-generated and subject to the accuracy disclaimers in Section 10.
          </p>

          <hr />

          <h2>15. Persona Simulation</h2>

          <h3>15.1 Synthetic Data</h3>
          <p>The Platform includes a persona simulation feature that generates synthetic interview responses using AI-generated personas. Simulated Sessions are flagged as synthetic and can be separated from real Respondent data in analytics.</p>

          <h3>15.2 Not a Substitute for Human Research</h3>
          <p>
            Simulated interview data is generated by AI and does not represent the views, experiences, or responses of real individuals. Researchers must not represent simulated data as human-generated research data in publications, reports, or any other context without clear disclosure.
          </p>

          <h3>15.3 Research Ethics</h3>
          <p>
            Use of persona simulation does not exempt Researchers from ethical obligations when conducting research with real human Respondents. Simulated data should be used for template testing, methodology refinement, and preliminary analysis — not as a replacement for genuine human participation.
          </p>

          <hr />

          <h2>16. Usage Tracking and Billing</h2>

          <h3>16.1 LLM Usage Tracking</h3>
          <p>
            The Platform tracks all AI/LLM usage at a granular level, including token consumption (input, output, and audio tokens), latency, and attribution by hierarchy level (Workspace, Project, Template, Collection, and Session). This data is used for billing, platform monitoring, and providing usage transparency to Researchers.
          </p>

          <h3>16.2 Usage-Based Costs</h3>
          <p>AI processing costs are variable and depend on factors including:</p>
          <ul>
            <li>Duration and number of voice interview Sessions</li>
            <li>Volume and complexity of Barbara's analytical processing</li>
            <li>Number and type of analytics refresh operations</li>
            <li>Infographic generation requests</li>
            <li>Persona simulation runs</li>
          </ul>
          <p>You can monitor your usage through the Platform's usage dashboard.</p>

          <h3>16.3 Billing Terms</h3>
          <ul>
            <li>All fees are stated in the applicable currency and are exclusive of taxes unless otherwise specified</li>
            <li>Fees are non-refundable except as required by applicable law or as expressly stated in a separate written agreement</li>
            <li>Subscriptions auto-renew at the end of each billing period unless cancelled at least 30 days prior to renewal</li>
            <li>Late payments may accrue interest at the rate of 1.5% per month (or the maximum rate permitted by law, whichever is lower)</li>
            <li>We reserve the right to suspend access to the Platform for accounts with overdue payments, following at least 7 days' prior written notice</li>
          </ul>

          <h3>16.4 Pricing Changes</h3>
          <p>We may modify our pricing with at least 30 days' prior notice. We will endeavour to provide advance notice of any material pricing changes.</p>

          <hr />

          <h2>17. Disclaimers and Limitation of Liability</h2>

          <h3>17.1 Platform Provided "As Is"</h3>
          <p className="uppercase text-sm">
            The Platform is provided "as is" and "as available" without warranties of any kind, whether express, implied, or statutory, including but not limited to implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement.
          </p>

          <h3>17.2 No Guarantee of Availability</h3>
          <p>
            We do not guarantee uninterrupted, secure, or error-free operation of the Platform. The Platform depends on third-party services (including AI providers, cloud infrastructure, and authentication services) whose availability is beyond our control.
          </p>

          <h3>17.3 AI Limitations</h3>
          <p>Without limiting the generality of the foregoing, we specifically disclaim any warranty that:</p>
          <ul>
            <li>AI-generated transcriptions will be accurate or complete</li>
            <li>AI-generated analyses, summaries, or insights will be correct, unbiased, or suitable for any particular research purpose</li>
            <li>The AI interviewer will perform consistently across all accents, languages, dialects, or audio conditions</li>
            <li>AI-generated content will be free from bias, hallucination, or factual error</li>
          </ul>

          <h3>17.4 Limitation of Liability</h3>
          <p className="uppercase text-sm">
            To the maximum extent permitted by applicable law, in no event shall Alginon Limited, its officers, directors, employees, agents, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, data, use, goodwill, or other intangible losses, arising out of or in connection with: your use of or inability to use the Platform; any AI-generated content, including inaccurate transcriptions, analyses, or recommendations; unauthorised access to or alteration of your data; any third-party conduct on the Platform; or any matter relating to the Platform.
          </p>
          <p className="uppercase text-sm">
            Our total aggregate liability for all claims arising out of or in connection with these Terms shall not exceed the greater of: (a) the amounts you paid to Alginon in the twelve (12) months preceding the claim; or (b) one hundred US dollars (USD $100).
          </p>

          <h3>17.5 Essential Purpose</h3>
          <p className="uppercase text-sm">
            The limitations in this section apply even if any remedy fails of its essential purpose. Some jurisdictions do not allow the exclusion or limitation of certain warranties or liabilities, so some of the above limitations may not apply to you. In such cases, our liability will be limited to the fullest extent permitted by applicable law.
          </p>

          <hr />

          <h2>18. Indemnification</h2>

          <h3>18.1 Researcher Indemnification</h3>
          <p>You agree to indemnify, defend, and hold harmless Alginon Limited and its officers, directors, employees, and agents from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising out of or in connection with:</p>
          <ul>
            <li>Your use of the Platform in violation of these Terms</li>
            <li>Your failure to obtain valid consent from Respondents</li>
            <li>Your violation of any applicable law, regulation, or third-party right</li>
            <li>Your research content, questions, or methodology</li>
            <li>Any claim by a Respondent arising from their participation in an interview you conducted</li>
            <li>Your publication or use of AI-generated outputs without appropriate human oversight or disclosure</li>
          </ul>

          <h3>18.2 Respondent Acknowledgement</h3>
          <p>Respondents acknowledge that Alginon acts as a technology provider and that the Researcher is responsible for the design, purpose, and ethical conduct of the research in which they participate.</p>

          <hr />

          <h2>19. Term, Termination, and Data Retention</h2>

          <h3>19.1 Term</h3>
          <p>These Terms remain in effect for as long as you have an account on the Platform or, for Respondents, for the duration of your interaction with the Platform and any applicable data retention period.</p>

          <h3>19.2 Termination by You</h3>
          <p>You may terminate your account at any time by contacting us or using the account settings functionality (where available). Termination does not entitle you to a refund of prepaid fees.</p>

          <h3>19.3 Termination by Alginon</h3>
          <p>We may suspend or terminate your access to the Platform at any time, with or without cause, and with or without notice, if:</p>
          <ul>
            <li>You breach any provision of these Terms</li>
            <li>We are required to do so by law or regulatory order</li>
            <li>We reasonably believe your use of the Platform poses a security risk or may cause harm to other Users or third parties</li>
            <li>Your account has been inactive for a period exceeding 12 months</li>
          </ul>

          <h3>19.4 Effect of Termination</h3>
          <p>Upon termination:</p>
          <ul>
            <li>Your right to access the Platform ceases immediately</li>
            <li>We will make your research data available for export for a period of 30 days following termination, after which it may be permanently deleted</li>
            <li>Provisions of these Terms that by their nature should survive termination (including Sections 8, 10, 17, 18, and 20) will continue in effect</li>
          </ul>

          <h3>19.5 Data Retention</h3>
          <ul>
            <li><strong>Interview transcripts and Segments</strong>: Retained for the duration of the Workspace's configured retention period (default: 90 days), or until the Workspace Owner requests deletion</li>
            <li><strong>LLM usage event logs</strong>: Retained for 14 days, then automatically deleted. Aggregated hourly usage rollups are retained for the duration of the account.</li>
            <li><strong>Infographic images</strong>: The Platform retains only the 100 most recently generated infographic images per Workspace; older images are automatically deleted</li>
            <li><strong>Resume tokens</strong>: Expire after 7 days and are not recoverable thereafter</li>
            <li><strong>Account data</strong>: Retained for the duration of the account plus a reasonable period for legal and administrative purposes</li>
          </ul>

          <hr />

          <h2>20. Governing Law and Dispute Resolution</h2>

          <h3>20.1 Governing Law</h3>
          <p>These Terms shall be governed by and construed in accordance with the laws of England and Wales, without regard to its conflict of laws principles.</p>

          <h3>20.2 Dispute Resolution</h3>
          <p>
            Any dispute arising out of or in connection with these Terms shall first be attempted to be resolved through good-faith negotiation between the parties for a period of at least 30 days. If the dispute cannot be resolved through negotiation, the courts of England and Wales shall have exclusive jurisdiction, except that either party may seek injunctive or equitable relief in any court of competent jurisdiction to protect its intellectual property rights.
          </p>

          <h3>20.3 Class Action Waiver</h3>
          <p className="uppercase text-sm">
            To the maximum extent permitted by applicable law, you agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action.
          </p>

          <hr />

          <h2>21. Modifications to These Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. We will provide at least 30 days' prior notice of material changes by email or through the Platform. Your continued use of the Platform after the effective date of any modification constitutes your acceptance of the modified Terms. If you do not agree to the modified Terms, you must cease using the Platform and terminate your account.
          </p>

          <hr />

          <h2>22. Miscellaneous</h2>

          <h3>22.1 Entire Agreement</h3>
          <p>These Terms, together with the Privacy Policy and any applicable DPA, constitute the entire agreement between you and Alginon Limited with respect to the subject matter hereof and supersede all prior or contemporaneous communications, whether oral or written.</p>

          <h3>22.2 Severability</h3>
          <p>If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it valid, legal, and enforceable while preserving its original intent.</p>

          <h3>22.3 Waiver</h3>
          <p>Our failure to enforce any provision of these Terms shall not be deemed a waiver of that provision or of the right to enforce it at a later time.</p>

          <h3>22.4 Assignment</h3>
          <p>You may not assign or transfer these Terms or any rights or obligations hereunder without our prior written consent. We may assign these Terms in connection with a merger, acquisition, reorganisation, or sale of substantially all of our assets.</p>

          <h3>22.5 Force Majeure</h3>
          <p>Neither party shall be liable for any failure or delay in performance resulting from circumstances beyond its reasonable control, including but not limited to acts of God, natural disasters, pandemics, war, terrorism, government actions, power failures, internet or telecommunications failures, or failures of third-party service providers.</p>

          <h3>22.6 Notices</h3>
          <p>All notices under these Terms shall be in writing and delivered by email. Notices to Alginon shall be sent to legal@alviaai.com. Notices to you shall be sent to the email address associated with your account.</p>

          <h3>22.7 No Third-Party Beneficiaries</h3>
          <p>These Terms do not create any third-party beneficiary rights, except that Alginon's third-party AI providers may enforce the restrictions on data use and reverse engineering set forth herein.</p>

          <h3>22.8 Headings</h3>
          <p>Section headings are for convenience only and shall not affect the interpretation of these Terms.</p>

          <hr />

          <h2>23. Contact Information</h2>
          <p>If you have questions about these Terms, please contact us at:</p>
          <p>
            <strong>Alginon Limited</strong><br />
            Company Number: 14740087<br />
            Trading as Alvia<br />
            Website: alviaai.com<br />
            Email: legal@alviaai.com
          </p>

          <hr />

          <p className="text-sm text-muted-foreground italic">These Terms and Conditions were last updated on 1 March 2026.</p>
        </article>
      </div>
    </div>
  );
}
