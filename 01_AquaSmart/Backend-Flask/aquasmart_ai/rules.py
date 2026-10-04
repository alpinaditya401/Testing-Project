"""Aturan pakar dan safety envelope (NFR-13).

Pembacaan terbaru yang melewati ambang selalu menang atas model: model hanya boleh
menaikkan tingkat perhatian, tidak pernah menurunkannya. Rekomendasi tidak pernah
menggerakkan aktuator; perintah tetap lewat otorisasi dan interlock backend PHP.
"""
import math

ADVICE = {
    'ph': 'Periksa kalibrasi sensor dan kondisi air sebelum koreksi pH.',
    'temperature': 'Periksa sirkulasi dan kondisi suhu kolam.',
    'turbidity': 'Periksa endapan, filter, dan sisa pakan.',
}
LABELS = {'ph': 'pH', 'temperature': 'Suhu', 'turbidity': 'Kekeruhan'}


def breaches(latest, thresholds):
    """Parameter pembacaan terbaru yang berada di luar ambang."""
    limits = {'ph': (thresholds['ph_min'], thresholds['ph_max']),
              'temperature': (thresholds['temperature_min'], thresholds['temperature_max']),
              'turbidity': (0.0, thresholds['turbidity_max'])}
    found = []
    for key, (low, high) in limits.items():
        value = latest.get(key)
        if value is None or (isinstance(value, float) and math.isnan(value)):
            continue
        if value < low or value > high:
            found.append({'parameter': key, 'value': value, 'min': low, 'max': high})
    return found


def decide(latest, thresholds, model_alarm, confidence, gated=False):
    """Gabungkan aturan dan model. model_alarm None: tidak ada model aktif, atau model v2 di luar
    periode fluktuasi (gated) sehingga keputusannya sama dengan aturan ambang."""
    out_of_range = breaches(latest, thresholds)
    reasons = [f"{LABELS[b['parameter']]} {b['value']:g} di luar ambang {b['min']:g}–{b['max']:g}."
               for b in out_of_range]
    actions = [ADVICE[b['parameter']] for b in out_of_range]
    if out_of_range:
        condition, source = 'di_luar_ambang', 'aturan'
    elif model_alarm:
        condition, source = 'waspada', 'model'
        reasons.append(f'Model memperkirakan pH atau suhu keluar ambang pada interval lima menit '
                       f'berikutnya (keyakinan {confidence:.0%}).')
        actions.append('Pantau 15 menit ke depan dan periksa tren pH serta suhu.')
    else:
        condition, source = 'normal', 'model' if model_alarm is not None else 'aturan'
        reasons.append('Pembacaan terbaru dalam ambang' + (' dan model tidak memperkirakan pelanggaran.'
                                                           if model_alarm is not None else '.'))
        if gated:
            reasons.append('Model v2 hanya menilai saat status sering berganti (minimal 4 kali dalam 3 jam); '
                           'saat stabil, aturan ambang yang memutuskan.')
        actions.append('Tidak perlu tindakan.')
    return {'condition': condition, 'source': source, 'reasons': reasons, 'actions': actions,
            'breaches': out_of_range}
