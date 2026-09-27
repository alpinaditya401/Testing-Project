"""AquaSmart: evaluasi dan perbandingan model klasifikasi ambang pH/suhu.

Melanjutkan model baseline (Random Forest) memakai fitur dan label yang
sudah dibersihkan dan diaudit sebelumnya (`tugas_mandiri/fitur_dan_target.csv`),
bukan data contoh pada modul. Tidak menjalankan ulang pembersihan dari CSV
mentah 505.730 baris (tidak ikut di-commit); lihat README_MANDIRI.md untuk
asal dan audit data itu.
"""
from pathlib import Path
import json

import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_validate, cross_val_predict, GridSearchCV
from sklearn.metrics import (ConfusionMatrixDisplay, classification_report, precision_score,
                              recall_score, f1_score, make_scorer)

import mandiri  # RULES, pipeline(), chronological_split(), score()

HERE = Path(__file__).resolve().parent
OUT = HERE / 'tugas_mandiri'
BUKTI = OUT / 'bukti'
SEED = 42
MACRO_F1 = make_scorer(f1_score, average='macro', zero_division=0)
LABELS = ['Dalam ambang', 'Di luar ambang']


def load_features():
    path = OUT / 'fitur_dan_target.csv'
    if not path.exists():
        raise FileNotFoundError(
            f'Data belum tersedia: {path}. Jalankan dulu notebook '
            '../../notebooks/01_eda.ipynb dan 02_baseline.ipynb, atau lihat README_MANDIRI.md.')
    df = pd.read_csv(path, parse_dates=['timestamp']).set_index('timestamp').sort_index()
    y = df.pop('target_proxy').astype(int)
    return df, y


def ringkas(nilai):
    """Menulis skor 5 fold sebagai 'rata-rata ± simpangan'."""
    return f'{nilai.mean():.3f} ± {nilai.std():.3f}'


def main():
    X, y = load_features()
    X_train, X_test, y_train, y_test = mandiri.chronological_split(X, y)
    print(f'Data latih: {X_train.shape} | Data uji: {X_test.shape}')
    print('Proporsi kelas "di luar ambang" (1) di data latih:', round(y_train.mean(), 3))

    def buat_pipe(model):
        return mandiri.pipeline(X.columns, estimator=model)

    # ---------- Confusion matrix baseline (Random Forest) ----------
    baseline = mandiri.pipeline(X.columns)
    baseline.fit(X_train, y_train)
    pred_baseline = baseline.predict(X_test)
    ConfusionMatrixDisplay.from_predictions(
        y_test, pred_baseline, display_labels=LABELS, cmap='Blues')
    plt.title('Confusion Matrix Baseline (Random Forest) - Data Uji')
    plt.tight_layout()
    plt.savefig(BUKTI / 'evaluasi_confusion_matrix_baseline.png', dpi=150)
    plt.close()
    baseline_report = classification_report(
        y_test, pred_baseline, target_names=LABELS, output_dict=True, zero_division=0)
    baseline_score = mandiri.score(y_test, pred_baseline)
    print('Baseline pada data uji:', baseline_score)

    # ---------- Membandingkan minimal dua model dengan cross-validation ----------
    kandidat = {
        'Logistic Regression': LogisticRegression(max_iter=2000, class_weight='balanced'),
        'Random Forest': RandomForestClassifier(
            n_estimators=160, max_depth=10, min_samples_leaf=5,
            class_weight='balanced', random_state=SEED, n_jobs=2),
    }
    perbandingan = []
    for nama, model in kandidat.items():
        cv = cross_validate(buat_pipe(model), X_train, y_train, cv=5,
                             scoring={'precision': 'precision', 'recall': 'recall',
                                      'f1_macro': MACRO_F1})
        perbandingan.append({'model': nama,
                              'precision_alarm': ringkas(cv['test_precision']),
                              'recall_alarm': ringkas(cv['test_recall']),
                              'macro_f1': ringkas(cv['test_f1_macro'])})
    df_perbandingan = pd.DataFrame(perbandingan)
    df_perbandingan.to_csv(OUT / 'perbandingan_model_evaluasi.csv', index=False)
    print('\n== Perbandingan model (5-fold CV) ==')
    print(df_perbandingan.to_string(index=False))

    # ---------- Hyperparameter tuning (GridSearchCV) pada Random Forest ----------
    parameter = {'model__n_estimators': [100, 160, 300],
                 'model__max_depth': [6, 10, None]}
    grid = GridSearchCV(
        buat_pipe(RandomForestClassifier(class_weight='balanced', random_state=SEED, n_jobs=2)),
        parameter, cv=5, scoring=MACRO_F1, n_jobs=1)
    grid.fit(X_train, y_train)
    print('\nParameter terbaik:', grid.best_params_,
          '| macro F1 (CV):', round(grid.best_score_, 3))
    grid_table = pd.DataFrame(grid.cv_results_)[['params', 'mean_test_score', 'std_test_score']]
    grid_table = grid_table.sort_values('mean_test_score', ascending=False)
    grid_table.to_csv(OUT / 'grid_search.csv', index=False)

    # ---------- Mengenali overfitting/underfitting (Decision Tree) ----------
    kedalaman = [1, 2, 3, 5, 8, 12, None]
    f1_latih, f1_validasi = [], []
    for d in kedalaman:
        cv = cross_validate(buat_pipe(DecisionTreeClassifier(max_depth=d, random_state=SEED)),
                             X_train, y_train, cv=5, scoring=MACRO_F1, return_train_score=True)
        f1_latih.append(cv['train_score'].mean())
        f1_validasi.append(cv['test_score'].mean())
    pd.DataFrame({'max_depth': [str(d) for d in kedalaman],
                  'macro_f1_latih': f1_latih, 'macro_f1_validasi': f1_validasi}
                 ).to_csv(OUT / 'overfitting.csv', index=False)
    label = [str(d) for d in kedalaman]
    plt.figure(figsize=(6, 4))
    plt.plot(label, f1_latih, 'o-', label='Macro F1 data latih')
    plt.plot(label, f1_validasi, 's-', label='Macro F1 validasi (CV)')
    plt.xlabel('max_depth Decision Tree')
    plt.ylabel('Macro F1')
    plt.title('Underfitting vs Overfitting - AquaSmart')
    plt.legend()
    plt.tight_layout()
    plt.savefig(BUKTI / 'evaluasi_overfitting.png', dpi=150)
    plt.close()

    # ---------- Memilih threshold pada model hasil tuning ----------
    peluang = cross_val_predict(grid.best_estimator_, X_train, y_train, cv=5,
                                 method='predict_proba')[:, 1]
    threshold_rows = []
    for t in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
        pred = (peluang >= t).astype(int)
        threshold_rows.append({
            'threshold': t,
            'precision_alarm': precision_score(y_train, pred, zero_division=0),
            'recall_alarm': recall_score(y_train, pred, zero_division=0),
            'macro_f1': f1_score(y_train, pred, average='macro', zero_division=0)})
    df_threshold = pd.DataFrame(threshold_rows)
    df_threshold.to_csv(OUT / 'threshold_sweep.csv', index=False)
    print('\n== Threshold sweep (data latih, 5-fold CV) ==')
    print(df_threshold.to_string(index=False))
    threshold_terpilih = float(df_threshold.loc[df_threshold['macro_f1'].idxmax(), 'threshold'])
    print('Threshold terpilih (macro F1 tertinggi pada data latih):', threshold_terpilih)

    # ---------- Data uji dibuka SATU KALI: model final + threshold terpilih ----------
    peluang_uji = grid.best_estimator_.predict_proba(X_test)[:, 1]
    pred_final = (peluang_uji >= threshold_terpilih).astype(int)
    final_score = mandiri.score(y_test, pred_final)
    ConfusionMatrixDisplay.from_predictions(
        y_test, pred_final, display_labels=LABELS, cmap='Greens')
    plt.title(f'Confusion Matrix Model Final (threshold={threshold_terpilih})')
    plt.tight_layout()
    plt.savefig(BUKTI / 'evaluasi_confusion_matrix_final.png', dpi=150)
    plt.close()
    print('\nModel final pada data uji (dibuka satu kali):', final_score)

    ringkasan = {
        'seed': SEED,
        'sumber_data': ('tugas_mandiri/fitur_dan_target.csv, hasil pembersihan dan audit '
                         'sebelumnya (bukan data contoh modul, bukan CSV mentah 505.730 baris)'),
        'data_latih': int(len(X_train)),
        'data_uji': int(len(X_test)),
        'proporsi_kelas1_latih': float(round(y_train.mean(), 3)),
        'baseline_uji': baseline_score,
        'baseline_classification_report': baseline_report,
        'perbandingan_model_cv': perbandingan,
        'grid_search_best_params': grid.best_params_,
        'grid_search_best_macro_f1_cv': float(grid.best_score_),
        'threshold_sweep_latih': threshold_rows,
        'threshold_terpilih': threshold_terpilih,
        'model_final_uji': final_score,
        'catatan': [
            'Data latih/uji sama persis dengan pembagian kronologis pada baseline (purge 60 '
            'menit, random_state=42); hanya sumber CSV yang dipakai ulang, bukan pipeline '
            'dilatih ulang dari mentah.',
            'Threshold dipilih dari macro F1 pada data LATIH (cross-validated predict_proba), '
            'data uji tetap disegel sampai baris "Model final pada data uji" di atas.',
            'Kelas mayoritas di data ini adalah "di luar ambang" (~90%), kebalikan dari contoh '
            'modul (triase, Urgent minoritas); karena itu macro F1 dan balanced accuracy tetap '
            'dipakai sebagai metrik utama, bukan accuracy atau recall kelas alarm saja.',
            'Hasil ini adalah status proksi ambang sensor, bukan bukti keamanan air, label ahli, '
            'atau bukti aktuasi perangkat fisik; lihat README repo bagian Status.',
        ],
    }
    (OUT / 'evaluasi_perbandingan.json').write_text(
        json.dumps(ringkasan, indent=2, ensure_ascii=False), encoding='utf-8')
    print('\nRingkasan tersimpan di tugas_mandiri/evaluasi_perbandingan.json')


if __name__ == '__main__':
    main()
