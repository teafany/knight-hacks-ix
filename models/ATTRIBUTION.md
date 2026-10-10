# Upstream Attribution

These checkpoints are user-trained inspection prototypes, not endorsed by the
upstream authors. Model publication does not establish commercial-use clearance.
No physical robot was used. This directory does not include training images.

## Gauge Detector

YOLO11 by Glenn Jocher and Jing Qiu (2024),
https://github.com/ultralytics/ultralytics . Initialization: official YOLO11n
COCO-pretrained weights, https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt .
Ultralytics publishes AGPL-3.0 and alternative Enterprise terms. No Enterprise
license is bundled or asserted. Original AGPL text is retained in `licenses/`.
https://docs.ultralytics.com/models/yolo11/ .

Training images: Analog Gauge Meter by Roboflow workspace yolo-lxxyl, version 13
(v06-crop), https://universe.roboflow.com/yolo-lxxyl/analog-gauge-meter/dataset/13 .
The downloaded archive declares CC BY 4.0 and identifies its contributor as
"a Roboflow user". Original dataset attribution and license are retained in
`licenses/`. The trained gauge detector does not independently establish numeric
reading accuracy. Its Needle label encloses the whole pointer and counterweight.

## Corrosion Classifier

Training images: Vieira-e-Silva, Felix, Simoes and Teichrieb, *InsPLAD: A Dataset
and Benchmark for Power Line Asset Inspection in UAV Images*, v1,
DOI 10.17632/5n3fjgvfyz.1,
https://data.mendeley.com/datasets/5n3fjgvfyz/1 and
https://github.com/andreluizbvs/InsPLAD . Dataset license: CC BY-NC 3.0,
https://creativecommons.org/licenses/by-nc/3.0/ . Do not assume commercial rights.

Selected yoke-suspension image-level good/rust labels were mapped to
normal/corrosion. The train split was retained. 484 validation images sharing
training source frames or exact images were quarantined. Final validation counts
are 5,261 normal and 17 corrosion crops; no independent test is available.

Architecture/initialization: torchvision ResNet18, ImageNet-pretrained weights
from https://download.pytorch.org/models/resnet18-f37072fd.pth .
Torchvision code BSD-3-Clause notice is retained in `licenses/`; this is not a
blanket license for underlying ImageNet data or for these fine-tuned weights.
https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.resnet18.html .
No indoor-plant, severity or defect-localization validation is asserted.

## Thermal Classifier (After Import)

Thermal training is prepared locally; check `registry.json` to determine whether
a final checkpoint has actually been imported. Dataset: Mohamad Najafi, Yasser
Baleghi and Seyyed Mehdi Mirimani, *Thermal image of equipment (Induction Motor) +
40 Ground Truths added*, v3, DOI 10.17632/m4sbt8hbvk.3,
https://data.mendeley.com/datasets/m4sbt8hbvk/3 . License: CC BY 4.0,
https://creativecommons.org/licenses/by/4.0/ . Related paper: Najafi, Baleghi,
Gholamian and Mirimani, *Fault Diagnosis of Electrical Equipment through Thermal
Imaging and Interpretable Machine Learning Applied on a Newly-introduced Dataset*,
ICSPIS 2020, DOI 10.1109/ICSPIS51611.2020.9349599.

Changes: one exact duplicate removed; blocked within-condition train/validation
split with three-frame gaps. Validation shares the laboratory image sequences;
no independent motor/camera/session test is available. The classifier recognizes
eleven experiment condition patterns, not radiometric temperature or severity.
The 40 region annotations are not independent fault masks or test images.
Architecture/initialization uses the same torchvision ResNet18/ImageNet upstream
sources and notices listed above. No commercial-use clearance is asserted.

## Acoustic Classifier (After Import)

Check `registry.json` for actual checkpoint availability. Training source:
Harsh Purohit, Ryo Tanabe, Kenji Ichige, Takashi Endo, Yuki Nikaido, Kaori Suefusa
and Yohei Kawaguchi (Hitachi, Ltd.), MIMII Dataset, public 1.0, 2019,
DOI 10.5281/zenodo.3384388, https://zenodo.org/records/3384388 . Paper:
https://arxiv.org/abs/1909.09347 . Dataset CC BY-SA 4.0:
https://creativecommons.org/licenses/by-sa/4.0/ . Retain attribution and
ShareAlike obligations for covered adaptations; no blanket trained-model license
or commercial-use clearance is asserted.

Changes: 6 dB pump subset only, channel zero retained as mono WAV; custom
supervised machine-ID splits (train 00/02, validation 04, test 06). This is not
the original normal-only unsupervised MIMII benchmark. An independent-test flag
in the acoustic registry specifically means a held-out machine-ID test, not
independent background-noise/session/site collection. See the checkpoint-bound
test report in metadata for actual performance; no defect subtype or severity
is inferred. Initialization is the same official torchvision/ImageNet ResNet18
listed above, not audio-pretrained weights. No plant-wide validation is asserted.
