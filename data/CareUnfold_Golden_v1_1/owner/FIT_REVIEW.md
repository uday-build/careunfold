# CareUnfold golden dataset fit review

Version 1.1.0. Notion snapshot edited 2026-11-20T00:42:10Z. All 16 situations reviewed.

These are authored synthetic ground truths, not verified adjudications of the source patients. Ready means fit for the stated evaluation scope, not clinically or legally certified.

Five Notion images were visually inspected. S01 preserves five visible service codes. S02 uses the statement credit structure; original service descriptions were cropped. S03 preserves CT, clinic, IV, lab and pharmacy categories and a separate reader. Uploaded KFF PDFs were visually inspected: two-page hospital statement for S15 and photographed itemized statement for S16. Original web embeds remain blocked, but uploaded copies now establish document structure. Original patient images and source snapshot are excluded from tester packets.

## S01: Service lines and unapplied receipt

**Fit:** Ready after reconciliation

Source prose says two lines; inspected image has five service rows. Preserve all five. Source itself does not prove duplicate billing.

**Basis:** Inspected Notion image layout and service categories; fictional amounts and adjudication

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S02: Reprocessed radiology claim

**Fit:** Ready after rule correction

Use the revised expected behavior. Ignore contradictory blanket prohibition on finding wrong charges. Image supports credit-column design, but service labels are cropped; use authored radiology categories.

**Basis:** Inspected Notion image layout and service categories; fictional amounts and adjudication

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S03: Correct CT bill with affordability need

**Fit:** Ready as authored clean control

Source images do not prove complete source correctness. Author complete supporting EOB and plan. Preserve CT, clinic, injection, lab, pharmacy, separate reader.

**Basis:** Inspected Notion image layout and service categories; fictional amounts and adjudication

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S04: Payment absent from collection balance

**Fit:** Ready with scope clarification

Notion adaptation is partial payment, unlike the source full-payment story. Preserve 25 paid against 40 responsibility and make remaining 15 explicit.

**Basis:** Notion narrative; documents authored synthetically

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S05: Copay split across services

**Fit:** Ready

Clarify the proposed 30 receipt/18 balance by allocating 12 correctly and 18 to another account.

**Basis:** Notion narrative; documents authored synthetically

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S06: Insurer payment not posted

**Fit:** Ready as staged evidence

Trace alone does not prove account allocation.

**Basis:** Notion narrative; documents authored synthetically

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S07: Delayed bill after coverage ended

**Fit:** Ready

Source thread limited; author historical eligibility and exact cost share.

**Basis:** Notion narrative; documents authored synthetically

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S08: Upfront payment plus imaging cost share

**Fit:** Ready with clean and omitted-payment stages

Create clean control first and separate erroneous posting version; do not merge mutually exclusive statements.

**Basis:** Notion narrative; documents authored synthetically

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S09: Two plans awaiting coordination

**Fit:** Ready for abstention and later determination

Do not author final responsibility before coordination evidence. Pending allowed amount and patient responsibility must be null, not zero.

**Basis:** Notion narrative; documents authored synthetically

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S10: Cash quote and anesthesia

**Fit:** Ready with incomplete quote stage

Cash-pay case has no EOB; do not manufacture insurance adjudication.

**Basis:** Notion narrative; documents authored synthetically

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S11: Denial with zero responsibility and collections

**Fit:** Ready for uncertainty

Consent applicability and added collection amount unresolved; do not label legal liability.

**Basis:** Notion narrative; documents authored synthetically

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S12: Lab waiver and promised correction

**Fit:** Ready for uncertainty and closure

Do not decide waiver enforceability; subsequent zero statement closes provider balance.

**Basis:** Notion narrative; documents authored synthetically

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S13: Midyear accumulator transfer

**Fit:** Ready; benefit calculation not a claim

No actual claim or bill should be invented solely to fill a schema. Limits are not debt.

**Basis:** Notion narrative; documents authored synthetically

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S14: Fifteen documents for one procedure

**Fit:** Ready with exact inventory

Fifteen billing documents plus enrollment and visit record. Deduplicate by claim/account/version, not amount alone.

**Basis:** Notion narrative; documents authored synthetically

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S15: Emergency denial and promised write-off

**Fit:** Ready with staged closure

Two-page uploaded hospital bill inspected. Self-pay statement already has adjustment and reduced demand. No universal emergency legal rule asserted.

**Basis:** Uploaded source PDF visually inspected; recreated structure with fictional identifiers and amounts

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## S16: ER departure and disputed service

**Fit:** Ready for evidence-calibrated dispute; legal/coding verdict excluded

Uploaded one-page photographed statement inspected; source has zero payments. Synthetic partial payment is subsequent. Do not assert triage-only always makes a facility charge invalid. No reviewed legal or CPT rule provided.

**Basis:** Uploaded source PDF visually inspected; recreated structure with fictional identifiers and amounts

**Scope:** Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules

## Limitations and next review
This is a small development set, not a statistical benchmark. Missing automated adversarial coverage includes identity/access ambiguity, exact duplicate receipt ingestion, payment reversals, and arbitrary OCR corruption. Image alternatives are clean renders, not realistic camera noise. Provider and coding experts should review adjudication policies before production gating. Family/friend feedback evaluates usability, not billing correctness. Keep whole situations together in any train/test split; do not split stages or document variants across partitions. S16-X is an alternate clinical branch and must not be mixed into the main case.
