"""Paired moving-block bootstrap on the holdout: macro F1 (selected seed-42 model) minus macro F1 (persistence rule).

Uses only harness functions; the selected module is trained on the train split (seed 42) exactly as the harness does.
Blocks: contiguous runs of BLOCK holdout rows (chronological order), start positions drawn uniformly from
[0, n - BLOCK], ceil(n / BLOCK) blocks per resample, concatenated and truncated to n rows. The same indices are used
for model and rule (paired). RNG: numpy.random.default_rng(42).
Requires AQUASMART_HOLDOUT_UNLOCK=1.
"""
import json, os, sys
from pathlib import Path
import numpy as np
from sklearn.metrics import f1_score

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from harness import RULES, load_bins, baseline_rows, load, predict, score  # noqa: E402

if os.environ.get('AQUASMART_HOLDOUT_UNLOCK') != '1':
    sys.exit('holdout is locked')

SELECTED = HERE / 'approaches' / 'context_best.py'
SEED, BLOCK, B, RNG_SEED = 42, 12, 2000, 42


def macro_f1(y, p):
    return f1_score(y, p, labels=[0, 1], average='macro', zero_division=0)


def main():
    mod = load(str(SELECTED))
    bins = load_bins()
    y, rule, train, test = baseline_rows(bins)
    feats = mod.build_features(bins, RULES)
    X_tr, y_tr = feats.loc[train], y.loc[train].astype(int)
    X_te = feats.loc[test]
    y_te = y.loc[test].astype(int).to_numpy()
    p_model = predict(mod, SEED, X_tr, y_tr, X_te)
    p_rule = rule.loc[test].astype(int).to_numpy()

    n = len(y_te)
    point_model, point_rule = macro_f1(y_te, p_model), macro_f1(y_te, p_rule)
    rng = np.random.default_rng(RNG_SEED)
    n_blocks = int(np.ceil(n / BLOCK))
    offsets = np.arange(BLOCK)
    diffs = np.empty(B)
    for b in range(B):
        starts = rng.integers(0, n - BLOCK + 1, size=n_blocks)
        idx = (starts[:, None] + offsets[None, :]).ravel()[:n]
        diffs[b] = macro_f1(y_te[idx], p_model[idx]) - macro_f1(y_te[idx], p_rule[idx])
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    disagree = p_model != p_rule
    out = {
        'n_holdout': n, 'block': BLOCK, 'resamples': B, 'rng': 'numpy.random.default_rng(42)',
        'selected_seed42_holdout': score(y_te, p_model), 'rule_holdout': score(y_te, p_rule),
        'point_diff_macro_f1': float(point_model - point_rule),
        'ci95_diff_macro_f1': [float(lo), float(hi)],
        'bootstrap_mean_diff': float(diffs.mean()), 'bootstrap_sd_diff': float(diffs.std(ddof=1)),
        'frac_resamples_diff_gt_0': float((diffs > 0).mean()),
        'rows_model_ne_rule': int(disagree.sum()),
        'model_correct_where_disagree': int((p_model[disagree] == y_te[disagree]).sum()),
        'rule_correct_where_disagree': int((p_rule[disagree] == y_te[disagree]).sum()),
    }
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
