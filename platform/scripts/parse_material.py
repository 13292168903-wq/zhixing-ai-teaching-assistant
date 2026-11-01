"""Read uploaded bytes; never follow links, execute macros, or fetch resources."""
import sys, json, base64, io, re, zipfile
from html.parser import HTMLParser

class Article(HTMLParser):
    def __init__(self):
        super().__init__(); self.frames=[]; self.parts=[]; self.heading='正文'; self.anchor=''; self.capture=None; self.body=[]; self.restrict=False
    def visible(self):
        return (not self.restrict or any(f[1] for f in self.frames)) and not any(f[2] for f in self.frames)
    def flush(self):
        text=' '.join(self.body).strip(); self.body=[]
        if text: self.parts.append({'text':text,'locator':{'section':self.heading,'anchor':self.anchor}})
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag not in ('br','hr','img','meta','link','input','source','wbr'):
            self.frames.append((tag,tag=='main' or a.get('role')=='main',tag in ('script','style','nav','footer','aside') or 'headerlink' in a.get('class',''),a.get('id','')))
        if tag in ('h1','h2','h3','h4') and self.visible():
            self.flush(); self.capture=[]; self.anchor=a.get('id') or next((f[3] for f in reversed(self.frames) if f[3]),'')
    def handle_endtag(self,tag):
        if tag in ('h1','h2','h3','h4') and self.capture is not None:
            title=' '.join(self.capture).strip()
            if title: self.heading=title[:200]
            self.capture=None
        for i in range(len(self.frames)-1,-1,-1):
            if self.frames[i][0]==tag: self.frames=self.frames[:i]; break
    def handle_data(self,data):
        if self.visible() and data.strip():
            if self.capture is not None: self.capture.append(data.strip())
            else: self.body.append(data.strip())

def parse(req):
    data=base64.b64decode(req['content_base64'],validate=True); ext=req['extension']
    if len(data)>5*1024*1024: raise ValueError('file_too_large')
    pages=[]; warnings=[]
    if ext=='.pdf':
        from pypdf import PdfReader
        reader=PdfReader(io.BytesIO(data),strict=False)
        if reader.is_encrypted: raise ValueError('encrypted_pdf_not_supported')
        if len(reader.pages)>500: raise ValueError('too_many_pages')
        for i,page in enumerate(reader.pages):
            text=page.extract_text() or ''
            if len(text.strip())<15: warnings.append(f'page_{i+1}_empty_or_scanned')
            pages.append({'text':text,'locator':{'page':i+1}})
        warnings.append('PDF text only; diagrams, formulas and reading order require review')
    elif ext=='.docx':
        from docx import Document
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if sum(i.file_size for i in z.infolist())>30*1024*1024: raise ValueError('expanded_file_too_large')
        doc=Document(io.BytesIO(data)); n=0
        for paragraph in doc.paragraphs:
            n+=1
            if paragraph.text.strip(): pages.append({'text':paragraph.text,'locator':{'paragraph':n}})
        for i,table in enumerate(doc.tables):
            for j,row in enumerate(table.rows): pages.append({'text':' | '.join(c.text for c in row.cells),'locator':{'table':i+1,'row':j+1}})
        warnings.append('DOCX text/tables only; equations and drawings require review')
    elif ext in ('.html','.htm'):
        html=data.decode('utf-8-sig');parser=Article();parser.restrict=bool(re.search(r'<main\b|role=["\']main["\']',html));parser.feed(html);parser.flush();pages=parser.parts
    else:
        text=data.decode('utf-8-sig'); heading='正文'
        for i,p in enumerate(re.split(r'\n\s*\n',text)):
            if ext=='.md' and p.startswith('#'): heading=p.splitlines()[0].lstrip('# ').strip()
            if p.strip(): pages.append({'text':p,'locator':{'paragraph':i+1,'section':heading}})
    if sum(len(p['text']) for p in pages)>1000000: raise ValueError('extracted_text_too_large')
    if sum(len(p['text'].strip()) for p in pages)<15: raise ValueError('empty_or_scanned_document_ocr_required')
    return {'segments':pages,'warnings':warnings}

try: print(json.dumps({'ok':True,**parse(json.load(sys.stdin))},ensure_ascii=False))
except Exception as exc: print(json.dumps({'ok':False,'error':str(exc)[:300]},ensure_ascii=False))
