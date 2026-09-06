import subprocess,time,json,os
from pathlib import Path
out=Path(__file__).resolve().parent
checks=[('api',['npm','run','test:api']),('web-core',['npm','run','test:web-core']),('legacy',['npm','run','test:web:legacy']),('v4-check',['npm','run','check:web:v4']),('scripts',['npm','run','test:scripts']),('build',['npm','run','build:web']),('prisma',['npm','run','prisma:validate'])]
results=[]
for name,cmd in checks:
 start=time.monotonic();env=os.environ.copy()
 if name=='prisma':env['DATABASE_URL']='postgresql://review:review@127.0.0.1:1/isolated_schema_validation_only'
 with (out/(name+'.log')).open('w') as f:
  try:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,env=env,timeout=600);code=r.returncode
  except subprocess.TimeoutExpired:code='timeout'
 results.append({'name':name,'command':cmd,'exitCode':code,'seconds':round(time.monotonic()-start,3)})
 (out/'标准检查结果.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(results[-1]),flush=True)
