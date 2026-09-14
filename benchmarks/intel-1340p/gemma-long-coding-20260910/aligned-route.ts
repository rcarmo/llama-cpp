/** SCRIPT_JDOC:
{"summary":"Experimental token-owned compact GPU cold prefill into retained CPU via validated v2 conversion","kind":"mixed","weight":"heavy","role":"module"}
*/
import{Trial,api,save}from'./campaign';import{convertGemmaV3ToV2}from'../gemma-context-coding-20260910/gemma-state-v2';import{unlinkSync}from'node:fs';
export class Route{
 owned:number[]=[];gpu=false;seq=0;
 constructor(public t:Trial,public hybrid:boolean,public park=true){}
 async request(label:string,body:any){
  const begin=performance.now();let prefill:any;
  if(this.hybrid){
   const rendered=await api('http://127.0.0.1:18792/apply-template',body),tokens=(await api('http://127.0.0.1:18792/tokenize',{content:rendered.prompt,add_special:true,parse_special:true})).tokens;
   let common=0;while(common<Math.min(tokens.length,this.owned.length)&&tokens[common]===this.owned[common])common++;
   if(common<128&&tokens.length>=2048){
    if(!this.gpu){await this.t.start('vulkan');this.gpu=true}
    const file=`aligned-${++this.seq}.slot`,converted=`aligned-${this.seq}-v2.slot`;
    await this.t.req('vulkan',label+'-gpu',{prompt:tokens.slice(0,-1),n_predict:1,cache_prompt:false,id_slot:0,temperature:0});
    await this.t.req('vulkan',label+'-save',{filename:file},'/slots/0?action=save');
    const conversion=convertGemmaV3ToV2(this.t.dir+'/slots/'+file,this.t.dir+'/slots/'+converted);save(this.t.dir+'/'+label+'-conversion.json',conversion);
    await this.t.req('cpu',label+'-restore',{filename:converted},'/slots/0?action=restore');
    const stopStart=performance.now();if(this.park){await this.t.stop('vulkan');this.gpu=false}
    prefill={tokens:tokens.length,park_ms:performance.now()-stopStart};
    unlinkSync(this.t.dir+'/slots/'+file);unlinkSync(this.t.dir+'/slots/'+converted);
   }
   this.owned=tokens;
  }
  const r=await this.t.req('cpu',label,{...body,id_slot:0},'/v1/chat/completions');
  if(prefill&&(r.timings.cache_n<prefill.tokens-2||r.timings.prompt_n>2))throw Error('Aligned cache coverage gate');
  save(this.t.dir+'/route-'+label+'.json',{label,wall_ms:performance.now()-begin,routed:!!prefill,prefill,cache:r.timings?.cache_n,evaluated:r.timings?.prompt_n,usage:r.usage});return r;
 }
}
