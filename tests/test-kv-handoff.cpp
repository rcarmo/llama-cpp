#include "../src/llama-kv-cache.h"
#include "../src/llama-kv-cache-iswa.h"
#include "../src/llama-model.h"
#include "../src/llama-io.h"
#include "../ggml/src/ggml-backend-impl.h"
#include <cstdio>
#include <cstring>
#include <stdexcept>

struct toy_model : llama_model {
    toy_model() : llama_model(llama_model_default_params()) {
        arch=LLM_ARCH_LLAMA;
        hparams.n_layer_all=2;
        hparams.n_embd=32;
        hparams.n_embd_head_k_full=32;
        hparams.n_embd_head_v_full=32;
        hparams.n_embd_head_k_swa=32;
        hparams.n_embd_head_v_swa=32;
        hparams.n_head_arr.fill(1);
        hparams.n_head_kv_arr.fill(1);
    }
    void load_stats(llama_model_loader &) override {}
    void load_hparams(llama_model_loader &) override {}
    void load_vocab(llama_model_loader &) override {}
    bool load_tensors(llama_model_loader &) override { return false; }
    void load_arch_hparams(llama_model_loader &) override {}
    void load_arch_tensors(llama_model_loader &) override {}
    std::unique_ptr<llm_graph_context> build_arch_graph(const llm_graph_params &) const override { return nullptr; }
};
struct bytes_writer : llama_io_write_i {
    std::vector<uint8_t> bytes;
    void write(const void * p,size_t n) override { const auto b=(const uint8_t *)p; bytes.insert(bytes.end(),b,b+n); }
    void write_tensor(ggml_tensor * t,size_t offset,size_t n) override { const size_t old=bytes.size(); bytes.resize(old+n); ggml_backend_tensor_get(t,bytes.data()+old,offset,n); }
    size_t n_bytes() override { return bytes.size(); }
};
static std::vector<uint8_t> state(llama_memory_i & c) { bytes_writer out; c.state_write(out); return out.bytes; }
static std::unique_ptr<llama_kv_cache> cache(toy_model & m,uint32_t size=256) {
    return std::make_unique<llama_kv_cache>(m,m.hparams,GGML_TYPE_F16,GGML_TYPE_F16,false,false,false,size,2,256,0,LLAMA_SWA_TYPE_NONE,nullptr,nullptr,nullptr,nullptr);
}
static void populate(llama_kv_cache & c) {
    for (llama_seq_id s=0;s<2;++s) {
        auto & cells=const_cast<llama_kv_cells &>(c.get_cells(s));
        cells.pos_set(3,17+s); cells.seq_add(3,s);
        cells.pos_set(8,21+s); cells.seq_add(8,s);
        llama_kv_cell_ext ext; ext.tok=llama_token(70+s); ext.x=3;ext.y=4;cells.ext_set(3,ext);
    }
    for (auto id : c.get_layer_ids()) {
        auto k=c.get_k_storage(id);
        std::vector<uint8_t> data(ggml_nbytes(k),uint8_t(id+37));
        ggml_backend_tensor_set(k,data.data(),0,data.size());
    }
}
int main() {
    toy_model model;
    llama_memory_view_cb no_view=[](ggml_backend_buffer_t,size_t,size_t){return (ggml_backend_buffer_t)nullptr;};
    {
        auto src=cache(model),dst=cache(model); populate(*src);
        const auto expected=state(*src),empty=state(*dst);
        size_t shared=0,copied=0;
        GGML_ASSERT(!dst->prepare_handoff(*src,no_view,false,shared,copied));
        GGML_ASSERT(state(*dst)==empty && shared==0 && copied==0);
        int rejected_allocations=0;
        llama_memory_view_cb unsupported=[&](ggml_backend_buffer_t b,size_t off,size_t n){++rejected_allocations;GGML_ASSERT(off==0 && n==ggml_backend_buffer_get_size(b));return (ggml_backend_buffer_t)nullptr;};
        auto tx=dst->prepare_handoff(*src,unsupported,true,shared,copied);
        GGML_ASSERT(tx && rejected_allocations==1 && copied>0 && shared==0 && state(*dst)==empty);
        tx->commit(); tx.reset(); src.reset();
        GGML_ASSERT(state(*dst)==expected);
        dst->init_cpu_shared([](ggml_backend_buffer_type_t,size_t)->ggml_backend_buffer_t { GGML_ABORT("unexpected allocation after transfer"); });
        GGML_ASSERT(dst->seq_pos_min(0)==17 && dst->seq_pos_max(1)==22);
        GGML_ASSERT(dst->get_cells(1).ext_get(3).tok==71 && dst->get_cells(1).ext_get(3).x==3);
        GGML_ASSERT(dst->seq_rm(0,17,18));
        GGML_ASSERT(dst->seq_pos_min(0)==21 && dst->seq_pos_min(1)==18);
        dst->clear(true); GGML_ASSERT(dst->seq_pos_min(1)==-1);
    }
    {
        auto src=cache(model),dst=cache(model);populate(*src);const auto empty=state(*dst),original=state(*src);
        size_t shared=0,copied=0;int calls=0;
        llama_memory_view_cb fail=[&](ggml_backend_buffer_t,size_t,size_t)->ggml_backend_buffer_t {++calls;throw std::runtime_error("injected preparation failure");};
        bool threw=false;try {dst->prepare_handoff(*src,fail,true,shared,copied);}catch(const std::runtime_error &){threw=true;}
        GGML_ASSERT(threw && calls==1 && shared==0 && copied==0 && state(*dst)==empty && state(*src)==original);
        auto wrong=cache(model,512);GGML_ASSERT(!wrong->prepare_handoff(*src,no_view,true,shared,copied));
        auto dropped=dst->prepare_handoff(*src,no_view,true,shared,copied);GGML_ASSERT(dropped);dropped.reset();GGML_ASSERT(state(*dst)==empty && state(*src)==original);
        shared=0;copied=0;
        src->seq_add(0,0,-1,1);GGML_ASSERT(!dst->prepare_handoff(*src,no_view,true,shared,copied));
        src=cache(model);populate(*src);
        populate(*dst);GGML_ASSERT(!dst->prepare_handoff(*src,no_view,true,shared,copied));
    }
    {
        auto src=cache(model),dst=cache(model);populate(*src);const auto expected=state(*src);
        size_t shared=0,copied=0;
        struct retained { std::shared_ptr<llama_kv_cache> owner; ggml_backend_buffer_ptr host; };
        std::shared_ptr<llama_kv_cache> owner(src.release());
        std::weak_ptr<llama_kv_cache> lifetime=owner;
        int acquisitions=0;size_t retained_bytes=0;
        llama_memory_view_cb view=[owner,&acquisitions,&retained_bytes](ggml_backend_buffer_t b,size_t off,size_t n) {
            ++acquisitions;retained_bytes+=n;GGML_ASSERT(off==0 && n==ggml_backend_buffer_get_size(b));
            auto ctx=new retained{owner,ggml_backend_buffer_ptr(ggml_backend_cpu_buffer_from_ptr((uint8_t *)ggml_backend_buffer_get_base(b)+off,n))};
            auto iface=ctx->host->iface;
            iface.get_base=[](ggml_backend_buffer_t b){return ggml_backend_buffer_get_base(((retained *)b->context)->host.get());};
            iface.clear=[](ggml_backend_buffer_t b,uint8_t value){ggml_backend_buffer_clear(((retained *)b->context)->host.get(),value);};
            iface.free_buffer=[](ggml_backend_buffer_t b){delete (retained *)b->context;};
            return ggml_backend_buffer_init(ctx->host->buft,iface,ctx,n);
        };
        auto tx=dst->prepare_handoff(*owner,view,false,shared,copied);GGML_ASSERT(tx && acquisitions==1 && shared>0 && shared<=retained_bytes && copied==0);
        auto original=owner->get_k_storage(0)->data;tx->commit();tx.reset();owner.reset();view={};
        GGML_ASSERT(!lifetime.expired() && dst->get_k_storage(0)->data==original && state(*dst)==expected);
        GGML_ASSERT(dst->get_k_storage(0)->buffer==dst->get_k_storage(1)->buffer);
        size_t accounted=0;for(const auto & row:dst->memory_breakdown())accounted+=row.second;
        GGML_ASSERT(accounted==retained_bytes);
        dst->clear(true);GGML_ASSERT(dst->seq_pos_min(0)==-1);
        dst.reset();GGML_ASSERT(lifetime.expired());
    }
    {
        auto src=cache(model),dst=cache(model);populate(*src);size_t shared=0,copied=0;
        const auto before_borrow=state(*src);
        auto borrower=std::make_unique<llama_kv_cache>(model,model.hparams,GGML_TYPE_F16,GGML_TYPE_F16,false,false,false,256,2,256,0,LLAMA_SWA_TYPE_NONE,src.get(),nullptr,nullptr,[](int32_t il){return il;});
        GGML_ASSERT(state(*src)==before_borrow);
        GGML_ASSERT(!dst->prepare_handoff(*src,no_view,true,shared,copied));
        borrower.reset();GGML_ASSERT(state(*src)==before_borrow);auto tx=dst->prepare_handoff(*src,no_view,true,shared,copied);GGML_ASSERT(tx);tx->commit();
    }
    {
        model.hparams.n_swa=64;model.hparams.swa_type=LLAMA_SWA_TYPE_STANDARD;
        model.hparams.is_swa_impl[0]=1;model.hparams.is_swa_impl[1]=0;
        auto make=[&](uint32_t ubatch){return std::make_unique<llama_kv_cache_iswa>(model,model.hparams,GGML_TYPE_F16,GGML_TYPE_F16,false,false,false,false,512,2,ubatch,256,nullptr,nullptr,nullptr,nullptr);};
        auto src=make(128),dst=make(128);populate(*const_cast<llama_kv_cache *>(src->get_base()));populate(*const_cast<llama_kv_cache *>(src->get_swa()));
        const auto expected=state(*src),empty=state(*dst);size_t shared=0,copied=0;
        auto wrong=make(512);GGML_ASSERT(!wrong->prepare_handoff(*src,no_view,true,shared,copied));
        GGML_ASSERT(shared==0 && copied==0 && state(*dst)==empty);
        int calls=0;llama_memory_view_cb partial_fail=[&](ggml_backend_buffer_t,size_t,size_t)->ggml_backend_buffer_t{if(++calls==2)throw std::runtime_error("second allocation failure");return nullptr;};
        bool threw=false;try{dst->prepare_handoff(*src,partial_fail,true,shared,copied);}catch(const std::runtime_error &){threw=true;}
        GGML_ASSERT(threw && calls==2 && shared==0 && copied==0 && state(*dst)==empty && state(*src)==expected);
        auto tx=dst->prepare_handoff(*src,no_view,true,shared,copied);GGML_ASSERT(tx && copied>0);tx->commit();tx.reset();src.reset();
        GGML_ASSERT(state(*dst)==expected);dst->clear(true);
    }
    std::puts("PASS: plain/ISWA handoff metadata and payload, source-free lifetime, alias/copy accounting, independent sequences, rejection and prepare failure atomicity");
}
