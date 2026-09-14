#include "llama.h"
#include "ggml-backend.h"
#include "common.h"
#include "chat.h"
#include "json.h"
#include "speculative.h"
#include "../../projects/llama-cpp/vendor/nlohmann/json.hpp"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <iostream>
#include <fstream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

using json=nlohmann::ordered_json;
using Model=std::unique_ptr<llama_model,decltype(&llama_model_free)>;
using Context=std::unique_ptr<llama_context,decltype(&llama_free)>;
using Sampler=std::unique_ptr<llama_sampler,decltype(&llama_sampler_free)>;
using Clock=std::chrono::steady_clock;
static double seconds(Clock::time_point start){return std::chrono::duration<double>(Clock::now()-start).count();}
struct session {
    std::string model_path,assistant_path;
    bool cpu_only;
    Model target{nullptr,llama_model_free},assistant{nullptr,llama_model_free};
    Context ctx{nullptr,llama_free},draft_ctx{nullptr,llama_free};
    common_speculative_ptr spec;
    common_chat_templates_ptr templates;
    std::vector<llama_token> history;
    int round=0;
    size_t stable_prefix=0;
    int evaluated=0;
    static constexpr int capacity=8192;
    session(std::string model,std::string draft,bool cpu):model_path(model),assistant_path(draft),cpu_only(cpu){}
    llama_context_params params(bool gpu){auto p=llama_context_default_params();p.n_ctx=capacity;p.n_batch=256;p.n_ubatch=256;p.n_seq_max=1;p.n_threads=8;p.n_threads_batch=16;p.type_k=GGML_TYPE_F16;p.type_v=GGML_TYPE_F16;p.flash_attn_type=LLAMA_FLASH_ATTN_TYPE_DISABLED;p.swa_full=false;p.offload_kqv=gpu;p.op_offload=gpu;p.kv_cpu_shared=gpu;p.n_outputs_max=256;p.n_outputs_max_per_seq=256;return p;}
    static Model load(const std::string & path,bool gpu){auto p=llama_model_default_params();p.n_gpu_layers=gpu?999:0;Model m(llama_model_load_from_file(path.c_str(),p),llama_model_free);if(!m)throw std::runtime_error("model load failed");return m;}
    static Context context(llama_model * m,llama_context_params p){Context c(llama_init_from_model(m,p),llama_free);if(!c)throw std::runtime_error("context failed");return c;}
    static void evaluate(llama_context * c,const std::vector<llama_token> & tokens,int first,int n,common_speculative * spec=nullptr,bool all_logits=false){auto b=llama_batch_init(n,0,1);for(int i=0;i<n;i++){b.token[i]=tokens[first+i];b.pos[i]=first+i;b.n_seq_id[i]=1;b.seq_id[i][0]=0;b.logits[i]=all_logits||i==n-1;}b.n_tokens=n;int rc=llama_decode(c,b);bool ok=rc==0&&(!spec||common_speculative_process(spec,b));llama_batch_free(b);if(!ok)throw std::runtime_error("decode or speculative process failed");}
    void assistant_init(){assistant=load(assistant_path,false);auto p=params(false);p.ctx_type=LLAMA_CONTEXT_TYPE_MTP;p.ctx_other=ctx.get();const auto before=llama_memory_seq_pos_max(llama_get_memory(ctx.get()),0);draft_ctx=context(assistant.get(),p);if(llama_memory_seq_pos_max(llama_get_memory(ctx.get()),0)!=before)throw std::runtime_error("borrower cleared target");common_params_speculative config;config.types={COMMON_SPECULATIVE_TYPE_DRAFT_MTP};config.draft.ctx_tgt=ctx.get();config.draft.ctx_dft=draft_ctx.get();config.draft.n_max=3;config.draft.backend_sampling=false;spec.reset(common_speculative_init(config,1));if(!spec)throw std::runtime_error("MTP init failed");}
    json turn(const json & request){
        const auto start=Clock::now();evaluated=0;bool cold=round==0;double handoff_ms=0,load_s=0,prefill_s=0;const auto pos_before=ctx?llama_memory_seq_pos_max(llama_get_memory(ctx.get()),0):-1;llama_kv_handoff_result transfer{};
        if(cold){const auto t=Clock::now();target=load(model_path,!cpu_only);templates=common_chat_templates_init(target.get(),"","");load_s=seconds(t);}
        common_chat_templates_inputs input;
        input.messages=common_chat_msgs_parse_oaicompat(common_json::parse(request.at("messages").dump()));
        input.tools=common_chat_tools_parse_oaicompat(common_json::parse(request.at("tools").dump()));
        input.add_generation_prompt=true;input.enable_thinking=false;input.parallel_tool_calls=false;input.tool_choice=COMMON_CHAT_TOOL_CHOICE_AUTO;input.reasoning_format=COMMON_REASONING_FORMAT_NONE;
        input.now=std::chrono::system_clock::time_point(std::chrono::seconds(1789257600));
        auto chat=common_chat_templates_apply(templates.get(),input);
        const auto * vocab=llama_model_get_vocab(target.get());
        const int count=-llama_tokenize(vocab,chat.prompt.data(),chat.prompt.size(),nullptr,0,true,true);
        const int budget=request.value("max_tokens",512);
        if(count<1||budget<1||budget>1024||count+budget+4>capacity)throw std::runtime_error("context/output budget exceeded");
        std::vector<llama_token> prompt(count);if(llama_tokenize(vocab,chat.prompt.data(),chat.prompt.size(),prompt.data(),count,true,true)!=count)throw std::runtime_error("tokenize");
        // history contains evaluated KV tokens only; the last sampled token is pending until next append.
        // Never claim that unevaluated output token as a cache hit.
        size_t reused=0;while(reused<history.size()&&reused<prompt.size()&&history[reused]==prompt[reused])reused++;
        if(!cold && reused==0)throw std::runtime_error("lost prompt prefix");
        // Tool syntax/whitespace may canonicalise the last assistant turn. It may not rewrite earlier input.
        if(!cold && reused<stable_prefix)throw std::runtime_error("conversation template changed committed input prefix");
        const size_t replayed=cold?0:history.size()-reused;
        if(cold){
            if(!cpu_only && count>4096)throw std::runtime_error("cold prompt too long");
            auto cp=params(!cpu_only);ctx=context(target.get(),cp);
            const auto t=Clock::now();for(int i=0;i<count;i+=256)evaluate(ctx.get(),prompt,i,std::min(256,count-i));llama_synchronize(ctx.get());prefill_s=seconds(t);evaluated+=count;
            if(!cpu_only){
                Model cpu=load(model_path,false);auto dst=context(cpu.get(),params(false));const auto t=Clock::now();if(!llama_kv_handoff_cpu(dst.get(),ctx.get(),true,&transfer)||transfer.copied_bytes)throw std::runtime_error("shared handoff failed");handoff_ms=seconds(t)*1000;
                ctx.reset();target.reset();target=std::move(cpu);ctx=std::move(dst);
            }
            // Template metadata remains owned by templates; use destination vocabulary for all further operations.
            assistant_init();history=prompt;
            if(!llama_memory_seq_rm(llama_get_memory(ctx.get()),0,count-1,-1))throw std::runtime_error("prime rollback");
            evaluate(ctx.get(),prompt,count-1,1,spec.get());evaluated++;
        }else{
            if(reused==prompt.size())reused--;
            if(!llama_memory_seq_rm(llama_get_memory(ctx.get()),0,reused,-1))throw std::runtime_error("prefix rollback");
            const auto t=Clock::now();for(int i=reused;i<count;i+=256){int n=std::min(256,count-i);evaluate(ctx.get(),prompt,i,n,spec.get());evaluated+=n;}prefill_s=seconds(t);history=prompt;
        }
        // The generated suffix can be normalised on the next request; the input prefix remains protected.
        const int generation_tokens=-llama_tokenize(llama_model_get_vocab(target.get()),chat.generation_prompt.data(),chat.generation_prompt.size(),nullptr,0,false,true);
        if(generation_tokens<0 || generation_tokens>count)throw std::runtime_error("generation prefix count");
        stable_prefix=count-generation_tokens;
        common_speculative_begin(spec.get(),0,history);
        Sampler sampler(llama_sampler_chain_init(llama_sampler_chain_default_params()),llama_sampler_free);llama_sampler_chain_add(sampler.get(),llama_sampler_init_greedy());for(auto token:prompt)llama_sampler_accept(sampler.get(),token);
        std::vector<llama_token> generated;std::string raw;int drafted=0,accepted=0,verify_tokens=0;bool eog=false;double first=-1,last_time=-1;
        const auto * cpu_vocab=llama_model_get_vocab(target.get());
        auto emit=[&](llama_token tok){if(llama_vocab_is_eog(cpu_vocab,tok)){eog=true;return;}std::vector<char> buf(256);int n=llama_token_to_piece(cpu_vocab,tok,buf.data(),buf.size(),0,true);if(n<0){buf.resize(-n);n=llama_token_to_piece(cpu_vocab,tok,buf.data(),buf.size(),0,true);}if(n<0)throw std::runtime_error("piece");raw.append(buf.data(),n);generated.push_back(tok);if(first<0)first=seconds(start);last_time=seconds(start);};
        auto last=llama_sampler_sample(sampler.get(),ctx.get(),-1);llama_sampler_accept(sampler.get(),last);emit(last);
        while(!eog && (int)generated.size()<budget){
            llama_tokens draft;const int past=history.size();auto & dp=common_speculative_get_draft_params(spec.get(),0);dp.drafting=true;dp.n_max=std::min(3,budget-(int)generated.size()-1);dp.n_past=past;dp.id_last=last;dp.prompt=&history;dp.result=&draft;if(dp.n_max>0)common_speculative_draft(spec.get());drafted+=draft.size();
            auto batch=llama_batch_init(1+draft.size(),0,1);batch.n_tokens=1+draft.size();for(int i=0;i<batch.n_tokens;++i){batch.token[i]=i?draft[i-1]:last;batch.pos[i]=past+i;batch.n_seq_id[i]=1;batch.seq_id[i][0]=0;batch.logits[i]=1;}int rc=llama_decode(ctx.get(),batch);bool ok=rc==0&&common_speculative_process(spec.get(),batch);verify_tokens+=batch.n_tokens;llama_batch_free(batch);if(!ok)throw std::runtime_error("verify");
            std::vector<llama_token> ids;for(size_t i=0;i<=draft.size();i++){auto tok=llama_sampler_sample(sampler.get(),ctx.get(),i);llama_sampler_accept(sampler.get(),tok);ids.push_back(tok);if(llama_vocab_is_eog(cpu_vocab,tok)||i==draft.size()||tok!=draft[i])break;}int matched=ids.size()-1;accepted+=matched;common_speculative_accept(spec.get(),0,matched);
            for(auto tok:ids){history.push_back(last);last=tok;emit(last);if(eog)break;}
            if(!llama_memory_seq_rm(llama_get_memory(ctx.get()),0,history.size(),-1)||!llama_memory_seq_rm(llama_get_memory(draft_ctx.get()),0,history.size(),-1))throw std::runtime_error("draft tail rollback");
        }
        if(llama_memory_seq_pos_max(llama_get_memory(ctx.get()),0)!=(llama_pos)history.size()-1)throw std::runtime_error("KV history accounting mismatch");
        common_chat_parser_params pp(chat);pp.reasoning_format=COMMON_REASONING_FORMAT_NONE;pp.parse_tool_calls=true;pp.parser.load(chat.parser);
        auto msg=common_chat_parse(raw,false,pp);const auto messages=common_chat_msgs_to_json_oaicompat({msg},true);json assistant_msg=json::parse(messages.dump()).at(0);
        if(assistant_msg.value("role",std::string()).empty())assistant_msg["role"]="assistant";
        const double wall=seconds(start);round++;
        return{{"id",request.value("id",round)},{"round",round},{"cold",cold},{"message",assistant_msg},{"raw",raw},{"stop",eog?"eog":"length"},{"prompt_tokens",count},{"cached_tokens",reused},{"canonical_replay_tokens",replayed},{"stable_prefix_tokens",stable_prefix},{"evaluated_prompt_tokens",evaluated},{"kv_pos_before",pos_before},{"kv_pos_max",llama_memory_seq_pos_max(llama_get_memory(ctx.get()),0)},{"history_tokens",history.size()},{"generated_tokens",generated.size()},{"verified_tokens",verify_tokens},{"drafted",drafted},{"accepted",accepted},{"shared_bytes",transfer.shared_bytes},{"copied_bytes",transfer.copied_bytes},{"handoff_ms",handoff_ms},{"source_load_s",load_s},{"prefill_s",prefill_s},{"wall_s",wall},{"first_token_s",first},{"decode_tps",generated.size()>1?(generated.size()-1)/(last_time-first):0}};
    }
};
int main(int argc,char **argv){if(argc==4&&std::string(argv[3])=="--render-audit"){try{ggml_backend_load_all();llama_backend_init();auto p=llama_model_default_params();p.vocab_only=true;p.n_gpu_layers=0;Model model(llama_model_load_from_file(argv[1],p),llama_model_free);if(!model)throw std::runtime_error("vocab load");auto tmpl=common_chat_templates_init(model.get(),"","");std::ifstream file(argv[2]);json saved;file>>saved;const auto & all=saved.at("messages");const auto * vocab=llama_model_get_vocab(model.get());auto tokenize=[&](const std::string&s){int n=-llama_tokenize(vocab,s.data(),s.size(),nullptr,0,true,true);std::vector<llama_token>x(n);llama_tokenize(vocab,s.data(),s.size(),x.data(),n,true,true);return x;};std::vector<llama_token> previous;size_t protected_tokens=0;json rows=json::array();for(size_t i=0;i<all.size();i++){if(all[i].value("role",std::string())!="tool"&&all[i].value("role",std::string())!="user")continue;common_chat_templates_inputs in;in.messages=common_chat_msgs_parse_oaicompat(common_json::parse(json(all.begin(),all.begin()+i+1).dump()));in.tools=common_chat_tools_parse_oaicompat(common_json::parse(saved.at("tools").dump()));in.enable_thinking=false;in.parallel_tool_calls=false;in.now=std::chrono::system_clock::time_point(std::chrono::seconds(1789257600));auto chat=common_chat_templates_apply(tmpl.get(),in);auto tokens=tokenize(chat.prompt);size_t shared=0;while(shared<previous.size()&&shared<tokens.size()&&previous[shared]==tokens[shared])shared++;if(!previous.empty()&&shared<protected_tokens)throw std::runtime_error("render changed earlier input prefix");int g=-llama_tokenize(vocab,chat.generation_prompt.data(),chat.generation_prompt.size(),nullptr,0,false,true);protected_tokens=tokens.size()-g;rows.push_back({{"messages",i+1},{"tokens",tokens.size()},{"lcp",shared},{"protected",protected_tokens}});previous=std::move(tokens);}std::cout<<rows.dump(2)<<std::endl;return 0;}catch(const std::exception&e){std::cerr<<e.what()<<std::endl;return 1;}}
if(argc<3||argc>4){std::cerr<<"Usage: agentic-session TARGET ASSISTANT [--cpu]\n";return 2;}try{ggml_backend_load_all();llama_backend_init();session s(argv[1],argv[2],argc==4&&std::string(argv[3])=="--cpu");std::string line;while(std::getline(std::cin,line)){if(line.size()>1024*1024)throw std::runtime_error("request too large");auto request=json::parse(line);if(request.value("op",std::string())=="close")break;std::cout<<s.turn(request).dump()<<std::endl;}return 0;}catch(const std::exception &e){std::cout<<json({{"error",e.what()}}).dump()<<std::endl;return 1;}}
