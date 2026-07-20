#!/usr/bin/awk -f
# Aggregate SPACEMIT_MATMUL key=value trace lines.
/^SPACEMIT_MATMUL / {
    delete v
    for (i = 2; i <= NF; ++i) {
        split($i, kv, "=")
        v[kv[1]] = kv[2]
    }
    key = v["path"] "\t" v["op"] "\t" v["type0"] "\t" v["type1"] "\t" \
          v["m"] "\t" v["n"] "\t" v["k"] "\t" v["src0_ne2"] "\t" \
          v["src1_ne2"] "\t" v["src1_ne3"] "\t" v["nth"]
    calls[key]++
    call_total++
    # Relative arithmetic weight, not elapsed time. For MUL_MAT_ID, src1_ne2
    # carries the token/batch dimension while n is selected rows per token.
    instances = (v["op"] == "MUL_MAT_ID" ? v["src1_ne2"] * v["src1_ne3"] : 1)
    mac = v["m"] * v["n"] * v["k"] * instances
    macs[key] += mac
    mac_total += mac
}
END {
    print "calls\tcall_percent\tmac_percent\trelative_macs\tpath\top\ttype0\ttype1\tm\tn\tk\tsrc0_ne2\tsrc1_ne2\tsrc1_ne3\tnth"
    for (key in calls) {
        printf "%d\t%.4f\t%.4f\t%.0f\t%s\n", calls[key], call_total ? 100.0 * calls[key] / call_total : 0,
               mac_total ? 100.0 * macs[key] / mac_total : 0, macs[key], key
    }
}
