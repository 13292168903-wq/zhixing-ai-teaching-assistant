export const BATCH_CSV='course_id,title,template_id,department,teacher,classes\r\nintro_computing,计算思维入门,concept,计算机学院,张老师,计科一班|计科二班\r\nreasoning_basics,逻辑练习入门,objective,通识教育中心,李老师,通识一班\r\n';

export function parseCourseCSV(source){
 const input=source.replace(/^\uFEFF/,'');const records=[];let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<input.length;i++){
  const ch=input[i];
  if(quoted){if(ch==='"'&&input[i+1]==='"'){cell+='"';i++;}else if(ch==='"'){quoted=false;closed=true;}else cell+=ch;continue;}
  if(ch==='"'){if(cell||closed)throw new Error('CSV 引号位置不合法');quoted=true;continue;}
  if(ch===','||ch==='\n'||ch==='\r'){
   row.push(cell);cell='';closed=false;
   if(ch!==','){if(ch==='\r'&&input[i+1]==='\n')i++;if(row.some(x=>x!==''))records.push(row);row=[];}continue;
  }
  if(closed)throw new Error('CSV 引号后只能出现分隔符');cell+=ch;
 }
 if(quoted)throw new Error('CSV 引号未闭合');if(cell||row.length){row.push(cell);if(row.some(x=>x!==''))records.push(row);}
 if(records.length<2)throw new Error('CSV 至少需要表头和一行课程');
 const headers=records.shift().map(s=>s.trim()),allowed=['course_id','title','template_id','department','teacher','classes','topics_json','version'];
 if(new Set(headers).size!==headers.length||headers.some(h=>!allowed.includes(h))||['course_id','title','template_id','department','teacher'].some(h=>!headers.includes(h)))throw new Error('CSV 表头需包含 course_id,title,template_id,department,teacher；可选 classes,topics_json,version');
 return records.map((cells,index)=>{
  if(cells.length!==headers.length)throw new Error('CSV 第 '+(index+2)+' 行列数不一致');
  const r=Object.fromEntries(headers.map((h,i)=>[h,cells[i].trim()]));
  let topics=[];try{topics=r.topics_json?JSON.parse(r.topics_json):[];}catch{throw new Error('CSV 第 '+(index+2)+' 行 topics_json 不合法');}
  return {...r,classes:r.classes?r.classes.split('|').map(s=>s.trim()):[],topics};
 });
}
