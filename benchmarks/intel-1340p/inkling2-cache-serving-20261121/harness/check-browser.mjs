import fs from 'node:fs';
const ws='/var/home/agent/workspace',run=ws+'/tmp/llama-cpp/runs/inkling-cache-serving-20261121-1dadee62b';
const {chromium}=await import(ws+'/.piclaw/tmp/bun-cache/playwright@1.64.1@@@1/index.mjs');
const status=s=>fs.writeFileSync(run+'/browser.status',s+'\n');
const browser=await chromium.launch({headless:true,executablePath:ws+'/tmp/llama-cpp/cache/playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],bad=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push({url:r.url(),status:r.status()});});
try{
  status('loading UI');await page.goto('http://192.168.1.70:11434/',{waitUntil:'networkidle',timeout:45000});
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/chat/completions')&&r.request().method()==='POST',{timeout:0});
  const box=page.locator('textarea:visible').first();await box.fill('Reply with exactly OK.');await box.press('Enter');
  const r=await responsePromise;fs.writeFileSync(run+'/browser-request.json',JSON.stringify(JSON.parse(r.request().postData()),null,2)+'\n');status('HTTP'+r.status()+' generating; waiting for native stream completion, no generation timeout');
  const failure=await r.finished();if(failure)throw failure;
  const raw=await r.text();fs.writeFileSync(run+'/browser-stream.txt',raw);
  const events=raw.split('\n').filter(l=>l.startsWith('data: ')).map(l=>l.slice(6)).filter(l=>l!=='[DONE]').map(JSON.parse);
  const answer=events.map(x=>x.choices?.[0]?.delta?.content??'').join(''),reasoning=events.map(x=>x.choices?.[0]?.delta?.reasoning_content??'').join(''),finish=events.map(x=>x.choices?.[0]?.finish_reason).filter(Boolean).at(-1),timings=events.map(x=>x.timings).filter(Boolean).at(-1);
  await page.waitForTimeout(1000);await page.screenshot({path:run+'/browser-chat.png',fullPage:true});
  const req=JSON.parse(r.request().postData()),unexpected=bad.filter(x=>!(x.status===403&&new URL(x.url).pathname==='/tools'));
  const result={verified_at:new Date().toISOString(),url:page.url(),title:await page.title(),answer,reasoning,finish,timings,request:req,errors,unexpected_responses:unexpected,disabled_optional_tools:bad.filter(x=>x.status===403)};
  fs.writeFileSync(run+'/browser-chat.json',JSON.stringify(result,null,2)+'\n');
  if(r.status()!==200||errors.length||unexpected.length||answer.trim()!=='OK'||!reasoning.length||finish!=='stop'||!raw.includes('[DONE]')||req.max_tokens!==undefined||req.n_predict!==undefined)throw Error('Browser/uncapped-thinking/EOG check failed');
  status('PASS: real UI chat, visible separated thinking, answer OK, native stop, no output cap');console.log(JSON.stringify({answer,reasoning_chars:reasoning.length,finish,errors,unexpected_responses:unexpected,timings},null,2));
}catch(e){status('FAIL: '+e.message);throw e;}finally{await browser.close();}
