from pathlib import Path
import json,csv,hashlib
import fitz

ROOT=Path(__file__).resolve().parents[1]; O=ROOT/'owner';T=ROOT/'tester_packets'
x=json.loads((O/'golden_dataset.json').read_text()); failures=[];checks=0;manifest=[];claims=[];coverage=[];ledger=[]
def check(ok,msg):
 global checks
 checks+=1
 if not ok:failures.append(msg)
for c in x['cases']:
 ids={d['id'] for d in c['documents']};check(len(ids)==len(c['documents']),c['id']+' unique IDs')
 for cv in c['coverage']:coverage.append({'case_id':c['id'],**cv})
 for tx in c['authoritative_ledger']:ledger.append({'case_id':c['id'],'record_type':'payment_transaction','data':json.dumps(tx)})
 for d in c['documents']:
  check(not d['supersedes'] or d['supersedes'] in ids,d['id']+' replacement target')
  if d['supersedes']:
   old=next(a for a in c['documents'] if a['id']==d['supersedes']);check(old['claim_id']==d['claim_id'],d['id']+' same claim on replacement');check(old['issued']<=d['issued'],d['id']+' replacement chronological')
  for l in d['lines']:
   claims.append({'case_id':c['id'],'document_id':d['id'],'version':d['version'],'claim_id':d['claim_id'],**l})
   if l['allowed_cents'] is not None:
    check(l['allowed_cents']==l['plan_paid_cents']+l['patient_responsibility_cents'],d['id']+' allowed balance')
    check(l['patient_responsibility_cents']==sum(l[k] for k in ['deductible_cents','copay_cents','coinsurance_cents','noncovered_cents']),d['id']+' responsibility components')
   else:check(l['patient_responsibility_cents'] is None,d['id']+' unknown adjudication')
  if d['kind']=='bill':
   f=d['fields'];check(f['Statement balance']==f['Total charges']-f['Posted adjustments']-f['Posted insurer payments']-f['Posted patient payments'],d['id']+' statement arithmetic')
   ledger.append({'case_id':c['id'],'record_type':'provider_posting_snapshot','data':json.dumps({'document_id':d['id'],'date':d['issued'],'account':d['account_id'],**f})})
  p=T/d['relative_path'];check(p.exists(),d['id']+' file exists');pdf=fitz.open(p);txt=''.join(pg.get_text() for pg in pdf)
  check(d['id'] in txt,d['id']+' extracted identifier');check(c['patient'] in txt,d['id']+' extracted patient');check('SYNTHETIC TEST' in txt,d['id']+' synthetic mark')
  if d['kind']=='bill':check(f"${d['fields']['Statement balance']/100:,.2f}" in txt,d['id']+' rendered balance')
  for pg in pdf:
   pg.get_pixmap(matrix=fitz.Matrix(.4,.4))
   for b in pg.get_text('blocks'):
    check(b[0]>=35 and b[2]<=578 and b[1]>=20 and b[3]<=775,d['id']+' text within page bounds')
  manifest.append({'case_id':c['id'],'document_id':d['id'],'kind':d['kind'],'release':d['release'],'issued':d['issued'],'version':d['version'],'supersedes':d['supersedes'],'path':d['relative_path'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'pages':len(pdf)});pdf.close()
 for s in c['stages']:
  check(set(s['input_document_ids'])<=ids,s['id']+' valid inputs');check(set(s['evidence_ids'])<=set(s['input_document_ids']),s['id']+' available evidence only')
  for id in s['input_document_ids']:
   d=next(d for d in c['documents'] if d['id']==id)
   check(d['release']<=s['release'] or s['release']=='X',s['id']+' no future evidence')
  if s['release']=='X':check(not any(d['release'] in ['B','C'] for d in c['documents'] if d['id'] in s['input_document_ids']),s['id']+' alternate excludes main followup')
# Independent target checks for principal traps, authored independently of renderer.
expected={'S01-A':(16500,7500,9000,16500),'S02-A':(31200,7500,23700,153700),'S03-A':(170000,0,170000,170000),'S04-A':(4000,2500,1500,4000),'S05-A':(3000,3000,0,1800),'S06-A':(0,0,0,68000),'S07-A':(6800,4000,2800,2800),'S08-A':(19000,5000,14000,14000),'S09-A':(None,0,None,12000000),'S09-B':(50000,0,50000,50000),'S10-A':(None,180000,None,45000),'S11-A':(0,0,0,54000),'S12-A':(0,0,0,42000),'S13-A':(None,0,None,None),'S14-A':(51000,10000,41000,41000),'S15-C':(0,0,0,1250000),'S16-A':(46000,3000,None,43000),'S16-C':(46000,3000,0,0)}
for c in x['cases']:
 for s in c['stages']:
  if s['id'] in expected:check(tuple(s['expected'][k] for k in ['eob_responsibility_cents','verified_patient_payments_cents','supported_remaining_cents','provider_statement_balance_cents'])==expected[s['id']],s['id']+' independent target')
check(len([d for c in x['cases'] if c['id']=='S14' for d in c['documents'] if d['kind'] not in ['coverage','visit']])==15,'S14 fifteen billing documents')
for name,rows in [('document_manifest',manifest),('claim_lines',claims),('coverage_dates',coverage),('payment_and_posting_ledger',ledger)]:
 keys=list(dict.fromkeys(k for r in rows for k in r))
 with (O/(name+'.csv')).open('w') as f:
  w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows(rows)
report={'checks':checks,'failures':failures,'cases':len(x['cases']),'stages':sum(len(c['stages']) for c in x['cases']),'pdfs':len(manifest),'pages':sum(d['pages'] for d in manifest),'scope':'Arithmetic, cross references, exact key targets, PDF extraction and bounds; not independent domain certification.'}
(O/'validation_report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));assert not failures
