import { expect, test } from 'bun:test';
import { analyse } from './analyse';

test('separates model row types and preserves replay outcome counts', () => {
    const result = analyse(`
I GGML_SPECULATIVE_PROFILE phase=target_model rows=4 prompt=4 lead=0 draft=0 generation=0 synchronized=1 us=100 ret=0
I GGML_SPECULATIVE_PROFILE phase=target_model rows=3 prompt=0 lead=1 draft=2 generation=0 synchronized=1 us=200 ret=0
I GGML_SPECULATIVE_PROFILE phase=sample_accept rows=3 drafted=2 accepted=1 accepted_new=0 rejected=1 replay=1 us=5
I GGML_SPECULATIVE_PROFILE phase=ngram_lookup prepare_us=2 update_us=3 select_us=4 us=9
I GGML_SPECULATIVE_PROFILE phase=target_model rows=2 prompt=1 lead=0 draft=0 generation=1 synchronized=1 us=50 ret=0
`);
    expect(result.prefill_model.us).toBe(100);
    expect(result.verification_model.us).toBe(200);
    expect(result.mixed_model.us).toBe(50);
    expect(result.sample_accept.accepted).toBe(1);
    expect(result.sample_accept.accepted_new).toBe(0);
    expect(result.sample_accept.rejected).toBe(1);
    expect(result.sample_accept.replay_calls).toBe(1);
    expect(result.ngram_lookup.us).toBe(9);
});

test('rejects malformed phases and failed decode', () => {
    expect(() => analyse('GGML_SPECULATIVE_PROFILE phase=target_model rows=2 prompt=0 lead=1 draft=0 generation=0 us=1 ret=0')).toThrow();
    expect(() => analyse('GGML_SPECULATIVE_PROFILE phase=sample_accept drafted=2 accepted=2 accepted_new=2 rejected=1 us=1')).toThrow();
    expect(() => analyse('GGML_SPECULATIVE_PROFILE phase=ngram_lookup prepare_us=4 update_us=3 select_us=4 us=10')).toThrow();
    expect(() => analyse('GGML_SPECULATIVE_PROFILE phase=target_model rows=1 prompt=0 lead=0 draft=0 generation=1 us=1 ret=-1')).toThrow();
    expect(() => analyse('GGML_SPECULATIVE_PROFILE phase=begin us=-1')).toThrow();
});
