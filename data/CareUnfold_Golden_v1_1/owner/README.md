# Owner quick start
1. Read FIT_REVIEW.md: per-case suitability, corrections and source limitations.
2. Inspect golden_dataset.json or S##_truth.json: identities, dates, lines, documents, stages and expected results.
3. Use claim_lines.csv, coverage_dates.csv, payment_and_posting_ledger.csv and expected_totals.csv for spreadsheet review.
4. Feed eval_cases.jsonl input_document_ids and user prompts to your evaluation harness. Resolve each ID with document_manifest.csv. Never pass expected fields to the model.
5. Use EVALUATION_CONTRACT.md for deterministic checks and a human-scored explanation rubric.
6. Share ONLY the separate tester archive. It contains 121 PDFs across 16 cases, 16 image alternatives, staged inputs, prompts and a feedback CSV. There are 32 scored evidence states, including the isolated S16-X alternate branch.
7. To reproduce: Python with reportlab and PyMuPDF (fitz), then run build_dataset.py followed by validate_dataset.py. Generated document bytes can change metadata; semantic truths should remain stable.

This is authored synthetic gold v1.1, not an independently certified billing benchmark. A billing specialist should review domain rules before it gates a production release. All financial numbers are cents in machine files. Null does not mean zero.
