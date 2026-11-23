from reportlab.pdfgen import canvas
from reportlab.lib import colors

def cash(n):return f'${n/100:,.2f}'
def render_source_bill(c,d,path):
    cv=canvas.Canvas(str(path),pagesize=(612,792));f=d['fields'];blue=colors.HexColor('#126489')
    def text(x,y,t,size=10,font='Helvetica',color=colors.black):
        cv.setFillColor(color);cv.setFont(font,size);cv.drawString(x,y,str(t))
    def right(y,t):
        cv.setFillColor(colors.black);cv.setFont('Helvetica-Bold',10);cv.drawRightString(565,y,str(t))
    def line(y):cv.setStrokeColor(blue);cv.line(40,y,572,y)
    def foot(page):
        text(40,38,'SYNTHETIC TEST DATA | Not payable | All identities and amounts fictional',8)
        text(40,25,d['id']+' | Version '+str(d['version'])+' | Page '+str(page),8)
    def head():
        text(40,748,'VALLEY MEDICAL' if c['situation']==15 else 'CEDAR EMERGENCY DEPARTMENT',17,'Helvetica-Bold',blue)
        text(40,727,'Patient billing statement | SYNTHETIC',10)
        text(40,700,c['patient']+' | DOB '+c['dob'],10)
        text(40,682,'Account '+d['account_id']+' | Claim '+d['claim_id'],10)
        text(40,664,'Document '+d['id']+' | Encounter '+d['encounter_id'],10)
        text(40,646,'Service '+d['service_date']+' | Issued '+d['issued'],10)
        if d['supersedes']:text(40,628,'Replaces '+d['supersedes'],9)
        line(615)
    head()
    if c['situation']==15:
        text(40,583,'PAYMENT DUE',12,'Helvetica-Bold',blue);right(583,cash(f['Statement balance']))
        text(40,555,'This is your Valley Medical hospital bill.',17,'Helvetica-Bold',blue)
        text(40,528,'Coverage in the billing system: SELF PAY / CONTINUUM OF CARE',10)
        text(40,510,'Insurance information requires reconciliation with the enrollment record.',10)
        text(40,478,'YOUR NEXT STEP',13,'Helvetica-Bold',blue)
        for y,title,detail in [(437,'PAYMENT PLAN','Contact the fictional billing office to discuss available arrangements.'),(373,'FINANCIAL ASSISTANCE','An application can be requested; approval is not established by this bill.'),(309,'ACCOUNT QUESTIONS','Ask the billing office to verify insurance information and account postings.')]:
            text(40,y,title,12,'Helvetica-Bold',blue);text(40,y-22,detail,10)
        line(232);text(40,212,'REMITTANCE SUMMARY - TEST ONLY; DO NOT SEND PAYMENT',10,'Helvetica-Bold')
        text(40,184,'Billing date: '+d['issued']);text(40,164,'Account: '+d['account_id']);right(184,'Amount due: '+cash(f['Statement balance']))
        text(40,138,'No real address, payment link, card-entry fields or telephone number.',9)
        foot(1);cv.showPage();head()
        text(40,588,'CHARGES INCLUDED',12,'Helvetica-Bold',blue)
        y=563
        for row in d['charge_categories']:text(40,y,row['description'],10);right(y,cash(row['amount_cents']));y-=23
        line(y+7)
        for label,key in [('Total charges','Total charges'),('Insurance / account adjustments','Posted adjustments'),('Amount insurance paid','Posted insurer payments'),('Your previous payments (net)','Posted patient payments'),('Balance you owe now','Statement balance')]:
            text(40,y-14,label,10,'Helvetica-Bold',blue);right(y-14,cash(f[key]));y-=29
        text(40,245,'PRIMARY INSURANCE IN BILLING SYSTEM',10,'Helvetica-Bold',blue)
        text(40,226,'SELF PAY / CONTINUUM OF CARE',10)
        text(40,197,'SECONDARY INSURANCE: NONE ON FILE',10)
        if d['release']=='D':text(40,160,'Account closed by adjustment; this does not represent insurer payment.',10)
        foot(2)
    else:
        text(40,588,'Admission / discharge: '+d['service_date']+' / '+d['service_date'],10,'Courier')
        text(40,570,'Primary coverage: HARBOR HEALTH MEDICAL',10,'Courier')
        text(40,539,'CHARGES',11,'Courier-Bold')
        text(40,519,'Service date  Code   Description              Qty    Amount',10,'Courier')
        text(40,497,d['service_date']+'    99281  Emergency Room Level 1     1     460.00',10,'Courier')
        line(485);text(40,466,'Total for 1 charge',10,'Courier');right(466,cash(f['Total charges']))
        text(40,429,'PAYMENTS',11,'Courier-Bold')
        text(40,407,'Harbor Health - posted insurance payment',10,'Courier');right(386,cash(f['Posted insurer payments']))
        text(40,363,'Patient payments, net of refunds',10,'Courier');right(342,cash(f['Posted patient payments']))
        text(40,307,'ADJUSTMENTS',11,'Courier-Bold');right(284,cash(f['Posted adjustments']))
        line(265);text(40,240,'BALANCE',12,'Courier-Bold');right(240,cash(f['Statement balance']))
        if d['release']=='C':text(40,205,'Full charge reversed; previous $30 payment refunded.',10)
        foot(1)
    cv.save()
