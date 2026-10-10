# Inspection Models: Status, Datasets, and Results

Updated: 2026-10-10. This project contains four trained checkpoints for a
fictional robot-inspection dashboard. No physical Spot robot was used. A saved
checkpoint or passing checksum verification does not establish model accuracy,
deployment readiness, or safety. Acoustic is retained as an experimental result.

## Implemented Models

| Model | Architecture | What it does | Current status |
| --- | --- | --- | --- |
| Analog gauge detector | YOLO11n | Detects the gauge face, center/pivot, and whole needle/pointer in an image. Separate calibrated geometry can attempt a numeric reading from images/video. | Trained detector; numeric reading remains experimental and requires per-gauge calibration and review. |
| Corrosion classifier | ResNet18 | Classifies one manually cropped yoke-suspension asset as normal or corrosion. Supports images/video frames with a supplied crop or ROI. | Trained prototype for this equipment category only; no independent test. |
| Thermal motor classifier | ResNet18 | Classifies a compatible induction-motor thermogram into one of 11 laboratory condition patterns. | Trained prototype; validation is within the same image sequences, not independent motor/session validation. |
| Pump acoustic classifier | ResNet18 on log-mel spectrograms | Classifies complete ten-second pump WAV windows as normal or anomalous. | Trained and published as experimental; poor held-out-machine results make it unsuitable for deployment. |

The gauge `Needle` label encloses the entire pointer, including its counterweight;
it is **not a needle-tip label**. Gauge detection alone is not numeric reading.
The numeric reader needs reviewed scale endpoints, units, orientation, and
pointer geometry; missing, ambiguous, off-scale, or unreviewed inputs return
`UNREADABLE` with a null value. Numeric reading accuracy has not been measured.

Thermal classes are `healthy_no_load`, `cooling_fan_failure`, `stuck_rotor`,
`stator_A_10`, `stator_A_30`, `stator_A_50`, `stator_AC_10`, `stator_AC_30`,
`stator_AB_50`, `stator_ABC_10`, and `stator_ABC_30`. The numbers 10/30/50 describe
the source experiment's percentage of shorted stator winding, not accuracy,
predicted severity, or a temperature measurement. Healthy means the laboratory
no-load reference, not general health under every operating condition.

Acoustic input is 16 kHz PCM16 WAV, mono or eight-channel with channel zero
selected. It is trained only on the 6 dB pump subset, not general environmental
audio. Its normal/anomalous labels do not identify leakage, clogging, or another
specific fault subtype. These ResNet18 models use ImageNet initialization;
the acoustic initialization was image-pretrained, not audio-pretrained.

## Training Datasets and Split Percentages

Percentages below use the **retained prepared dataset** as the denominator.
They describe data allocation, not model accuracy. Counts are images except for
acoustic, where they are ten-second audio clips. Rounding can produce a total
of 99.99% rather than 100%.

| Model | Dataset actually used | Retained total | Training | Validation | Test |
| --- | --- | ---: | ---: | ---: | ---: |
| Gauge | [Analog Gauge Meter](https://universe.roboflow.com/yolo-lxxyl/analog-gauge-meter/dataset/13), v13 (`v06-crop`), YOLO export | 423 | 390 (92.20%) | 33 (7.80%) | None |
| Corrosion | [InsPLAD v1](https://data.mendeley.com/datasets/5n3fjgvfyz/1), supervised yoke-suspension good/rust crops only | 5,867 | 589 (10.04%) | 5,278 (89.96%) | None |
| Thermal | [Induction Motor Thermal Dataset v3](https://data.mendeley.com/datasets/m4sbt8hbvk/3), 11 conditions | 335 | 252 (75.22%) | 83 (24.78%) | None |
| Acoustic | [MIMII public 1.0](https://zenodo.org/records/3384388), `6_dB_pump.zip`, microphone channel zero | 4,205 | 2,265 (53.86%) | 802 (19.07%) | 1,138 (27.06%) |

### Preparation and Evaluation Limits

- **Gauge:** the audit reports 163 source groups: 130 training (79.75%) and 33
  validation (20.25%). The 390 training images are augmented exports of the
  training sources, explaining the larger prepared training percentage. Original
  train/validation assignments were preserved. No detected exact cross-split
  duplicates or filename-derived augmentation siblings were found, but adjacent
  captures or the same physical gauge can remain across splits. There is no
  independent test or labeled numeric-reading evaluation set.
- **Corrosion:** the original selected category had 6,351 images. We quarantined
  484 validation images (7.62% of that original category) associated with training
  images/source frames. The unusual train/validation ratio preserves the supplied
  split; it is not an intentional 90%-validation random split. Training contains
  299 normal and 290 corrosion crops. Validation contains 5,261 normal (99.68%)
  and only 17 corrosion (0.32%) crops. Physical asset/session independence is
  unknown, and high overall accuracy is strongly affected by class imbalance.
- **Thermal:** of 369 original images, 34 (9.21%) were excluded: one exact
  duplicate and 33 guard-gap images. A blocked within-condition split retained
  252 training and 83 validation images. There are 1,145 perceptual near-duplicate
  cross-split candidate pairs; these are review flags, not confirmed duplicates.
  The 40 auxiliary body-region masks are not fault masks, are not used to train
  the classifier, and are not an independent test set. No motor/camera/session
  was held out.
- **Acoustic:** all 4,205 source clips were retained as mono channel-zero WAVs.
  Machine IDs 00/02 are training, 04 is validation, and 06 is test. Training has
  2,011 normal and 254 anomalous clips; validation has 702/100; test has 1,036/102.
  No exact PCM duplicates or exact non-silent one-second cross-split overlaps
  were found. This is a custom supervised held-out-machine protocol, not MIMII's
  original normal-only unsupervised baseline. Shared noise backgrounds and
  independent recording sessions/sites cannot be established.

### Dataset Licenses and Initialization

| Source | Recorded license/terms |
| --- | --- |
| Analog Gauge Meter | CC BY 4.0; downloaded attribution identifies the contributor as "a Roboflow user". |
| InsPLAD | CC BY-NC 3.0; do not assume commercial-use rights. |
| Induction Motor Thermal Dataset | CC BY 4.0; retain contributor and paper attribution. |
| MIMII | CC BY-SA 4.0; retain attribution and ShareAlike obligations for covered adaptations. |
| YOLO11n initialization | Official COCO-pretrained Ultralytics weights; AGPL-3.0 or alternative Enterprise terms. No Enterprise license is asserted. |
| ResNet18 initialization | Official torchvision ImageNet weights; torchvision code is BSD-3-Clause, and underlying ImageNet data terms also apply. |

See [upstream attribution](../models/ATTRIBUTION.md) and
[retained license notices](../models/licenses/). Code licenses are not blanket
licenses for every underlying dataset or trained-weight artifact.

## Recorded Performance Percentages

These are dataset-specific aggregate evaluation results from the imported
checkpoints, not a single interchangeable "accuracy percentage" for every model.
Classification scores are not calibrated probabilities of correctness or hazard
severity. Validation scores used for model selection are not independent tests.

| Model | Evaluation set | Recorded results | Interpretation |
| --- | --- | --- | --- |
| Gauge | 33 validation images | Precision **99.60%**; recall **99.30%**; mAP@0.50 **99.50%**; mAP@0.50:0.95 **89.70%** | Bounding-box detection metrics only, not numeric-reading accuracy. No independent test. |
| Corrosion | 5,278 validation crops | Accuracy **99.98%**; balanced accuracy **99.99%**; corrosion recall **100.00%**; corrosion precision **94.44%** | All 17 corrosion crops detected, with one false positive among 5,261 normal crops. Small positive sample; no independent test or plant validation. |
| Thermal | 83 validation thermograms | Accuracy **100.00%**; balanced accuracy **100.00%** | Non-independent within-sequence validation, not evidence of generalization or temperature accuracy. |
| Acoustic | 802 validation clips, machine 04 | Accuracy **12.34%**; balanced accuracy **49.50%** | Validation-based checkpoint selection did not produce useful cross-machine classification. |
| Acoustic | 1,138 test clips, machine 06 | Accuracy **10.46%**; balanced accuracy **50.82%**; anomaly recall **100.00%**; anomaly precision **9.10%**; ROC-AUC **0.6563** | 1,019 normal clips falsely flagged anomalous, 17 correctly normal, and all 102 anomalous clips detected. Experimental, not deployable. |

Balanced accuracy averages class recalls, giving classes equal weight despite
imbalance. mAP evaluates detection boxes across confidence/overlap thresholds;
it is not the percentage of correctly read gauge values. ROC-AUC measures ranking
across thresholds, not accuracy at the deployed decision threshold. Acoustic
evaluation uses argmax; inference has separate review/abstention thresholds.

The saved best epochs are corrosion 11, thermal 6, and acoustic 15. These are
checkpoint-selection epochs, not necessarily total training duration. The gauge
run reported 80 completed training epochs.

## Not Implemented or Not Yet Trained

| Capability | Status / missing work |
| --- | --- |
| Multi-dial electricity-meter reading | No trained model or local training component. [UFPR-ADMR-v2](https://github.com/gabriel-salomon/ufpr-admr-v2-dataset) was proposed but **not used**. Access requires an institution-authorized signed agreement; the provider does not accept student/faculty signatures alone. Its advertised 3,000/1,000/1,000 split is 60%/20%/20%, not data we have trained on. |
| Larger YOLO11m gauge checkpoint | Training support and initialization exist locally, but no final trained YOLO11m checkpoint is registered. The published gauge model is YOLO11n. |
| General, automatically calibrated numeric gauge reading | A manual-calibration prototype exists, but no general scale/unit recognition model, supervised needle-tip model, or independent numeric-accuracy result exists. |
| Full-scene electrical asset and broken-component detection | Not trained. InsPLAD use is limited to yoke-suspension normal/corrosion crops; it does not cover every electrical asset or defect category. |
| Corrosion localization and severity | No defect pixel/box localization or validated severity model. The manually supplied asset ROI is not a predicted corrosion region. |
| Thermal temperature, fault localization, and severity | No calibrated temperature measurement, fault-localization model, or validated severity model. Thermal inference currently handles still thermograms, not a thermal-video pipeline. |
| Acoustic fan, valve, or slide-rail models | Not trained; only the pump subset was used. No specific acoustic fault-subtype classifier or normal-only anomaly detector is implemented. |

Dashboard integration and physical robot operation are outside these model
artifacts. None of the four checkpoints supplies validated hazard severity or
autonomous maintenance decisions. Unsupported inputs should be rejected or
marked for review rather than assigned invented readings or safety claims.

## Checkpoint and Evidence References

The [model registry](../models/registry.json) is authoritative for paths, hashes,
class order, and publication status. The four saved models are:

- Gauge: `models/gauge/yolo11n-best.pt`;
  [metadata](../models/gauge/metadata.json).
- Corrosion: `models/corrosion/yoke-suspension/corrosion_20261010_212044/model.pt`;
  [metadata](../models/corrosion/yoke-suspension/corrosion_20261010_212044/metadata.json).
- Thermal: `models/thermal/induction-motor/thermal_resnet18_20261010_220345/model.pt`;
  [metadata](../models/thermal/induction-motor/thermal_resnet18_20261010_220345/metadata.json).
- Acoustic: `models/acoustic/pump/acoustic_resnet18_20261010_224835/model.pt`;
  [metadata and test report](../models/acoustic/pump/acoustic_resnet18_20261010_224835/metadata.json).

Split counts come from each local training component's
`reports/dataset-audit.json`: `gauge-training/`, `inspection-training/`,
`thermal-training/`, and `acoustic-training/`. Dataset preparation and inference
code live in those local components; the model-only publication does not include
their datasets, environments, or training runs. The numerical performance table
uses the imported checkpoint metadata, not smoke-test scores.
