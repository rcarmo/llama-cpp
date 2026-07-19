# Summarize one or more llama-bench JSON arrays as TSV.
# Usage: jq -rs -f scripts/summarize-k3-matmul.jq result1.json result2.json

def median:
  sort as $s |
  ($s | length) as $n |
  if $n == 0 then null
  elif ($n % 2) == 1 then $s[($n / 2 | floor)]
  else (($s[$n / 2 - 1] + $s[$n / 2]) / 2)
  end;

def rows:
  map(if type == "array" then .[] else . end);

def kind:
  if .n_prompt > 0 and .n_gen > 0 then "pp+tg"
  elif .n_prompt > 0 then "pp"
  elif .n_gen > 0 then "tg"
  else "unknown"
  end;

["model", "type", "n_prompt", "n_gen", "threads", "samples", "median_tps", "min_tps", "max_tps"],
(
  rows
  | group_by([.model_filename, kind, .n_prompt, .n_gen, .n_threads])[]
  | [
      .[0].model_filename,
      (.[0] | kind),
      .[0].n_prompt,
      .[0].n_gen,
      .[0].n_threads,
      (map(.samples_ts | length) | add),
      ([.[].samples_ts[]] | median),
      ([.[].samples_ts[]] | min),
      ([.[].samples_ts[]] | max)
    ]
)
| @tsv
