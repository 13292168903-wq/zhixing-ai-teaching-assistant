"""Disposable parser fixtures, not teacher-authored course documents."""
from pathlib import Path
import sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from pypdf import PdfReader,PdfWriter
from docx import Document
root=Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
c=canvas.Canvas(str(root/'chinese.pdf'))
for i in range(2):
    c.setFont('STSong-Light',12);c.drawString(60,760,f'第{i+1}页：列表是可变对象，赋值不复制同一列表。');c.showPage()
c.save()
blank=PdfWriter();blank.add_blank_page(300,300)
with (root/'scanned.pdf').open('wb') as f: blank.write(f)
encrypted=PdfWriter();encrypted.append(PdfReader(str(root/'chinese.pdf')));encrypted.encrypt('fixture-password')
with (root/'encrypted.pdf').open('wb') as f: encrypted.write(f)
doc=Document();doc.add_heading('合成资料解析测试',1);doc.add_paragraph('中文列表 list 保留对象引用，原地修改可被观察到。');doc.save(root/'chinese.docx')
(root/'broken.pdf').write_bytes(b'%PDF-this-is-not-a-valid-document')
print('Disposable fixtures created')
