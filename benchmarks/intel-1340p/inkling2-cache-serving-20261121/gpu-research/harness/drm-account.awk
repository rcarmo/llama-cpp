# Conservative per-client allocation/residency accounting, duplicate fds excluded.
function bytes(value, unit) {
    if (value !~ /^[0-9]+$/) { invalid=1; return 0 }
    if (unit=="" || unit=="B") return value+0
    if (unit=="KiB") return value*1024
    if (unit=="MiB") return value*1048576
    if (unit=="GiB") return value*1073741824
    invalid=1; return 0
}
function flush( key,c,r) {
    if (id=="") return
    c=pdev "/" id
    clients[c]=1
    if (invalid) bad[c]=1
    if (seen) known[c]=1
    for(r in regions) {
        key=c SUBSEP r
        if (regions[r]>memory[key]) memory[key]=regions[r]
    }
    if (engine>engines[c]) engines[c]=engine
}
function reset() { id="";pdev="";engine=0;seen=0;invalid=0;delete regions }
FNR==1 || /^===/ { flush();reset() }
/^drm-client-id:/ { id=$2 }
/^drm-pdev:/ { pdev=$2 }
/^drm-(resident|total)-[A-Za-z0-9_-]+:/ {
    region=$1;sub(/^drm-(resident|total)-/,"",region);sub(/:$/,"",region)
    value=bytes($2,$3)
    if ($1 ~ /^drm-resident-/) seen=1
    if (value>regions[region]) regions[region]=value
}
/^drm-engine-(render|compute)[0-9]*:/ {
    if ($2 !~ /^[0-9]+$/ || $3!="ns") invalid=1
    else engine+=$2
}
END {
    flush()
    for(c in clients) { n++;if(known[c]&&!bad[c])k++;ns+=engines[c] }
    for(key in memory) total+=memory[key]
    printf "%.0f %.0f %d %d\n",total,ns,n,k
}
