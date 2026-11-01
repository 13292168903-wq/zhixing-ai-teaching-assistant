"""Execute ONLY fixed project-authored references, never MBPP/student code.

The allowlist is a trust boundary for this offline corpus, not a general sandbox.
Production submissions must use a separately isolated execution service.
"""
import ast, contextlib, io, json, sys
from catalog import PY_PRACTICE, PY_EVAL

APPROVED={row[2] for row in PY_PRACTICE+PY_EVAL}
SAFE_BUILTINS={'print':print,'list':list,'len':len,'range':range,'sum':sum,'sorted':sorted}

def verify_code(code):
    if code not in APPROVED:raise ValueError('Reference is not in the fixed authored-code allowlist')
    tree=ast.parse(code)
    if any(isinstance(n,(ast.Import,ast.ImportFrom,ast.While,ast.With,ast.AsyncFunctionDef)) for n in ast.walk(tree)):
        raise ValueError('Disallowed authored reference syntax')
    functions={n.name for n in ast.walk(tree) if isinstance(n,ast.FunctionDef)}
    for n in ast.walk(tree):
        if isinstance(n,ast.Attribute) and n.attr not in {'append','copy','clear','get'}:raise ValueError('Unexpected attribute')
        if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id not in set(SAFE_BUILTINS)|functions:raise ValueError('Unexpected callable')
    output=io.StringIO()
    env={'__builtins__':SAFE_BUILTINS}
    with contextlib.redirect_stdout(output):exec(compile(tree,'<fixed-authored-reference>','exec'),env)
    return output.getvalue().rstrip('\n')

if __name__=='__main__':
    values=json.load(sys.stdin)
    result=[]
    for item in values:
        try:result.append({'code':item['code'],'stdout':verify_code(item['code']),'status':'executed_fixed_reference'})
        except Exception as exc:result.append({'code':item['code'],'status':'error','error':str(exc)})
    sys.stdout.write(json.dumps(result,ensure_ascii=True))
