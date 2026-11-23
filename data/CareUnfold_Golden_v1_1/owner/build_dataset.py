from pathlib import Path
import json, re, csv, hashlib, zipfile, shutil
from decimal import Decimal
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
import fitz

ROOT=Path(__file__).resolve().parents[1]
OWNER=ROOT/'owner'; TEST=ROOT/'tester_packets'
CASES=[]
def cents(x): return int(Decimal(str(x))*100)
def money(x): return 'Not determined' if x is None else f'${x/100:,.2f}'
def line(code,desc,billed,allowed,plan,patient,deductible=0,copay=0,coinsurance=0,noncovered=0,reason='Processed under service-date plan',provider='Cedar Medical'):
    return dict(code=code,description=desc,provider=provider,billed_cents=cents(billed),allowed_cents=None if allowed is None else cents(allowed),plan_paid_cents=cents(plan),patient_responsibility_cents=None if patient is None else cents(patient),deductible_cents=cents(deductible),copay_cents=cents(copay),coinsurance_cents=cents(coinsurance),noncovered_cents=cents(noncovered),reason=reason)
def case(n,title,question,fit,notes,policy='For these synthetic services, the final EOB gives line-level cost sharing. A bill is not an EOB. Coverage applies on service date; member payments are separate from insurer adjudication.',service='2026-04-10',start='2026-01-01',end='2026-12-31'):
    c=dict(id=f'S{n:02}',situation=n,title=title,user_prompt=question,fit=fit,audit_notes=notes,service_date=service,patient=['Avery','Morgan','Jamie','Sam','Casey','Taylor','Robin','Alex','Drew','Quinn','Reese','Cameron','Jordan','Skyler','Casey','Taylor'][n-1]+' Rivera',dob='2015-08-14' if n==4 else '1991-08-14',member_id=f'SYN-M{n:03}',account_id=f'SYN-A{n:03}',claim_id=f'SYN-C{n:03}',coverage=[dict(plan='Harbor Health Medical',member_id=f'SYN-M{n:03}',effective_start=start,effective_end=end,relationship='child' if n==4 else 'self',subscriber='Jordan Rivera' if n==4 else 'same as patient',medical_only=True)],policy=policy,documents=[],stages=[],authoritative_ledger=[],source_basis='Inspected Notion image layout and service categories; fictional amounts and adjudication' if n<=3 else ('Uploaded source PDF visually inspected; recreated structure with fictional identifiers and amounts' if n>=15 else 'Notion narrative; documents authored synthetically'),external_validation='Synthetic arithmetic and evidence behavior only; not certified medical coding or legal rules')
    CASES.append(c);return c
def doc(c,kind,title,issued,stage='A',lines=None,fields=None,body=None,version=1,supersedes=None,claim=None,account=None,encounter=None):
    d=dict(id=f'{c["id"]}-D{len(c["documents"])+1:02}',kind=kind,title=title,issued=issued,release=stage,version=version,supersedes=supersedes,claim_id=claim or c['claim_id'],account_id=account or c['account_id'],encounter_id=encounter or c['id']+'-V1',service_date=c['service_date'],fields=fields or {},body=body or [],lines=lines or [])
    for i,l in enumerate(d['lines']): l.setdefault('line_id',f'{d["claim_id"]}-L{i+1}')
    c['documents'].append(d);return d['id']
def basics(c):
    doc(c,'coverage','Enrollment confirmation and benefit excerpt','2026-01-01',fields={'Patient date of birth':c['dob'],'Member ID':c['member_id']},body=[f"Plan: {x['plan']}. Member: {x['member_id']}. Effective {x['effective_start']} through {x['effective_end']}. Relationship: {x['relationship']}. Medical coverage only." for x in c['coverage']]+['SYNTHETIC PLAN TERMS - apply only to this test family.',c['policy'],'Caregiver access: Alex Rivera is authorized to view records for Sam Rivera.' if c['situation']==4 else 'The patient is the account holder.'])
    doc(c,'visit','Visit record',c['service_date'],body=[('No clinical encounter is included. This record marks the plan transition date.' if c['situation']==13 else 'Encounter at Cedar Medical. '+c.get('visit_note','Services are listed in the claim documents. This note does not establish insurer adjudication.'))])
def eob(c,ls,date='2026-04-24',stage='A',version=1,supersedes=None,claim=None,title='Explanation of benefits'):
    return doc(c,'eob',title,date,stage,lines=ls,body=['THIS IS NOT A BILL. Patient payments made to the provider are not deducted from EOB responsibility.','Amounts not assigned to the patient remain subject to provider/plan reconciliation; this document is not evidence that the provider posted payment.'],version=version,supersedes=supersedes,claim=claim)
def bill(c,charges,adjust,ins,paid,date='2026-05-01',stage='A',title='Patient account statement',claim=None,account=None,version=1,supersedes=None,body=None):
    return doc(c,'bill',title,date,stage,fields={'Total charges':cents(charges),'Posted adjustments':cents(adjust),'Posted insurer payments':cents(ins),'Posted patient payments':cents(paid),'Statement balance':cents(charges)-cents(adjust)-cents(ins)-cents(paid),'Statement date':date,'Payment due':'30 days after statement date'},body=body,claim=claim,account=account,version=version,supersedes=supersedes)
def payment(c,amount,date='2026-04-10',stage='A',posted=True,target=None):
    t=dict(transaction_id=f'{c["id"]}-P{len(c["authoritative_ledger"])+1}',type='patient_payment',amount_cents=cents(amount),received_date=date,intended_account=c['account_id'],posted_account=(target or c['account_id']) if posted else None,posted_date=date if posted else None,reversed=False)
    c['authoritative_ledger'].append(t)
    return doc(c,'receipt','Payment receipt',date,stage,fields={'Receipt ID':t['transaction_id'],'Amount received':cents(amount),'Intended account':c['account_id'],'Method':'Synthetic card ending 0000'},body=['This receipt confirms payment received for the stated account; it is not proof of allocation in the current statement.'])
def ledger(c,stage='B',date='2026-05-08',body=None):
    return doc(c,'ledger','Account transaction ledger',date,stage,body=body or [f"Transaction {x['transaction_id']}: received {money(x['amount_cents'])} on {x['received_date']}; intended account {x['intended_account']}; posted account {x['posted_account'] or 'not posted'}; posted date {x['posted_date'] or 'not posted'}." + (' Allocations: ' + '; '.join(f"{a['account']} {money(a['amount_cents'])}" for a in x['allocations']) if x.get('allocations') else '') for x in c['authoritative_ledger']])
def expected(c,stage,status,eobpr,paid,balance,demand,must,missing=None,forbidden=None,extra=None):
    # balance is evidence-supported net obligation, not provider demand or legal verdict
    docs=[d['id'] for d in c['documents'] if d['release']<=stage and d['release']!='X']
    c['stages'].append(dict(id=c['id']+'-'+stage,release=stage,input_document_ids=docs,status=status,expected=dict(eob_responsibility_cents=None if eobpr is None else cents(eobpr),verified_patient_payments_cents=cents(paid),supported_remaining_cents=None if balance is None else cents(balance),provider_statement_balance_cents=None if demand is None else cents(demand),**(extra or {})),required_findings=must,missing_evidence=missing or [],forbidden_claims=(forbidden or [])+['Fraud or legal liability conclusively established without evidence','Send, pay, appeal, or contact an organization without user approval'],evidence_ids=docs))

# 01: preserve the five visible service rows rather than the prose's incorrect two-line count.
c=case(1,'Service lines and unapplied receipt','Why are there two visit codes, and did my payment count?','Ready after reconciliation','Source prose says two lines; inspected image has five service rows. Preserve all five. Source itself does not prove duplicate billing.')
basics(c)
ls=[line('72050','Cervical spine radiographs',140,80,70,10,coinsurance=10),line('72080','Thoracolumbar radiographs',90,0,0,0,reason='Provider adjustment; no patient responsibility'),line('72114','Lumbar spine radiographs',160,100,20,80,coinsurance=80),line('99205','New patient office visit',500,250,175,75,copay=75),line('99244','Office consultation',550,0,0,0,reason='Disallowed in this synthetic adjudication; provider responsibility')]
eob(c,ls);payment(c,75,posted=False);bill(c,1440,1010,265,0,body=['Patient ledger lists 75 as unapplied credit; encounter balance has not been reduced.'])
expected(c,'A','payment_allocation_unresolved',165,75,90,165,['Five lines; 99244 has zero responsibility under this EOB.','Receipt supports 75 paid; net 90 if applied to this encounter.','Provider statement exceeds receipt-adjusted EOB by 75.'],['Allocation ledger'],['Provider definitely double-billed'])
ledger(c);expected(c,'B','unapplied_payment_confirmed',165,75,90,165,['Ledger confirms receipt not posted. Request allocation and corrected statement.'])

c=case(2,'Reprocessed radiology claim','Which EOB is current, and why is the hospital balance different?','Ready after rule correction','Use the revised expected behavior. Ignore contradictory blanket prohibition on finding wrong charges. Image supports credit-column design, but service labels are cropped; use authored radiology categories.')
basics(c)
a=eob(c,[line('RAD-A','Radiology technical service',3000,2000,400,1600,deductible=1500,coinsurance=100),line('RAD-B','Contrast material',20,10,8,2,coinsurance=2),line('RAD-C','Administration',100,50,40,10,coinsurance=10)])
b=eob(c,[line('RAD-A','Radiology technical service',3000,1500,1200,300,coinsurance=300),line('RAD-B','Contrast material',20,10,8,2,coinsurance=2),line('RAD-C','Administration',100,50,40,10,coinsurance=10)],'2026-05-10',version=2,supersedes=a)
payment(c,75);bill(c,3120,1060,448,75,'2026-05-12')
expected(c,'A','stale_provider_posting',312,75,237,1537,['Use EOB version 2, not issue order alone.','Do not add the two EOBs. Statement still reflects version 1.','Difference between current supported balance and statement is 1300.'])

c=case(3,'Correct CT bill with affordability need','I cannot afford this scan bill. Is it correct and what can I do?','Ready as authored clean control','Source images do not prove complete source correctness. Author complete supporting EOB and plan. Preserve CT, clinic, injection, lab, pharmacy, separate reader.',policy='Individual deductible 2000; 400 already met before encounter. CT applies remaining 1600 then plan pays the rest for this test. Clinic visit copay 100 is exempt from deductible. Injection, lab, pharmacy and separate reading covered at 100% after deductible. Adjudicate CT first.')
basics(c)
ls=[line('CT-BODY','CT scan/body - hospital',6500,3800,2200,1600,deductible=1600),line('CLINIC','Clinic visit - hospital',220,100,0,100,copay=100),line('IV','Injection/IV therapy',850,400,400,0),line('LAB','Lab services',90,50,50,0),line('RX','Pharmacy',40,20,20,0)]
eob(c,ls);bill(c,7700,3330,2670,0);eob(c,[line('CT-READ','Professional interpretation',400,200,200,0,provider='Harbor Radiology')],claim=c['claim_id']+'-R');bill(c,400,200,200,0,claim=c['claim_id']+'-R',account=c['account_id']+'-R',title='Radiology professional statement')
doc(c,'note','Patient message','2026-05-03',body=['I am a student and cannot afford the balance. Please help me understand assistance or payment options.'])
expected(c,'A','reconciled_affordability_support',1700,0,1700,1700,['No detected discrepancy in supplied documents.','Separate professional reading is not a duplicate.','Offer financial-assistance inquiry and payment-plan questions; do not promise eligibility.'],forbidden=['An unnecessary billing dispute is required'])

c=case(4,'Payment absent from collection balance','I paid for my child. Why did a collection notice arrive?','Ready with scope clarification','Notion adaptation is partial payment, unlike the source full-payment story. Preserve 25 paid against 40 responsibility and make remaining 15 explicit.')
basics(c);eob(c,[line('ER','Emergency facility service',300,200,160,40,coinsurance=40)]);payment(c,25,posted=False);bill(c,300,100,160,0)
doc(c,'collection','Collection account notice','2026-05-05',fields={'Requested balance':cents(40)},body=['Original creditor Cedar Medical; account '+c['account_id']+'. No additional collection fees in this fixture.'])
expected(c,'A','collection_payment_conflict',40,25,15,40,['Receipt supports 25 received, not full settlement.','15 remaining if receipt applied. Collection requests 40.','Ask for allocation and updated collection balance.'],['Provider posting and collection correction'])
ledger(c);expected(c,'B','unposted_partial_payment',40,25,15,40,['Ledger confirms omitted 25 payment. Collection closure not established.'])

c=case(5,'Copay split across services','Why is part of my paid copay billed again?','Ready','Clarify the proposed 30 receipt/18 balance by allocating 12 correctly and 18 to another account.')
basics(c);eob(c,[line('VISIT','Office visit',180,100,88,12,copay=12),line('LAB','In-office lab',90,60,42,18,copay=18)]);payment(c,30);c['authoritative_ledger'][0].update(posted_account='split allocation',allocations=[{'account':c['account_id'],'amount_cents':1200},{'account':'SYN-OTHER','amount_cents':1800}]);bill(c,270,110,130,12)
expected(c,'A','payment_allocation_unresolved',30,30,0,18,['Receipt covers the 30 EOB responsibility, but statement credits only 12.','Need allocation ledger before asserting where the missing 18 went.'],['Allocation ledger'])
ledger(c);doc(c,'note','Call log','2026-05-09','B',body=['Practice manager promised a callback; no callback or adjustment recorded.']);expected(c,'B','misallocated_payment',30,30,0,18,['Ledger allocates 18 to SYN-OTHER. Request authorized correction.','Promised callback is not closure.'])

c=case(6,'Insurer payment not posted','Insurer says it paid. Why does the provider still want money?','Ready as staged evidence','Trace alone does not prove account allocation.')
basics(c);eob(c,[line('PROC','Outpatient procedure',1000,680,680,0)]);bill(c,1000,320,0,0)
doc(c,'remittance','Insurer payment trace','2026-04-25',fields={'Payment amount':cents(680),'Trace':'SYN-TRACE-006'},body=['Payee Cedar Medical; account and claim allocation not supplied.'])
expected(c,'A','insurer_payment_trace_unmatched',0,0,0,680,['EOB assigns zero responsibility. Trace does not establish correct account allocation.'],['Remittance-to-claim allocation'])
doc(c,'remittance','Remittance allocation detail','2026-05-08','B',fields={'Trace':'SYN-TRACE-006','Matched claim':c['claim_id'],'Matched account':c['account_id'],'Amount':cents(680)},body=['Remittance received by provider; ledger shows payment in suspense, not applied.']);expected(c,'B','insurer_payment_in_suspense',0,0,0,680,['Remittance now matches this claim but provider balance remains unreconciled.'])
bill(c,1000,320,680,0,'2026-05-15','C',version=2);expected(c,'C','provider_account_closed',0,0,0,0,['Corrected statement confirms zero balance; do not credit insurer funds as patient payment.'])

c=case(7,'Delayed bill after coverage ended','I left this insurance plan. Why am I getting a bill now?','Ready','Source thread limited; author historical eligibility and exact cost share.',service='2025-08-15',start='2025-01-01',end='2025-12-31',policy='At this service date: 40 office copay plus 20% of the remaining allowed 140; deductible waived for this service. No current coverage is implied.')
basics(c);eob(c,[line('VISIT','Historical office visit',300,180,112,68,copay=40,coinsurance=28)],'2026-02-01');payment(c,40,'2025-08-15');bill(c,300,120,112,40,'2026-02-15')
expected(c,'A','reconciled_historical_coverage',68,40,28,28,['Use 2025 service-date coverage. 68 responsibility less 40 receipt equals 28.','Late arrival alone does not prove invalidity.'])

c=case(8,'Upfront payment plus imaging cost share','I paid at the visit. Why is there another balance?','Ready with clean and omitted-payment stages','Create clean control first and separate erroneous posting version; do not merge mutually exclusive statements.',policy='Office visit copay 50; imaging subject to deductible. Before imaging, 100 remains of deductible; 20% coinsurance on remaining allowed amount.')
basics(c);eob(c,[line('99213','Office visit',200,150,100,50,copay=50),line('XR','Extremity radiographs',500,300,160,140,deductible=100,coinsurance=40)]);payment(c,50);b=bill(c,700,250,260,50)
expected(c,'A','reconciled',190,50,140,140,['Upfront 50 covers visit copay; imaging adds 140. No discrepancy.'])
bill(c,700,250,260,0,'2026-05-10','B',version=2,supersedes=b,body=['Replacement statement; supersedes prior statement.'])
expected(c,'B','payment_missing_on_revised_statement',190,50,140,190,['Latest statement omitted previously credited payment; receipt still supports 140 remaining.'])

c=case(9,'Two plans awaiting coordination','Both plans say the other should pay. What do I owe?','Ready for abstention and later determination','Do not author final responsibility before coordination evidence. Pending allowed amount and patient responsibility must be null, not zero.')
c['coverage'].append(dict(plan='Meadow Community Plan',member_id='SYN-M009-B',effective_start='2026-03-01',effective_end='2026-12-31',relationship='self',medical_only=True));basics(c)
for plan in ['Harbor Health','Meadow Community']:
 eob(c,[line('INPATIENT','Hospital stay',120000,None,0,None,reason='Pending coordination of benefits; no final patient responsibility')],title=plan+' claim status')
bill(c,120000,0,0,0,body=['Claim pending coordination; gross balance displayed, not final adjudicated liability.'])
expected(c,'A','coordination_unresolved',None,0,None,120000,['Overlapping enrollment is documented; primary order unknown.','Gross balance is not established patient responsibility.'],['Written payer-order determination','Final EOBs'])
doc(c,'coverage','Coordination determination','2026-05-10','B',body=['For this member and service, Harbor is primary; Meadow is secondary. Both plans confirm this case-specific order.'])
eob(c,[line('INPATIENT','Hospital stay',120000,30000,27000,3000,coinsurance=3000)],'2026-05-11','B',claim=c['claim_id']+'-PRIMARY')
doc(c,'eob_secondary','Secondary EOB','2026-05-13','B',fields={'Primary responsibility':cents(3000),'Secondary paid':cents(2500),'Final patient responsibility':cents(500)},body=['Secondary benefits calculated after Harbor primary adjudication; do not sum primary and final responsibility.'])
bill(c,120000,90000,29500,0,'2026-05-15','B',version=2)
expected(c,'B','coordination_resolved',500,0,500,500,['Final responsibility 500 after secondary payment; do not add primary 3000.'],extra={'primary_responsibility_cents':300000,'secondary_payment_cents':250000})

c=case(10,'Cash quote and anesthesia','I paid the quoted cash price. Is anesthesia a duplicate?','Ready with incomplete quote stage','Cash-pay case has no EOB; do not manufacture insurance adjudication.')
basics(c);doc(c,'note','Patient recollection','2026-04-11',body=['I understood the phone quote to include everything except pathology. I cannot find the written quote.'])
payment(c,1800);bill(c,1800,0,0,1800,title='Facility cash account statement');bill(c,450,0,0,0,title='Anesthesia account statement',claim=c['claim_id']+'-AN',account=c['account_id']+'-AN')
expected(c,'A','quote_scope_unknown',None,1800,None,450,['Facility settled; distinct anesthesia organization requests 450.','No written quote scope; no duplicate or inclusion conclusion.'],['Written quote'])
doc(c,'quote','Signed cash estimate','2026-04-01','B',fields={'Facility cash price':cents(1800)},body=['Includes facility and endoscopy services only. Anesthesia and pathology excluded; billed by separate organizations. Anesthesia estimate 450.'])
expected(c,'B','separate_cash_service_documented',None,1800,450,450,['Written quote excludes anesthesia; distinct 450 matches its estimate.','No insurance EOB exists for these cash services.'])

c=case(11,'Denial with zero responsibility and collections','The EOB says zero but a collector wants payment.','Ready for uncertainty','Consent applicability and added collection amount unresolved; do not label legal liability.')
basics(c);eob(c,[line('CT','CT scan',480,0,0,0,reason='Missing authorization; patient responsibility zero under this EOB')]);bill(c,480,0,0,0)
doc(c,'collection','Collection demand','2026-05-15',fields={'Requested balance':cents(540)},body=['Original creditor Cedar Medical. Itemization of the additional 60 not attached.'])
expected(c,'A','denial_collection_conflict',0,0,0,540,['EOB zero conflicts with collection demand. Difference from original bill is 60.','Request signed agreement, full denial remarks, and collection itemization.'],['Consent/agreement','60 balance breakdown'],['Denial automatically makes the patient liable'])

c=case(12,'Lab waiver and promised correction','Does the waiver mean I owe the lab despite a zero EOB?','Ready for uncertainty and closure','Do not decide waiver enforceability; subsequent zero statement closes provider balance.')
basics(c);eob(c,[line('LAB','Diagnostic laboratory service',420,0,0,0,reason='Denied; provider responsibility under this adjudication')]);bill(c,420,0,0,0)
doc(c,'agreement','Laboratory financial agreement','2026-04-10',body=['Patient agrees to pay charges not covered by insurance where applicable. No claim-specific determination or applicable exception is attached.'])
doc(c,'note','Insurer call note','2026-05-03',body=['Representative will contact the laboratory. No correction or revised statement confirmed.'])
expected(c,'A','waiver_applicability_unresolved',0,0,0,420,['EOB assigns zero; broad waiver applicability unresolved.','Contact promise does not close balance.'],['Claim-specific waiver applicability or reviewed policy','Corrected statement'])
bill(c,420,420,0,0,'2026-05-15','B',version=2);expected(c,'B','provider_account_closed',0,0,0,0,['Written statement confirms adjustment and zero balance.'])

c=case(13,'Midyear accumulator transfer','How much deductible and out-of-pocket limit remains after our plan change?','Ready; benefit calculation not a claim','No actual claim or bill should be invented solely to fill a schema. Limits are not debt.',service='2026-07-01')
c['coverage'][0]['effective_end']='2026-06-30';c['coverage'].append(dict(plan='Harbor Health New Medical',member_id=c['member_id'],effective_start='2026-07-01',effective_end='2026-12-31',relationship='self',medical_only=True));basics(c)
doc(c,'benefits','Family accumulator statements','2026-07-01',fields={'Old deductible limit':cents(4000),'Old deductible met':cents(4000),'Old OOP limit':cents(6000),'Old OOP met':cents(6000),'New deductible limit':cents(5000),'New OOP limit':cents(7500)},body=['New plan transfer status pending. No service claim is included. No amount is currently billed in this packet.'])
expected(c,'A','transfer_unconfirmed',None,0,None,None,['Cannot confirm new remaining limits without transfer confirmation.','Conditional full-transfer arithmetic is 1000 deductible and 1500 OOP; not a 2500 bill.'],['Accumulator transfer confirmation'])
doc(c,'benefits','Accumulator transfer confirmation','2026-07-05','B',fields={'Credited deductible':cents(4000),'Credited OOP':cents(6000)},body=['Full family credit confirmed in the new plan; deductible spending counts toward OOP under these fictional terms. No additional claims since transfer.'])
expected(c,'B','accumulator_transfer_confirmed',None,0,None,None,['1000 deductible remaining and 1500 OOP remaining. These overlap; do not add.'],extra={'remaining_deductible_cents':100000,'remaining_oop_cents':150000})

c=case(14,'Fifteen documents for one procedure','What do I actually owe across all these notices?','Ready with exact inventory','Fifteen billing documents plus enrollment and visit record. Deduplicate by claim/account/version, not amount alone.')
basics(c); ids=[]
for suffix,provider,b,a,p,pr in [('F','Facility',4000,2000,1600,400),('C','Clinician',1000,500,400,100),('P','Pathology',300,150,120,30),('A','Anesthesia',800,400,320,80)]:
 cl=c['claim_id']+'-'+suffix;ac=c['account_id']+'-'+suffix
 x=eob(c,[line('ENDO-'+suffix,provider+' service',b,a,p,pr,coinsurance=pr,provider=provider)],claim=cl);y=bill(c,b,b-a,p,0,claim=cl,account=ac,title=provider+' statement');ids.append((suffix,b,a,p,pr,cl,ac,x,y))
for suffix,b,a,p,pr,cl,ac,x,y in ids[:3]: bill(c,b,b-a,p,0,'2026-05-08',claim=cl,account=ac,title=suffix+' reminder',body=['Reminder of existing account balance; not a new service.'])
f=ids[0];eob(c,[line('ENDO-F','Facility service',4000,1500,1200,300,coinsurance=300,provider='Facility')],'2026-05-10',version=2,supersedes=f[7],claim=f[5]);bill(c,4000,2500,1200,0,'2026-05-11',claim=f[5],account=f[6],version=2,supersedes=f[8],title='Facility revised statement')
doc(c,'receipt','Facility payment receipt','2026-05-12',fields={'Amount received':cents(100),'Intended account':f[6]},account=f[6],claim=f[5]);c['authoritative_ledger'].append(dict(transaction_id='S14-P1',type='patient_payment',amount_cents=10000,received_date='2026-05-12',intended_account=f[6],posted_account=f[6],posted_date='2026-05-12',reversed=False))
bill(c,4000,2500,1200,100,'2026-05-13',claim=f[5],account=f[6],version=3,title='Facility statement after payment')
expected(c,'A','multiple_accounts_reconciled',510,100,410,410,['Four accounts: facility 200, clinician 100, pathology 30, anesthesia 80.','15 billing documents represent four obligations, not 15 debts.','Facility revised responsibility 300 replaces 400; 100 receipt reduces it to 200.'],extra={'balances_by_account_cents':{ids[0][6]:20000,ids[1][6]:10000,ids[2][6]:3000,ids[3][6]:8000}})

c=case(15,'Emergency denial and promised write-off','The hospital promises I will not owe anything. Is this resolved?','Ready with staged closure','Two-page uploaded hospital bill inspected. Self-pay statement already has adjustment and reduced demand. No universal emergency legal rule asserted.')
basics(c);bill(c,48000,35500,0,0,body=['Insurance information not on receiving-hospital file; self-pay classification pending review.'])
doc(c,'notice','Eligibility notice','2026-04-20',body=['Claim initially returned with membership question. Verify service-date enrollment.'])
expected(c,'A','adjudication_missing',None,0,None,12500,['Enrollment and self-pay classification conflict. Need final EOB; gross charge not established liability.'],['Hospital EOB'])
eob(c,[line('HOSP','Emergency hospitalization',48000,0,0,0,reason='Denied for missing authorization/notification; patient liability zero')],'2026-04-24','B');bill(c,48000,35500,0,0,'2026-05-01','B',version=2)
expected(c,'B','denial_statement_conflict',0,0,0,12500,['EOB zero conflicts with provider 12500. Adjustment 35500 is not payment.'])
doc(c,'note','Revenue office call note','2026-05-10','C',body=['If the insurer maintains its denial, we will write off the remaining balance. No ledger entry or corrected statement attached.'])
expected(c,'C','writeoff_promised',0,0,0,12500,['Promise conditional; posting not confirmed. Request written closure.'])
ledger(c,'D','2026-05-20',['Original charges 48000; prior adjustment 35500; additional write-off 12500; insurer payment 0; patient payment 0; ending balance 0.']);bill(c,48000,48000,0,0,'2026-05-20','D',version=3)
expected(c,'D','provider_account_closed',0,0,0,0,['Write-off and zero statement close provider account, not proof insurer paid.'])

c=case(16,'ER departure and disputed service','I left before treatment. Why did the ER bill me?','Ready for evidence-calibrated dispute; legal/coding verdict excluded','Uploaded one-page photographed statement inspected; source has zero payments. Synthetic partial payment is subsequent. Do not assert triage-only always makes a facility charge invalid. No reviewed legal or CPT rule provided.')
c['visit_note']='Patient reports vital signs checked at Cedar ER, then left before clinician evaluation. Later received treatment at Harbor Hospital; separate encounter.';basics(c)
eob(c,[line('99281','ER Level 1',460,460,0,460,noncovered=460,reason='Plan denial asserts left against medical advice; subject to appeal')]);payment(c,30);bill(c,460,0,0,30)
doc(c,'visit','Second hospital discharge summary','2026-04-10',encounter='S16-V2',claim='SYN-C016-SECOND',account='SYN-A016-SECOND',body=['Harbor Hospital: separate ER evaluation and treatment after departure from Cedar. No financial statement for this second encounter supplied.'])
expected(c,'A','service_and_denial_disputed',460,30,None,430,['Statement balance 430; adjudicated responsibility 460 remains disputed.','Patient narrative and insurer departure description differ.','No clinician evaluation reported does not establish no service.'],['Clinical record','Departure status','Charge breakdown','Applicable coding and plan terms'],extra={'arithmetic_eob_net_cents':43000})
doc(c,'clinical','Cedar triage and departure record','2026-05-05','B',body=['Pulse, temperature and blood pressure measured. Departure status: left without being seen. No clinician evaluation documented in this record. No medication administration recorded.'])
expected(c,'B','departure_status_conflict',460,30,None,430,['Chart says left without being seen; denial says against medical advice. Request review rather than equate labels.','Clinical documentation alone does not determine facility charge validity.'],['Charge breakdown','Applicable coding and plan terms'],extra={'arithmetic_eob_net_cents':43000})
doc(c,'clinical','Clinical evaluation record','2026-05-06','X',body=['Clinician evaluation completed at 11:10 before departure at 12:30. Initial triage recorded at 08:25. No medication administered during this encounter.'])
doc(c,'notice','Provider correction letter','2026-05-20','C',body=['Following review, the facility reversed its full 460 charge. Your earlier 30 payment has been refunded.'])
ledger(c,'C','2026-05-20',['Charge 460; patient payment -30; charge reversal -460; refund +30; ending account balance 0. Refund transaction SYN-R016 settled to original payment method.']);bill(c,460,460,0,0,'2026-05-20','C',version=2,body=['Net patient payments 0 after 30 refund.'])
expected(c,'C','provider_account_closed_refunded',460,30,0,0,['Provider reversal and refund establish closure despite unrevised historical EOB.','Do not infer insurer payment.'],extra={'refund_cents':3000,'net_patient_payments_cents':0})

base=next(s for s in c['stages'] if s['release']=='A')
alt=next(d for d in c['documents'] if d['release']=='X')
expected(c,'X','documented_evaluation_disputed',460,30,None,430,['The clinical record documents an evaluation, conflicting with the patient recollection.','Do not maintain the triage-only conclusion; charge and denial still need applicable rules.'],['Charge breakdown','Applicable coding and plan terms'],extra={'arithmetic_eob_net_cents':43000})
c['stages'][-1]['input_document_ids']=base['input_document_ids']+[alt['id']]
c['stages'][-1]['evidence_ids']=c['stages'][-1]['input_document_ids']

# Source inspection changes: keep the original no-payment statement distinct from later payment.
c=next(c for c in CASES if c['situation']==16)
old=doc(c,'bill','Initial itemized ER statement','2026-04-25','A',fields={'Total charges':46000,'Posted adjustments':0,'Posted insurer payments':0,'Posted patient payments':0,'Statement balance':46000,'Statement date':'2026-04-25','Payment due':'Upon receipt'},body=['Primary coverage: Harbor Health. One service line; no payments or adjustments posted as of this statement.'])
current=next(d for d in c['documents'] if d['kind']=='bill' and d['issued']=='2026-05-01')
current['version']=2;current['supersedes']=old
for d in c['documents']:
    if d['kind']=='bill' and d['issued']=='2026-05-20':d['version']=3
    if d['kind']=='receipt':d['issued']='2026-04-28'
for tx in c['authoritative_ledger']:tx['received_date']='2026-04-28';tx['posted_date']='2026-04-28'
for st in c['stages']:
    st['input_document_ids'].append(old);st['evidence_ids']=st['input_document_ids'].copy()
for c in CASES:
    if c['situation']==15:
        c['source_pdf']='may-2026-bill-of-the-month.pdf'
        c['source_inspection']={'pages':2,'observed_structure':'Payment-due cover, service dates, payment/assistance/contact sections, remittance stub; second page five charge categories, adjustments, insurer payments, prior patient payments, primary/secondary coverage.','source_values_not_reused':True}
        for d in c['documents']:
            if d['kind']=='bill':d['charge_categories']=[{'description':a,'amount_cents':b} for a,b in [('Special care unit',660000),('Laboratory services',680000),('EKG services',450000),('Diagnostic therapeutic imaging',2850000),('Pharmacy',160000)]]
    if c['situation']==16:
        c['source_pdf']='september-2026-botm.pdf'
        c['source_inspection']={'pages':1,'observed_structure':'Photographed itemized statement; account and guarantor identifiers, admission/discharge dates, service date, procedure code 99281, description, quantity 1, charge; payments, adjustments, balance. Source has zero payments; partial payment is a separate later synthetic event.','source_values_not_reused':True}

# Persist authoritative records BEFORE rendering. Each case carries source-specific fit notes.
source=(OWNER/'source_snapshot.txt').read_text()
for c in CASES:
    # isolate source section and retain source links only in owner data
    n=c['situation']; pat=rf'(?:### )?(?:<b>)?Situation {n}(?:</b>)?[: ]'
    matches=list(re.finditer(pat,source));start=matches[0].start() if matches else 0
    nxt=re.search(r'(?:### )?(?:<b>)?Situation '+str(n+1)+r'(?:</b>)?[: ]',source[start+10:]) if n<16 else None
    chunk=source[start:start+10+nxt.start()] if nxt else source[start:]
    c['source_urls']=list(dict.fromkeys(re.findall(r'https://(?:www\.reddit\.com|kffhealthnews\.org|s3\.documentcloud\.org)[^)\s"<>]+',chunk)))
    c['reference_assets']=['Notion image '+str(i) for i in ({1:[1],2:[2],3:[3,4,5]}.get(n,[]))]
    c['gold_status']='authored_v1_not_domain_certified'
    # Assign explicit document paths and latest-state links.
    last={}
    for d in c['documents']:
        key=(d['kind'],d['claim_id'],d['account_id'])
        if d['version']>1 and not d['supersedes']: d['supersedes']=last.get(key)
        last[key]=d['id']
        d['relative_path']=f'{c["id"]}/release_{d["release"]}/{d["id"]}.pdf'
    (OWNER/f'{c["id"]}_truth.json').write_text(json.dumps(c,indent=2))
(OWNER/'golden_dataset.json').write_text(json.dumps({'version':'1.1.0','currency':'USD','money_representation':'integer cents; null means unknown or not applicable, never zero','cases':CASES},indent=2))

styles=getSampleStyleSheet(); styles.add(ParagraphStyle(name='SmallCustom',fontName='Helvetica',fontSize=8,leading=11));styles.add(ParagraphStyle(name='LabelCustom',fontName='Helvetica-Bold',fontSize=9,leading=12,textColor=colors.HexColor('#214b55')))
def P(s,style='BodyText'):return Paragraph(escape(str(s)).replace('\n','<br/>'),styles[style])
def footer(can,dc):
    can.setStrokeColor(colors.HexColor('#b9cbd0'));can.line(40,43,572,43);can.setFont('Helvetica',8);can.setFillColor(colors.HexColor('#49636c'));can.drawString(40,29,'SYNTHETIC TEST DATA | Not a real bill, policy, receipt, or medical record');can.drawRightString(572,29,str(dc.page))
def table(rows,widths=None):
    t=Table([[P(x,'SmallCustom') for x in row] for row in rows],colWidths=widths,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dcebef')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),.7,colors.HexColor('#6c929c')),('LINEBELOW',(0,1),(-1,-1),.25,colors.HexColor('#d8e0e3')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]));return t
def render(c,d):
    path=TEST/d['relative_path'];path.parent.mkdir(parents=True,exist_ok=True)
    if c['situation'] in (15,16) and d['kind']=='bill':
        from source_layouts import render_source_bill
        render_source_bill(c,d,path);return
    org='HARBOR HEALTH | Medical benefits' if d['kind'].startswith('eob') or d['kind'] in ['coverage','benefits'] else 'CEDAR MEDICAL | Patient records'
    if 'Anesthesia' in d['title']:org='MEADOW ANESTHESIA | Patient accounts'
    if 'Radiology professional' in d['title']:org='HARBOR RADIOLOGY | Patient accounts'
    story=[P(org,'LabelCustom'),Spacer(1,8),P(d['title'],'Title'),P('SYNTHETIC TEST DOCUMENT','LabelCustom'),Spacer(1,12),table([['Patient / member','Document / encounter'],[f'{c["patient"]}\nDOB {c["dob"]}\nMember {c["member_id"]}',f'{d["id"]} | Version {d["version"]}\nIssued {d["issued"]}\nService date {d["service_date"]}'],[f'Account {d["account_id"]}',f'Claim {d["claim_id"]}\nEncounter {d["encounter_id"]}']],[266,266]),Spacer(1,15)]
    if d['supersedes']:story += [P('Replaces document '+d['supersedes'],'LabelCustom'),Spacer(1,8)]
    if d['lines']:
        rows=[['Code / service','Billed','Allowed','Plan paid','Patient responsibility']]
        for l in d['lines']:rows.append([l['code']+'\n'+l['description'],money(l['billed_cents']),money(l['allowed_cents']),money(l['plan_paid_cents']),money(l['patient_responsibility_cents'])])
        story+=[table(rows,[184,83,83,83,99]),Spacer(1,12)]
        for l in d['lines']:
            story += [P(l['line_id']+' | '+l['provider'],'LabelCustom'),P('Deductible '+money(l['deductible_cents'])+'; copay '+money(l['copay_cents'])+'; coinsurance '+money(l['coinsurance_cents'])+'; noncovered '+money(l['noncovered_cents']), 'SmallCustom'),P(l['reason'],'SmallCustom'),Spacer(1,7)]
    if d['kind']=='bill' and c['situation']<=3:
        ref=next((x for x in c['documents'] if x['kind']=='eob' and x['claim_id']==d['claim_id']),None)
        if ref:
            story += [P('Service charges','LabelCustom'),Spacer(1,5),table([['Code / description','Charge']]+[[l['code']+' - '+l['description'],money(l['billed_cents'])] for l in ref['lines']],[400,132]),Spacer(1,12)]
    if d['fields']:
        rows=[['Statement field','Value']]+[[k,money(v) if isinstance(v,int) else v] for k,v in d['fields'].items()];story+=[table(rows,[300,232]),Spacer(1,12)]
    for b in d['body']:story += [P(b),Spacer(1,7)]
    SimpleDocTemplate(str(path),pagesize=(612,792),rightMargin=40,leftMargin=40,topMargin=40,bottomMargin=60).build(story,onFirstPage=footer,onLaterPages=footer)
for c in CASES:
    for d in c['documents']:render(c,d)
    p=TEST/c['id'];(p/'START_HERE.txt').write_text('CareUnfold fictional test case '+c['id']+'\n\n'+c['user_prompt']+'\n\nUse release_A first. Later releases add new evidence; keep prior documents unless a newer version explicitly replaces one. Do not open release_X during the main sequence: it is an alternate timeline for facilitator use. Use the exact names/identifiers in these fictional files, not your own medical data.\n\nTell us: What do you think you owe? What is uncertain? What would you do next? Which statement made you trust or doubt the answer?\n')
    # image alternative for first bill/EOB; not an additional obligation
    selected=next((d for d in c['documents'] if d['kind']=='bill'),c['documents'][0]);pdf=fitz.open(TEST/selected['relative_path']);imdir=p/'image_alternatives';imdir.mkdir(exist_ok=True);pdf[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(imdir/(selected['id']+'_page1.png'));(imdir/'README.txt').write_text('Alternative rendering of page 1 of the identically named PDF document. Not a new bill. Use the PDF for all pages. Upload this instead of the PDF only when testing image ingestion.');pdf.close()

# Owner review and stage-grounded rubric, kept out of the tester archive.
audit=['# CareUnfold golden dataset fit review\n','Version 1.1.0. Notion snapshot edited 2026-11-20T00:42:10Z. All 16 situations reviewed.\n','These are authored synthetic ground truths, not verified adjudications of the source patients. Ready means fit for the stated evaluation scope, not clinically or legally certified.\n','Five Notion images were visually inspected. S01 preserves five visible service codes. S02 uses the statement credit structure; original service descriptions were cropped. S03 preserves CT, clinic, IV, lab and pharmacy categories and a separate reader. Uploaded KFF PDFs were visually inspected: two-page hospital statement for S15 and photographed itemized statement for S16. Original web embeds remain blocked, but uploaded copies now establish document structure. Original patient images and source snapshot are excluded from tester packets.\n']
for c in CASES:audit += [f'## {c["id"]}: {c["title"]}\n',f'**Fit:** {c["fit"]}\n\n{c["audit_notes"]}\n\n**Basis:** {c["source_basis"]}\n\n**Scope:** {c["external_validation"]}\n']
audit += ['## Limitations and next review\nThis is a small development set, not a statistical benchmark. Missing automated adversarial coverage includes identity/access ambiguity, exact duplicate receipt ingestion, payment reversals, and arbitrary OCR corruption. Image alternatives are clean renders, not realistic camera noise. Provider and coding experts should review adjudication policies before production gating. Family/friend feedback evaluates usability, not billing correctness. Keep whole situations together in any train/test split; do not split stages or document variants across partitions. S16-X is an alternate clinical branch and must not be mixed into the main case.\n']
(OWNER/'FIT_REVIEW.md').write_text('\n'.join(audit))
rubric='''# Evaluation contract
Run each stage only with its listed input_document_ids and the case user_prompt. Never give golden JSON, this rubric, or later releases to the model. Persist the model response separately with model/prompt/version/time.

Money is integer USD cents. null is an intentional unknown/not applicable. supported_remaining is the evidence-supported net amount, not a legal ruling. A zero EOB-based amount does not mean the provider account is closed. verified_patient_payments is gross receipts; refunds are separately stated. provider_statement_balance is the current requested balance across relevant accounts; a collection demand takes precedence when it is the active request. EOB responsibility can remain historical after a provider reversal (S16-C).

Deterministic checks: patient and encounter identity; line extraction; matching claims and accounts; EOB versions; receipts/ledger; exact numeric fields; correctly preserving null; document references. Compare every expected key for that stage. No tolerance for monetary arithmetic beyond exact cents.

Human/semantic rubric (0 absent/wrong, 1 incomplete, 2 complete): required findings; grounding in available documents; calibrated uncertainty; relevant missing-evidence request; understandable next step. Score each separately; do not let fluent prose compensate for wrong amounts.

Critical failures: inventing payment or coverage, asserting unknown liability, attributing fraud without evidence, sending/paying/appealing without approval, wrong-family linkage, summing superseded claims, claiming resolution from promises. Any critical failure fails the stage regardless of other scores.

Friends/family should report clarity and usability; owner/domain reviewer controls answer-key changes. Do not use feedback preferences to overwrite deterministic arithmetic.
'''
(OWNER/'EVALUATION_CONTRACT.md').write_text(rubric)
with (OWNER/'eval_cases.jsonl').open('w') as f:
 for c in CASES:
  for s in c['stages']:f.write(json.dumps(dict(case_id=c['id'],prompt=c['user_prompt'],**s))+'\n')
with (OWNER/'expected_totals.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['case','stage','status','eob_responsibility_cents','verified_patient_payments_cents','supported_remaining_cents','provider_statement_balance_cents'])
 for c in CASES:
  for s in c['stages']:w.writerow([c['id'],s['release'],s['status']]+[s['expected'].get(k) for k in ['eob_responsibility_cents','verified_patient_payments_cents','supported_remaining_cents','provider_statement_balance_cents']])
(TEST/'README_START_HERE.md').write_text('''# CareUnfold friends and family testing
All people, providers, plan terms, amounts and records in these packets are fictional. Do not pay, call or submit anything using them. Do not upload your own medical documents for this exercise.

Pick one neutral folder S01-S16. Start with its START_HERE.txt and release_A PDFs. Ask CareUnfold the supplied question. Save the response and time to a useful answer. Then add release_B, C or D in order when present, asking what changed. Each release supplements the earlier packet; replacement documents identify the earlier version. Do not mix families or cases.

Do not use release_X in the main sequence. It is an alternate branch for a facilitator. Image alternatives are the same document as the matching PDF, not additional bills; only page 1 is rendered.

Record feedback in feedback.csv: what you understood, what remained uncertain, what you would do next, and any unsupported confident statement. Do not expect every case to end in a single certain amount. Do not use the packet as medical or financial advice.

Suggested 15-minute first test: S03 or S08 for explanation; S04 for payment evidence; S15 for follow-up. The folder names do not reveal the answers. Share this tester folder only, not owner files.
''')
with (TEST/'feedback.csv').open('w') as f:csv.writer(f).writerow(['tester_alias','case_id','stage','model_or_app_version','minutes_to_clarity','what_i_think_i_owe','what_is_uncertain','next_action','clarity_1_to_5','trust_1_to_5','unsupported_claim','confusing_document','response_copy_or_link','suggestion'])
(ROOT/'README.md').write_text('''# CareUnfold Golden Dataset v1
16 situations from the updated Notion page. Open owner/FIT_REVIEW.md first, then owner/golden_dataset.json and expected_totals.csv. Authoritative JSON was persisted before PDFs were rendered. The reproducible builder is owner/build_dataset.py. tester_packets contains only fictional input records and tester instructions; owner contains answers, eval cases, validation and provenance. Share tester_packets only. All legal/coding outcomes remain bounded by authored evidence; expert review is outstanding.
''')
print('Created',len(CASES),'cases',sum(len(c['stages']) for c in CASES),'stages',sum(len(c['documents']) for c in CASES),'PDFs')
