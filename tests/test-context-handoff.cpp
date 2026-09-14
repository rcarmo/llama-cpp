#include "llama.h"
#include "gguf.h"
#include "ggml-backend.h"
#include "../src/llama-model-saver.h"
#include "../src/llama-context.h"
#include "../src/llama-model.h"
#include "../src/llama-kv-cache-iswa.h"
#include <vector>
#include <cstring>
#include <cmath>
#include <cstdio>
#include <memory>

static void fill(ggml_tensor * t,void *) {
    std::vector<float> x(ggml_nelements(t));
    for(size_t i=0;i<x.size();++i)x[i]=std::strstr(t->name,"rope_freqs")?1.0f:std::sin(float(i%127)*0.17f)*0.02f;
    GGML_ASSERT(t->type==GGML_TYPE_F32);ggml_backend_tensor_set(t,x.data(),0,ggml_nbytes(t));
}
static std::vector<uint8_t> state(llama_context * c){std::vector<uint8_t> b(llama_state_get_size(c));GGML_ASSERT(llama_state_get_data(c,b.data(),b.size())==b.size());return b;}
static void step(llama_context * c,llama_token token,llama_pos pos){auto b=llama_batch_init(1,0,1);b.n_tokens=1;b.token[0]=token;b.pos[0]=pos;b.n_seq_id[0]=1;b.seq_id[0][0]=0;b.logits[0]=1;GGML_ASSERT(llama_decode(c,b)==0);llama_batch_free(b);}
int main(int argc,char ** argv){
    const bool gemma=argc>1 && std::strcmp(argv[1],"--gemma")==0;
    const bool qwen_destination=argc>1 && std::strcmp(argv[1],"--qwen-strict-destination")==0;
    const bool qwen_mtp_roundtrip=argc>1 && std::strcmp(argv[1],"--qwen-mtp-roundtrip")==0;
    const bool qwen_vulkan=argc>1 && (std::strcmp(argv[1],"--qwen-strict-vulkan")==0 || std::strcmp(argv[1],"--qwen-mtp-vulkan")==0);
    const bool qwen_mtp=qwen_mtp_roundtrip || (argc>1 && std::strcmp(argv[1],"--qwen-mtp-vulkan")==0);
    const bool qwen=qwen_destination || qwen_vulkan || qwen_mtp_roundtrip;
    const bool vulkan=argc>3;
    if(vulkan && std::strcmp(argv[2],"--static")!=0) GGML_ASSERT(ggml_backend_load(argv[2]));
    ggml_backend_load_all();
    llama_backend_init();
    const llm_arch arch=gemma?LLM_ARCH_GEMMA4:qwen?LLM_ARCH_QWEN35:LLM_ARCH_LLAMA;
    auto meta=gguf_init_empty();llama_model_saver m(arch,meta);
    m.add_kv(LLM_KV_GENERAL_ARCHITECTURE,gemma?"gemma4":qwen?"qwen35":"llama");m.add_kv(LLM_KV_VOCAB_SIZE,uint32_t(128));m.add_kv(LLM_KV_CONTEXT_LENGTH,uint32_t(qwen?32:256));
    m.add_kv(LLM_KV_EMBEDDING_LENGTH,uint32_t(32));m.add_kv(LLM_KV_BLOCK_COUNT,uint32_t(gemma?5:qwen_mtp?3:2));m.add_kv(LLM_KV_FEED_FORWARD_LENGTH,uint32_t(64));
    m.add_kv(LLM_KV_ATTENTION_HEAD_COUNT,uint32_t(1));m.add_kv(LLM_KV_ATTENTION_HEAD_COUNT_KV,uint32_t(1));m.add_kv(LLM_KV_ROPE_DIMENSION_COUNT,uint32_t(32));
    m.add_kv(LLM_KV_ATTENTION_LAYERNORM_RMS_EPS,1e-5f);m.add_kv(LLM_KV_TOKENIZER_MODEL,"no_vocab");
    if(qwen){m.add_kv(LLM_KV_ROPE_DIMENSION_SECTIONS,std::vector<uint32_t>{8,8,8,8});if(qwen_mtp)m.add_kv(LLM_KV_NEXTN_PREDICT_LAYERS,uint32_t(1));m.add_kv(LLM_KV_ATTENTION_KEY_LENGTH,uint32_t(32));m.add_kv(LLM_KV_ATTENTION_VALUE_LENGTH,uint32_t(32));m.add_kv(LLM_KV_SSM_CONV_KERNEL,uint32_t(4));m.add_kv(LLM_KV_SSM_INNER_SIZE,uint32_t(4));m.add_kv(LLM_KV_SSM_STATE_SIZE,uint32_t(4));m.add_kv(LLM_KV_SSM_TIME_STEP_RANK,uint32_t(1));m.add_kv(LLM_KV_SSM_GROUP_COUNT,uint32_t(1));m.add_kv(LLM_KV_FULL_ATTENTION_INTERVAL,uint32_t(2));}
    if(gemma){m.add_kv(LLM_KV_EMBEDDING_LENGTH_PER_LAYER,uint32_t(16));m.add_kv(LLM_KV_ATTENTION_SHARED_KV_LAYERS,uint32_t(0));m.add_kv(LLM_KV_ATTENTION_KEY_LENGTH,uint32_t(32));m.add_kv(LLM_KV_ATTENTION_VALUE_LENGTH,uint32_t(32));m.add_kv(LLM_KV_ATTENTION_KEY_LENGTH_SWA,uint32_t(32));m.add_kv(LLM_KV_ATTENTION_VALUE_LENGTH_SWA,uint32_t(32));m.add_kv(LLM_KV_ROPE_FREQ_BASE_SWA,10000.0f);m.add_kv(LLM_KV_ATTENTION_SLIDING_WINDOW,uint32_t(64));m.add_kv(LLM_KV_ATTENTION_SLIDING_WINDOW_PATTERN,std::vector<uint32_t>{1,1,1,1,0});}
    auto mp=llama_model_default_params();mp.n_gpu_layers=0;mp.load_mtp=qwen_mtp;
    using model_owner=std::unique_ptr<llama_model,decltype(&llama_model_free)>;
    model_owner model(llama_model_init_from_user(meta,fill,nullptr,mp),llama_model_free);gguf_free(meta);GGML_ASSERT(model);
    model_owner gpu(nullptr,llama_model_free);
    if(qwen_destination){
        auto pending_cp=llama_context_default_params();pending_cp.n_ctx=32;pending_cp.n_batch=32;pending_cp.n_ubatch=32;pending_cp.n_seq_max=1;pending_cp.n_rs_seq=3;pending_cp.n_threads=2;pending_cp.n_threads_batch=2;pending_cp.type_k=GGML_TYPE_F16;pending_cp.type_v=GGML_TYPE_F16;pending_cp.offload_kqv=false;pending_cp.op_offload=false;pending_cp.kv_handoff_strict=true;pending_cp.kv_handoff_destination=true;
        using context=std::unique_ptr<llama_context,decltype(&llama_free)>;
        context pending(llama_init_from_model(model.get(),pending_cp),llama_free);GGML_ASSERT(pending && llama_get_memory(pending.get())==nullptr);
        llama_token tok=3;auto batch=llama_batch_get_one(&tok,1);GGML_ASSERT(llama_decode(pending.get(),batch)!=0);
        pending_cp.kv_handoff_destination=false;context rejected(llama_init_from_model(model.get(),pending_cp),llama_free);GGML_ASSERT(!rejected);
        std::puts("PASS: strict Qwen destination exposes no memory, rejects decode and strict CPU source fails without mapped Vulkan allocation");
        return 0;
    }
    if(vulkan || qwen_mtp_roundtrip){
        const char * path=vulkan?argv[3]:"test-qwen-mtp-roundtrip.gguf";
        {llama_model_saver saver(model.get());saver.add_kv_from_model();if(gemma){saver.add_kv(LLM_KV_ATTENTION_SLIDING_WINDOW_PATTERN,std::vector<uint32_t>{1,1,1,1,0});saver.add_kv(LLM_KV_EMBEDDING_LENGTH_PER_LAYER,uint32_t(16));saver.add_kv(LLM_KV_ATTENTION_SHARED_KV_LAYERS,uint32_t(0));saver.add_kv(LLM_KV_ATTENTION_KEY_LENGTH_SWA,uint32_t(32));saver.add_kv(LLM_KV_ATTENTION_VALUE_LENGTH_SWA,uint32_t(32));saver.add_kv(LLM_KV_ROPE_FREQ_BASE_SWA,10000.0f);}for(const auto & tensor:model->tensors_by_name)saver.add_tensor(tensor.second);saver.save(path);}
        model.reset();model.reset(llama_model_load_from_file(path,mp));GGML_ASSERT(model);
        if(qwen_mtp_roundtrip){GGML_ASSERT(model->hparams.n_layer_all==3&&model->hparams.n_layer()==2&&!model->hparams.is_recr(2));std::remove(path);std::puts("PASS: embedded Qwen MTP GGUF round-trip preserves all-layer recurrent metadata");return 0;}
        mp.n_gpu_layers=999;gpu.reset(llama_model_load_from_file(path,mp));GGML_ASSERT(gpu);
    }
    auto cp=llama_context_default_params();cp.n_ctx=gemma?512:qwen?32:256;cp.swa_full=false;cp.n_batch=32;cp.n_ubatch=32;cp.n_threads=2;cp.n_threads_batch=2;
    if(qwen_vulkan)cp.n_rs_seq=3;
    cp.type_k=GGML_TYPE_F16;cp.type_v=GGML_TYPE_F16;
    cp.offload_kqv=false;cp.op_offload=false;cp.flash_attn_type=LLAMA_FLASH_ATTN_TYPE_DISABLED;
    using context=std::unique_ptr<llama_context,decltype(&llama_free)>;
    if(qwen_mtp){
        auto src_tgt_cp=cp;src_tgt_cp.kv_handoff_strict=true;src_tgt_cp.offload_kqv=true;src_tgt_cp.op_offload=true;
        auto src_mtp_cp=src_tgt_cp;src_mtp_cp.ctx_type=LLAMA_CONTEXT_TYPE_MTP;src_mtp_cp.n_rs_seq=0;
        auto dst_tgt_cp=cp;dst_tgt_cp.kv_handoff_strict=true;dst_tgt_cp.kv_handoff_destination=true;
        auto dst_mtp_cp=dst_tgt_cp;dst_mtp_cp.ctx_type=LLAMA_CONTEXT_TYPE_MTP;dst_mtp_cp.n_rs_seq=0;
        context src_tgt(llama_init_from_model(gpu.get(),src_tgt_cp),llama_free),src_mtp(llama_init_from_model(gpu.get(),src_mtp_cp),llama_free);
        context dst_tgt(llama_init_from_model(model.get(),dst_tgt_cp),llama_free),dst_mtp(llama_init_from_model(model.get(),dst_mtp_cp),llama_free);
        GGML_ASSERT(src_tgt&&src_mtp&&dst_tgt&&dst_mtp&&llama_set_hidden_state_peer(src_mtp.get(),src_tgt.get()));
        auto batch=llama_batch_init(7,0,1);batch.n_tokens=7;
        for(int i=0;i<7;++i){batch.token[i]=i+3;batch.pos[i]=i;batch.n_seq_id[i]=1;batch.seq_id[i][0]=0;batch.logits[i]=i==6;}
        GGML_ASSERT(llama_decode(src_tgt.get(),batch)==0);
        llama_kv_handoff_result pair{};
        GGML_ASSERT(!llama_kv_handoff_cpu(dst_tgt.get(),src_tgt.get(),false,&pair));
        GGML_ASSERT(!llama_kv_handoff_cpu_mtp(dst_tgt.get(),dst_mtp.get(),src_tgt.get(),src_mtp.get(),&pair));
        llama_hidden_state_span catchup{};GGML_ASSERT(llama_hidden_state_span_current(src_tgt.get(),0,7,&catchup));
        GGML_ASSERT(llama_decode_hidden(src_mtp.get(),batch,&catchup)==0);
        GGML_ASSERT(llama_kv_handoff_cpu_mtp(dst_tgt.get(),dst_mtp.get(),src_tgt.get(),src_mtp.get(),&pair));
        GGML_ASSERT(pair.shared_bytes>0&&pair.copied_bytes==0&&!llama_get_memory(src_tgt.get())&&!llama_get_memory(src_mtp.get()));
        std::fprintf(stderr,"MTP_HANDOFF shared=%zu copied=%zu\n",pair.shared_bytes,pair.copied_bytes);
        src_tgt.reset();src_mtp.reset();gpu.reset();
        llama_batch_free(batch);
        llama_token tok=19;auto next=llama_batch_init(1,0,1);next.n_tokens=1;next.token[0]=tok;next.pos[0]=7;next.n_seq_id[0]=1;next.seq_id[0][0]=0;next.logits[0]=1;
        GGML_ASSERT(llama_decode(dst_tgt.get(),next)==0);
        llama_hidden_state_span span{};GGML_ASSERT(llama_hidden_state_span_current(dst_tgt.get(),7,1,&span));
        GGML_ASSERT(llama_decode_hidden(dst_mtp.get(),next,&span)==0);
        const float * logits=llama_get_logits(dst_mtp.get());for(int i=0;i<128;++i)GGML_ASSERT(std::isfinite(logits[i]));
        llama_batch_free(next);std::remove(argv[3]);
        std::puts("PASS: strict Qwen target+MTP four-payload zero-copy handoff, lag rejection, GPU owner destruction and CPU borrowed-span continuation");
        return 0;
    }
    auto source_cp=cp;if(vulkan){source_cp.offload_kqv=true;source_cp.op_offload=true;source_cp.kv_cpu_shared=true;}
    auto destination_cp=cp;
    if(qwen_vulkan){source_cp.kv_handoff_strict=true;source_cp.kv_cpu_shared=false;destination_cp.kv_handoff_strict=true;destination_cp.kv_handoff_destination=true;}
    context src(llama_init_from_model(vulkan?gpu.get():model.get(),source_cp),llama_free),dst(llama_init_from_model(model.get(),destination_cp),llama_free),reference(llama_init_from_model(model.get(),cp),llama_free);
    if (!src || !dst || !reference) {
        std::fprintf(stderr, "CONTEXTS src=%d dst=%d reference=%d qwen=%d vulkan=%d n_ctx=%u\n",
                src != nullptr, dst != nullptr, reference != nullptr, qwen, vulkan, cp.n_ctx);
    }
    GGML_ASSERT(src && dst && reference);
    if(gemma){auto kv=dynamic_cast<llama_kv_cache_iswa *>(llama_get_memory(src.get()));GGML_ASSERT(kv && kv->get_base()->get_size()==512 && kv->get_swa()->get_size()==256);GGML_ASSERT(kv->get_base()->get_layer_ids().size()==1 && kv->get_swa()->get_layer_ids().size()==4);}
    if(qwen_vulkan){
        for(int i=0;i<3;++i)step(src.get(),i+3,i);
        auto qbatch=llama_batch_init(4,0,1);qbatch.n_tokens=4;
        for(int i=0;i<4;++i){qbatch.token[i]=i+6;qbatch.pos[i]=i+3;qbatch.n_seq_id[i]=1;qbatch.seq_id[i][0]=0;qbatch.logits[i]=i==3;}
        GGML_ASSERT(llama_decode(src.get(),qbatch)==0);llama_batch_free(qbatch);
    }else for(int i=0;i<7;++i){step(src.get(),i+3,i);if(!vulkan)step(reference.get(),i+3,i);}
    const auto original=state(src.get()),empty=qwen_vulkan?std::vector<uint8_t>{}:state(dst.get());llama_kv_handoff_result result{};
    if(!vulkan){GGML_ASSERT(!llama_kv_handoff_cpu(dst.get(),src.get(),false,&result));GGML_ASSERT(state(dst.get())==empty && state(src.get())==original);}
    else GGML_ASSERT(llama_state_set_data(reference.get(),original.data(),original.size())==original.size());
    auto borrower_cp=cp;borrower_cp.ctx_other=src.get();
    context borrower(llama_init_from_model(model.get(),borrower_cp),llama_free);GGML_ASSERT(borrower);
    GGML_ASSERT(!llama_kv_handoff_cpu(dst.get(),src.get(),!qwen_vulkan,&result));if(!qwen_vulkan)GGML_ASSERT(state(dst.get())==empty);
    borrower.reset();
    auto cancel=[](void *){return true;};llama_set_abort_callback(dst.get(),cancel,nullptr);
    GGML_ASSERT(!llama_kv_handoff_cpu(dst.get(),src.get(),!qwen_vulkan,&result));if(!qwen_vulkan)GGML_ASSERT(state(dst.get())==empty);
    llama_set_abort_callback(dst.get(),nullptr,nullptr);
    std::fprintf(stderr,"TRANSFER\n");
    GGML_ASSERT(llama_kv_handoff_cpu(dst.get(),src.get(),!qwen_vulkan,&result));GGML_ASSERT(vulkan?(result.shared_bytes>0 && result.copied_bytes==0):(result.shared_bytes==0 && result.copied_bytes>0));
    std::fprintf(stderr,"HANDOFF shared=%zu copied=%zu\n",result.shared_bytes,result.copied_bytes);
    if(qwen_vulkan){
        GGML_ASSERT(llama_n_rs_seq(dst.get())==3);
        GGML_ASSERT(llama_memory_seq_pos_max(llama_get_memory(dst.get()),0)==6);
        GGML_ASSERT(llama_memory_seq_rm(llama_get_memory(dst.get()),0,5,-1));
        GGML_ASSERT(llama_memory_seq_rm(llama_get_memory(reference.get()),0,5,-1));
        GGML_ASSERT(llama_memory_seq_pos_max(llama_get_memory(dst.get()),0)==4);
        src.reset();gpu.reset();
        step(dst.get(),9,5);step(reference.get(),9,5);
        const float * a=llama_get_logits(dst.get()),*b=llama_get_logits(reference.get());
        for(int j=0;j<128;++j)GGML_ASSERT(std::isfinite(a[j])&&a[j]==b[j]);
        const auto state_dst=state(dst.get()),state_ref=state(reference.get());
        if(state_dst!=state_ref)std::fprintf(stderr,"ROLLBACK_STATE_DIFF dst=%zu ref=%zu\n",state_dst.size(),state_ref.size());
        std::remove(argv[3]);
        std::puts("PASS: strict Qwen Vulkan hybrid+hidden zero-copy handoff, rollback and exact CPU continuation after GPU source/model destruction");
        return 0;
    }
    GGML_ASSERT(!llama_get_memory(src.get()));
    context denied(llama_init_from_model(model.get(),borrower_cp),llama_free);GGML_ASSERT(!denied);
    llama_token next=19;auto b=llama_batch_get_one(&next,1);GGML_ASSERT(llama_decode(src.get(),b)!=0);
    GGML_ASSERT(!llama_kv_handoff_cpu(reference.get(),src.get(),true,&result));
    src.reset();gpu.reset();GGML_ASSERT(state(dst.get())==original);
    for(int i=7;i<11;++i){step(dst.get(),i+3,i);step(reference.get(),i+3,i);const float * a=llama_get_logits(dst.get()),*b=llama_get_logits(reference.get());for(int j=0;j<128;++j)GGML_ASSERT(std::isfinite(a[j]) && a[j]==b[j]);}
    GGML_ASSERT(state(dst.get())==state(reference.get()));
    if(vulkan)std::remove(argv[3]);
    if(!gemma && !vulkan){
        // Exercise independently loaded file snapshots without a GPU or trained weights.
        std::unique_ptr<FILE,decltype(&std::fclose)> file(std::tmpfile(),std::fclose);GGML_ASSERT(file);
        {llama_model_saver saver(model.get());saver.add_kv_from_model();for(const auto & t:model->tensors_by_name)saver.add_tensor(t.second);saver.save(file.get());}
        std::fflush(file.get());std::rewind(file.get());
        model_owner a(llama_model_load_from_file_ptr(file.get(),mp),llama_model_free);std::rewind(file.get());
        model_owner b(llama_model_load_from_file_ptr(file.get(),mp),llama_model_free);GGML_ASSERT(a && b);
        GGML_ASSERT(!a->kv_handoff_identity.empty() && a->kv_handoff_identity==b->kv_handoff_identity);
        llama_model_kv_override overrides[2]{};overrides[0].tag=LLAMA_KV_OVERRIDE_TYPE_STR;
        std::strcpy(overrides[0].key,"general.name");std::strcpy(overrides[0].val_str,"override-test");
        mp.kv_overrides=overrides;std::rewind(file.get());
        model_owner changed(llama_model_load_from_file_ptr(file.get(),mp),llama_model_free);GGML_ASSERT(changed && changed->kv_handoff_identity.empty());
        context ca(llama_init_from_model(a.get(),cp),llama_free),cb(llama_init_from_model(b.get(),cp),llama_free),cc(llama_init_from_model(changed.get(),cp),llama_free);
        GGML_ASSERT(ca && cb && cc);step(ca.get(),3,0);
        const auto snapshot=state(ca.get()),blank=state(cc.get());
        GGML_ASSERT(!llama_kv_handoff_cpu(cc.get(),ca.get(),true,&result));GGML_ASSERT(state(cc.get())==blank && state(ca.get())==snapshot);
        GGML_ASSERT(llama_kv_handoff_cpu(cb.get(),ca.get(),true,&result));ca.reset();GGML_ASSERT(state(cb.get())==snapshot);
    }
    std::puts("PASS: public API guards, consumed-source rejection, source/model destruction and exact CPU continuation against same-state copied reference");
}
