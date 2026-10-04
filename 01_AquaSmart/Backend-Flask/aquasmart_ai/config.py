"""Konfigurasi dari environment (NFR-11). Tidak ada rahasia di repositori."""
from dataclasses import dataclass, field
from pathlib import Path
import os

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_AQUASMART = SERVICE_ROOT.parent
# Salinan 08_Sistem-Cerdas/tugas_mandiri/data_bersih_5menit.csv agar layanan dapat di-build
# dari foldernya sendiri. tests/test_ml_parity.py memastikan isinya identik dengan aslinya.
DATASET_DIR = SERVICE_ROOT / 'datasets'
DEFAULT_DATASET = DATASET_DIR / 'aquasmart-5menit.csv'

# Ambang threshold-rules-v2 dari server/src/ThresholdRules.php. Label latih model
# memakai versi ini; mengubahnya mengubah target dan skor.
RULES_VERSION = 'threshold-rules-v2'
DEFAULT_THRESHOLDS = {'ph_min': 6.5, 'ph_max': 8.5, 'temperature_min': 25.0,
                      'temperature_max': 30.0, 'turbidity_max': 50.0}


def _float(name, default):
    value = os.environ.get(name)
    return default if value in (None, '') else float(value)


def _datasets(directory):
    """Nama dataset -> berkas. Hanya berkas di daftar ini yang boleh dilatih."""
    found = {}
    for folder in [DATASET_DIR] + ([Path(directory)] if directory else []):
        for path in sorted(folder.glob('*.csv')):
            found[path.stem] = path.resolve()
    return found


@dataclass
class Config:
    data_dir: Path
    service_key: str = ''
    admin_key: str = ''
    datasets: dict = field(default_factory=dict)
    # Kriteria aktivasi model (FR-20). Model kandidat hanya boleh aktif bila lolos semua.
    min_macro_f1: float = 0.85
    min_recall_alarm: float = 0.95
    # Selisih macro F1 terbesar yang diterima bila model kalah dari aturan ambang terakhir.
    max_gap_vs_rule: float = 0.03
    max_readings: int = 2000

    @classmethod
    def from_env(cls):
        data_dir = Path(os.environ.get('AQUASMART_AI_DATA_DIR') or SERVICE_ROOT / 'instance')
        return cls(
            data_dir=data_dir,
            service_key=os.environ.get('AQUASMART_AI_SERVICE_KEY', ''),
            admin_key=os.environ.get('AQUASMART_AI_ADMIN_KEY', ''),
            datasets=_datasets(os.environ.get('AQUASMART_AI_DATASET_DIR')),
            min_macro_f1=_float('AQUASMART_AI_MIN_MACRO_F1', 0.85),
            min_recall_alarm=_float('AQUASMART_AI_MIN_RECALL_ALARM', 0.95),
            max_gap_vs_rule=_float('AQUASMART_AI_MAX_GAP_VS_RULE', 0.03),
        )
