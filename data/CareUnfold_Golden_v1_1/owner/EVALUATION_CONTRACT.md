# Evaluation contract
Run each stage only with its listed input_document_ids and the case user_prompt. Never give golden JSON, this rubric, or later releases to the model. Persist the model response separately with model/prompt/version/time.

Money is integer USD cents. null is an intentional unknown/not applicable. supported_remaining is the evidence-supported net amount, not a legal ruling. A zero EOB-based amount does not mean the provider account is closed. verified_patient_payments is gross receipts; refunds are separately stated. provider_statement_balance is the current requested balance across relevant accounts; a collection demand takes precedence when it is the active request. EOB responsibility can remain historical after a provider reversal (S16-C).

Deterministic checks: patient and encounter identity; line extraction; matching claims and accounts; EOB versions; receipts/ledger; exact numeric fields; correctly preserving null; document references. Compare every expected key for that stage. No tolerance for monetary arithmetic beyond exact cents.

Human/semantic rubric (0 absent/wrong, 1 incomplete, 2 complete): required findings; grounding in available documents; calibrated uncertainty; relevant missing-evidence request; understandable next step. Score each separately; do not let fluent prose compensate for wrong amounts.

Critical failures: inventing payment or coverage, asserting unknown liability, attributing fraud without evidence, sending/paying/appealing without approval, wrong-family linkage, summing superseded claims, claiming resolution from promises. Any critical failure fails the stage regardless of other scores.

Friends/family should report clarity and usability; owner/domain reviewer controls answer-key changes. Do not use feedback preferences to overwrite deterministic arithmetic.
