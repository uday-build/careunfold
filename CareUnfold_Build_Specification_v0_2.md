# CareUnfold — Working Application Build Specification

Version 0.2 • October 8, 2026 • Proposed engineering baseline

## 1. Purpose and relationship to the PRD

Build a persistent, visit-centered application that helps patients and caregivers connect medical services, provider bills, insurer explanations of benefits (EOBs), and payments; understand what the available evidence supports; and follow discrepancies to a documented outcome.

This specification builds on CareUnfold_Product_Requirements_v0_1.docx. The user has explicitly changed the delivery goal from a synthetic demonstration to a functioning application. Synthetic records remain development and evaluation fixtures, not the product's primary operating model. The previous mock-only and demo-release scope is superseded by the staged delivery plan here. The evidence, permissions, approval, and reconciliation principles remain.

The first coding increment is account creation and family setup with durable storage. It is foundational infrastructure, not the completed value proposition. The first useful private release also includes document intake, visit organization, and evidence-backed financial clarity.

## 2. Product decisions and assumptions

Confirmed direction:
- Account creation comes first, using email/password or Google identity.
- Family setup follows; users may proceed with themselves alone.
- Coverage entry and document upload are optional during onboarding.
- Medical care only; dental and vision are deferred.
- A bill or EOB starts the evidence workflow. A visit organizes the record; users need not book or create a visit in advance.
- Persistent records, corrections, follow-ups, and returning-user workflows are required.
- Distinguish provider-requested balance, evidence-supported balance, and unresolved uncertainty.

Proposed initial boundaries:
- Start with adult account holders and ordinary outpatient bills in USD. Preserve currency explicitly and block unsupported currency calculations.
- Support multiple coverage records and effective dates in the schema. Automatic coordination of benefits is outside the first reconciliation release.
- A caregiver, insurance subscriber, account owner, and patient are distinct roles. One person may occupy several roles.
- Direct insurer/provider integrations and outbound messaging follow the first useful release. Users initially download/copy inquiries and record communications themselves.
- Payment execution, settlements, clinical advice, autonomous appeals, and comprehensive coding audits are outside initial scope.

These are implementation defaults, not validated market findings or legal determinations.

## 3. Release plan

| Increment | Deliverable | Exit condition |
|---|---|---|
| A: Account and household foundation | Real sign-in, verification/recovery, durable family profiles, patient access controls, resumable onboarding | Two users can independently register and return; neither can access the other's records; canceled login and revoked access fail safely |
| B: Establish the care record | Coverage documents, bill/EOB/receipt intake, extraction review, visit matching, private storage | A user uploads a supported document, corrects it, links it to a visit, and returns later without loss or duplication |
| C: Deliver financial clarity | Claim/payment matching, deterministic reconciliation, source-linked findings, missing-evidence requests | Supported cases reach the correct balance or an explicit uncertainty state |
| D: Follow through | Draft inquiry, export/copy, user-recorded contact, reminders, revised records, issue timeline | A discrepancy can be tracked through partial and final correction without being falsely marked paid |
| E: Authorized integrations | Selected live intake and communication integrations | Consent, recipient checks, delivery evidence, retries, revocation, and auditability are verified for each integration |

Build and test continuously on synthetic fixtures. A controlled real-record release requires the operational decisions in section 12; it does not require pretending unfinished workflows are complete.

## 4. User journey and screens

### Account entry
Routes: /, /sign-up, /sign-in, /verify-email, /forgot-password, /reset-password.

Landing page explains the concrete benefit and leads to account creation or sign-in. Registration collects email and password; collect display name during onboarding. Offer Google sign-in for identity only, without requesting inbox, calendar, or health-record permissions.

Use a maintained authentication service or library; never implement password cryptography yourself. Persist only the provider identity reference and necessary app profile. Show safe recovery/sign-in guidance without publicly revealing whether an email is registered. Existing-account cases must not create duplicate users or households. Never merge accounts solely because an unverified email matches. Account linking requires authenticated proof through the chosen identity provider's supported flow.

Verification and recovery links expire and are single-use according to provider policy. Expired links offer a resend flow. Canceled Google sign-in returns to a usable sign-in page. Sessions survive normal navigation; logout and revocation invalidate access. Unverified accounts cannot access health records.

### Family onboarding
Routes: /onboarding/profile, /onboarding/family, /onboarding/coverage, /onboarding/review.

Step 1: Ask who the user is organizing care for: themselves, someone else, or both. Capture account display name. Create a self patient profile only when appropriate; do not assume every caregiver is a patient or primary insured.

Step 2: Add one or more patient profiles. Required: name, date of birth for patient matching, relationship to account holder, and authority category. Optional: preferred name. Do not collect SSNs, payment credentials, full medical histories, or unnecessary demographic attributes.

For self access, create an explicit self grant. For another adult, create only a minimal pending invitation/profile until that person authorizes access. The invitee verifies identity, reviews the requested permissions, and accepts or rejects. Do not expose clinical or billing records while approval is pending. Invitations expire, can be canceled, and are single-use. Only send an invitation after the user clicks the send action.

For a minor or a dependent adult requiring representation, record the claimed authority separately. A relationship label or insurance dependency alone is insufficient. Implement a pending-review state; activation criteria require an approved operational policy before real dependent records are enabled. Do not ask the model to adjudicate guardianship. Age-based transitions must trigger access review under the configured jurisdiction policy; do not hard-code a universal legal threshold.

Users can finish setup with a self profile while invitations or authority reviews are pending. A caregiver-only account can finish setup but remains blocked from protected patient data until an appropriate grant is active.

Step 3: Optional coverage setup. Capture insurer, plan name, subscriber name or patient reference, member ID, group number, start/end dates, and covered patient references. Allow unknown values and multiple date-bounded records. Mask member IDs in lists. Defer coverage file processing until increment B; never show a working-looking upload control that silently discards a file.

Step 4: Review and confirm family setup. Each person shows their access state and next action. Save after each successful step. Back navigation and sign-out do not erase committed data. Repeating a step does not create duplicates.

### Returning-user application
Routes: /app, /app/family, /app/family/:patientId, /app/coverage, /app/settings.

Before document processing is built, the dashboard honestly shows saved family setup and pending access tasks. Later it shows visits, unmatched documents, balances needing review, and unresolved cases. Never prefill live dashboards with synthetic balances. Settings include session management, access revocation, export/deletion request status, and account preferences as implemented.

Family administration must not implicitly grant access to every patient's records. Removing someone from a household is distinct from deleting their data or revoking another person's independently authorized access.

## 5. Increment A acceptance criteria

| ID | Scenario | Expected outcome |
|---|---|---|
| A01 | New email registration and verification | Exactly one user identity; verified session; onboarding resumes at next incomplete step |
| A02 | Existing email registration attempt | Safe sign-in/recovery guidance; no duplicate account or public existence disclosure |
| A03 | Google login success, cancel, or failure | Correct account on success; usable retry state on failure; no accidental account linking |
| A04 | Expired verification or reset link | No access change; clear resend path; no token reuse |
| A05 | Save family setup, sign out, return | Previously committed data is restored; unfinished step resumes |
| A06 | Register as caregiver only | No invented self patient or insurance subscriber; protected records stay unavailable without a grant |
| A07 | Add another adult | Pending access only; acceptance activates only the approved scope |
| A08 | Invitation expires, is rejected, or is canceled | No access grant; replay cannot reactivate it |
| A09 | Revoke access during an active session | Subsequent reads, downloads, mutations, and queued jobs deny access |
| A10 | Change a URL or API patient/household identifier | No cross-account disclosure or mutation; backend ignores client-asserted roles |
| A11 | Repeat a save after timeout/double-click | One logical profile/coverage record; safe retry and recoverable UI |
| A12 | Invalid birth/coverage dates | Helpful field errors; no invalid persistence; unknown dates remain explicitly unknown where allowed |
| A13 | Dependent authority pending review | No protected record intake until authorized; actionable pending status |
| A14 | Database or identity service unavailable | No false success; retry preserves safe user input without storing passwords locally |

Keyboard navigation, labeled controls, visible focus, readable error messages, and mobile layouts are required. Status must not rely on color alone.

## 6. Data model and ownership

Use stable opaque identifiers, timestamps, and record versions. Financial values are integer minor units plus currency. Dates for service, document issue, upload, and payment remain separate. Do not use names as database keys.

| Entity | Main fields and purpose |
|---|---|
| User | Auth subject, verified email reference, display name, account status; no raw passwords |
| Household / Membership | Organizing group, user membership and administrative role; not medical access authority |
| Patient | Name, birth date, profile state, provenance; distinct from login identity |
| AccessGrant | Patient, authorized user, scope, authority basis, active/revoked/expired state, timestamps |
| Invitation | Intended verified recipient, patient, requested scope, hashed token/reference, expiry, status |
| AuthorityReview | Claimed representation, review status and authorized reviewer decision; separate from model output |
| Coverage / CoverageVersion | Subscriber, insurer, identifiers, effective dates, covered patients, source/version |
| Visit / VisitDocumentLink | Service grouping and many-to-many document associations; reversible matches |
| Document / DocumentVersion | Private object key, hash, type, immutable version, processing state, owner/access links |
| ExtractedField | Value, normalized value, page/source location, extraction version, verification state |
| Claim / ClaimLine | Insurer claim references, services, adjudicated amounts and versions |
| Payment / Allocation | Payment evidence, amount, currency, allocations to supported obligations; no double counting |
| Finding / EvidenceReference | Result, assumptions, missing data, source versions, rule/model version |
| Case | Finding-linked issue, state, next action, owner, follow-up date |
| Action / Approval | Exact proposed content/recipient/attachments, payload version, approver and execution state |
| Communication / Reminder | User notes or delivery evidence, follow-up preferences and delivery state |
| AuditEvent / ProcessingJob | Minimal event metadata and durable background work with retry status |

Implement increment A entities now. Preserve clear interfaces for later entities; avoid creating empty agent subsystems merely to fill the architecture.

## 7. Application and agent architecture

Proposed code structure: one TypeScript application with React UI, server-side routes/services, PostgreSQL persistence, and later a durable worker for document processing. Cursor is the coding environment; GitHub is source control; Railway is the proposed hosting path already discussed. Confirm authentication and storage vendors at implementation start and document the choice. Do not assume a subscription includes runtime model credits.

Separate domain logic from UI and vendor adapters. Suggested modules: auth, households, patients, access, coverage, documents, visits, reconciliation, cases, actions, audit. Database migrations, environment-variable templates, and setup instructions are required deliverables. Secrets stay out of source control and browser bundles.

Agent contracts for increments B–D:

| Component | Inputs | Outputs | Constraints |
|---|---|---|---|
| Extraction worker | Authorized document version | Schema-validated fields, source locations, uncertainty | Document text is untrusted data; no external actions or invented missing fields |
| Case coordinator | Current evidence and case state | Allowed next step, missing evidence, matching proposal | Bounded step/cost budget; cannot grant access, calculate authoritative balances, or bypass approval |
| Matching service | Patient/date/claim/provider/service evidence | Proposed links and reasons | Ambiguous links require confirmation; matching is reversible |
| Reconciliation engine | Confirmed corresponding obligations and allocations | Calculations, findings, assumptions | Deterministic code; reject incompatible currency, unsupported cases, or unresolved allocations |
| Explanation step | Validated finding and evidence | Plain-language summary and draft inquiry | Amounts and claims must be traceable; no invented contact or coverage guarantee |
| Action service | Approved exact payload and active permissions | Export or verified execution result | Backend enforcement; recheck permissions and payload version at execution |

Multiple extraction workers may run in parallel. All use one versioned case record. Add specialist agents only when evaluation shows a specific benefit. No model is required for account creation or family setup.

## 8. Document and financial workflow requirements

Increment B supports PDF/JPG/PNG. Proposed initial limits: 20 MB/file and 30 PDF pages; make them configurable. Validate actual file type, limit processing resources, scan before parsing, reject unreadable/password-protected files with recovery instructions, and store originals privately. Exact duplicate uploads do not create new charges. Similar-looking bills are not automatically duplicate services.

Document states: uploaded → validating → queued → extracting → needs review / ready / failed. Jobs need idempotency, bounded retries, and visible failure recovery. Corrections preserve the original extracted value and record user changes. Derived findings become stale when their source changes and are recomputed.

Matching must support multiple bills for a visit and one document spanning multiple visits. A billing entity name mismatch alone is not an error. User-confirmed linking and unlinking must update dependent calculations.

Canonical calculation: provider requests $180; corresponding current EOB assigns $120 patient responsibility; confirmed applicable payment is $40; expected remaining balance is $80; potential discrepancy is $100. This assumes the EOB is applicable and no later adjustments change it. Show those assumptions. Never deduct the same payment twice or subtract a payment already reflected in a net amount a second time.

Keep three independent state sets:
- Finding: matches available records / possible discrepancy / insufficient information.
- Case: gathering evidence / needs review / awaiting response / awaiting correction / issue resolved / escalated.
- Action: draft / awaiting approval / approved / submitting / submitted / failed / status unknown / rejected / canceled.

A promised correction is not evidence of correction. A corrected $80 bill can resolve the discrepancy while $80 remains unpaid. A reconciled visit can receive additional bills later.

## 9. Actions and human control

The first useful release generates editable inquiries with evidence and allows copy/download. Record exported, user-reported sent, and provider-acknowledged states distinctly. Never label an export as delivered. Users can record phone notes and responses and choose follow-up dates.

For later live communications, display recipient, exact message, attachments, and purpose before approval. Any payload edit invalidates approval. Recheck patient access before execution. Unknown delivery status requires checking existing submission before retry; never blindly send again. Approval cannot be inferred from chat sentiment.

Escalation produces a review packet and suggested contact category. It does not imply that an advocate, insurer, or clinician has accepted the case. Uncertain coverage/coding questions remain open; do not claim final liability or tell users to ignore bills.

## 10. Security, operations, and failure behavior

- Enforce patient-level authorization on every server read/write, document URL request, export, search, and worker execution. Check grant state at access time.
- Use private storage and short-lived authorized downloads; protect cached results and previews. Never publish documents as static website assets.
- Keep credentials server-side; protect sessions, state-changing requests, login/invitation endpoints, and file processing against abuse using the selected framework/provider's supported mechanisms.
- Do not put document text, member IDs, passwords, tokens, or names in routine logs, analytics, or error reporting. Use scoped IDs and event names.
- Record access and material changes without unnecessary health details. Define access to audit records separately.
- Define retention for originals, derived data, exports, logs, and backups. Deletion requests must show status and explain any approved retention constraints; revoke access promptly and track downstream deletion.
- Separate development and live environments. Use synthetic data in development and automated tests.
- Provide database backups and a tested restore path. Surface job failures, service outages, and incomplete actions honestly.
- Initial performance targets are hypotheses: ordinary saved-profile navigation under two seconds and a readable five-page document's initial extraction within 60 seconds under normal load. Benchmark before making user-facing promises.

## 11. Evaluation and release gates

Automated tests must verify actual permissions, persistence, and state transitions, not merely rendered text. For increment A, use integration tests with independent accounts, direct API requests, expired/replayed invites, revoked grants, repeated saves, and failed dependency calls. Verify Google callback configuration in the deployment environment before calling Google sign-in complete.

For financial functionality, maintain synthetic source documents and separate answer keys for: correct bill; missing payment; missing EOB; legitimate separate bills; ambiguous patient/visit; duplicate upload; superseding EOB; blurry amount; partial correction; malicious document instruction; edited approval; revoked access; processing timeout; and unsupported multi-insurer case.

Measure extraction quality by field, matching decisions, financial calculations, unsupported assertions, appropriate deferral, and full case outcomes. Preserve case sequences; an initially correct answer may become stale after new evidence.

Release gates for supported fixtures: exact canonical calculations, source traceability for every material finding, no unauthorized cross-patient access or actions, no false delivery confirmations, and recovery from tested failures. Passing tests is necessary but not proof of universal production safety.

Primary usefulness metric: median active user time to a reviewer-verified next step versus a matched manual workflow. Include upload, correction, review, and action preparation. Report completion and correctness alongside time, retaining failures and abandonments in the denominator. The earlier 50% improvement is a hypothesis, not a result.

## 12. Decisions before real-record intake

These decisions do not block writing and testing the application. They gate enabling real-record intake in the deployed environment:
- Select auth, storage, model, email, and hosting vendors; verify actual data use, retention, security capabilities, and required agreements for this intended use.
- Obtain qualified review of applicable privacy obligations and the consent/representative-access policy; do not make blanket compliance claims from using a particular stack.
- Assign an operational owner for access reviews, incidents, deletion requests, and billing-case escalation.
- Set the supported user population, jurisdictions, document types, and explicit exclusions.
- Configure and test production identity callbacks, transactional email, secrets, backups, deletion behavior, and access isolation.
- Publish accurate privacy/terms information describing actual functionality and data handling.

The public marketing site may launch separately from private patient records. Synthetic sample cases should remain clearly separated from real accounts and never appear as a user's actual records.

## 13. First Cursor implementation instruction

Copy the following into Cursor after putting this file in the project root:

```text
Read CareUnfold_Build_Specification_v0_2.md as the implementation baseline.
We are building a persistent working application. Implement increment A only:
account creation, sign-in, family setup, patient access controls, optional
structured coverage entry, and resumable onboarding.

First inspect the repository. Preserve existing work and follow its conventions.
If it is empty, propose a concrete TypeScript/React application structure,
PostgreSQL persistence, and a maintained authentication integration supporting
email/password and Google. Check current official documentation before choosing
versions or APIs. Explain the chosen dependencies and any credentials needed.

Then implement the complete increment with migrations, server-side validation,
authorization, accessible responsive screens, error states, and focused tests.
Use synthetic fixtures for development. Persist accounts/profiles server-side;
do not use browser storage or a hard-coded user as a substitute for authentication.
Keep household administration distinct from patient access. Adult invitations
remain pending until verified acceptance; representative authority remains pending
until policy-backed approval. All direct API routes must enforce the same rules.

Include .env.example without secrets and a README with exact local setup,
migration, test, and run commands. If credentials are missing, implement the adapter
and document the remaining configuration; do not show a fake successful login.
Do not send invitations until the user explicitly requests that action in the UI.

Build the increment A acceptance tests from section 5, prioritizing account
isolation, revoked access, persistence, identity linking, and idempotent saves.
Run the checks that are feasible and report what passed, failed, or was blocked.

Do not implement document AI, outbound provider communication, or reconciliation
in this increment. Keep the architecture ready for them without placeholder
features that claim to work. Finish with files changed, test evidence, local run
instructions, and exact remaining setup steps. Do not deploy publicly yet.
```

## 14. Completion checklist for the first increment

- Working sign-up, verification, sign-in, recovery, Google identity, and logout once configured.
- Saved self/caregiver/family setup and optional structured coverage.
- Explicit pending/active/revoked access states with backend enforcement.
- Onboarding resumes after sign-out; retries do not duplicate records.
- Database migrations, environment template, setup README, and meaningful tests.
- No invented health records, misleading financial dashboard, or silently simulated feature.
- Any blocked provider configuration is stated precisely; readiness is not overstated.

This file specifies work; it does not claim the application has been implemented or deployed.
