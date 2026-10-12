"""Download public test documents, retaining their provenance."""
from pathlib import Path
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1] / 'sample-papers'
SAMPLES = [
    ('handwritten-maths-cbse-2023.pdf', 'https://www.cbse.gov.in/cbsenew/model-answer/2023/X/MAthematics_basic_241.pdf', 'CBSE handwritten model answerbook; question text may be absent.'),
    ('handwritten-science-cbse-2023.pdf', 'https://www.cbse.gov.in/cbsenew/model-answer/2023/X/Science_086.pdf', 'CBSE handwritten model answerbook; question text may be absent.'),
    ('handwritten-chemistry-cbse-2023.pdf', 'https://www.cbse.gov.in/cbsenew/model-answer/2023/XII/Chemistery_043.pdf', 'CBSE handwritten model answerbook; question text may be absent.'),
    ('typed-addition-with-solutions.pdf', 'https://math-drills.com/addition/addition_one_digit_1_001.1711552111.pdf', 'Typed worksheet and publisher solutions, not a student submission.'),
    ('typed-arithmetic-with-solutions.pdf', 'https://math-drills.com/addition/add01nrg64_001.1602884016.pdf', 'Typed worksheet and publisher solutions, not a student submission.'),
    ('math-exam-photo.jpg', 'https://upload.wikimedia.org/wikipedia/commons/8/86/Math_Test.jpg', 'Aft.x-star, Math Test, CC BY-SA 4.0; https://commons.wikimedia.org/wiki/File:Math_Test.jpg'),
]

def download(sample):
    name, url, note = sample
    request = Request(url, headers={'User-Agent': 'AutoCheck-SampleDownloader/1.0 (educational local testing)'})
    with urlopen(request, timeout=90) as response:
        data = response.read(10 * 1024 * 1024 + 1)
    if len(data) > 10 * 1024 * 1024:
        raise ValueError(f'{name} exceeds 10 MB')
    signature = b'%PDF-' if name.endswith('.pdf') else b'\xff\xd8\xff'
    if not data.startswith(signature):
        raise ValueError(f'{name} has an unexpected file signature')
    (ROOT / name).write_bytes(data)
    print(f'Saved {name}: {len(data)} bytes', flush=True)
    return dict(file=name, source=url, note=note, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())

if __name__ == '__main__':
    ROOT.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        records = list(pool.map(download, SAMPLES))
    (ROOT / 'sources.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
